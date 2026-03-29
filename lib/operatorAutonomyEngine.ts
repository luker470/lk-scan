import type { Firestore } from "firebase-admin/firestore";
import { enqueueOperatorTask } from "@/lib/operatorQueue";
import {
  readOperatorMemory,
  updateAutonomyMemory,
  registerProposalGenerated,
  registerProposalApplied,
  upsertRecurringProblem,
  buildOperatorMemoryInsights,
  appendOperatorMemoryEvent,
} from "@/lib/operatorMemory";

export type BuildDecisionInput = {
  health: "healthy" | "warning" | "critical";
  totalBrokenChapters: number;
  unresolvedIncidents: number;
  queueQueued: number;
  queueCritical: number;
  automationNot100: boolean;
};

export type DecisionMode =
  | "observation"
  | "maintenance"
  | "stabilization"
  | "growth"
  | "sovereign";

export type AutonomousDecisionAction = {
  type: string;
  priority: "low" | "normal" | "high" | "critical";
  reason: string;
  safeToAutoApply: boolean;
  requiresApproval: boolean;
  scope?: "operational" | "structural" | "content" | "ux" | "catalog";
  dedupeKey?: string;
};

export type AutonomousDecision = {
  mode: DecisionMode;
  confidence: number;
  summary: string;
  actions: AutonomousDecisionAction[];
  highlights: string[];
  warnings: string[];
  recommendations: string[];
  approvalRequiredActions: AutonomousDecisionAction[];
  autoApplicableActions: AutonomousDecisionAction[];
};

export type ApplyDecisionContext = {
  totalBrokenChapters: number;
  queueCritical: number;
  queueQueued: number;
  automationNot100: boolean;
};

export type AppliedDecisionItem = {
  actionType: string;
  queuedTaskType?: string;
  created?: boolean;
  skipped?: boolean;
  reason?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pushUnique(target: string[], value: string) {
  const text = normalizeText(value);
  if (!text) return;
  if (!target.includes(text)) target.push(text);
}

function buildSafeAction(
  type: string,
  priority: "low" | "normal" | "high" | "critical",
  reason: string,
  scope: AutonomousDecisionAction["scope"] = "operational",
  dedupeKey?: string
): AutonomousDecisionAction {
  return {
    type,
    priority,
    reason,
    safeToAutoApply: true,
    requiresApproval: false,
    scope,
    dedupeKey,
  };
}

function buildApprovalAction(
  type: string,
  priority: "low" | "normal" | "high" | "critical",
  reason: string,
  scope: AutonomousDecisionAction["scope"],
  dedupeKey?: string
): AutonomousDecisionAction {
  return {
    type,
    priority,
    reason,
    safeToAutoApply: false,
    requiresApproval: true,
    scope,
    dedupeKey,
  };
}

function dedupeActions(actions: AutonomousDecisionAction[]) {
  const seen = new Set<string>();
  const out: AutonomousDecisionAction[] = [];

  for (const action of actions) {
    const key = [
      normalizeText(action.type),
      normalizeText(action.priority),
      normalizeText(action.reason),
      normalizeText(action.scope),
      String(!!action.safeToAutoApply),
      String(!!action.requiresApproval),
      normalizeText(action.dedupeKey),
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }

  return out;
}

function sortActions(actions: AutonomousDecisionAction[]) {
  const priorityWeight = (priority: string) =>
    priority === "critical"
      ? 4
      : priority === "high"
      ? 3
      : priority === "normal"
      ? 2
      : 1;

  return [...actions].sort((a, b) => {
    const p = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (p !== 0) return p;

    if (a.requiresApproval !== b.requiresApproval) {
      return a.requiresApproval ? 1 : -1;
    }

    return a.type.localeCompare(b.type);
  });
}

function toDateMs(value: unknown) {
  const text = normalizeText(value);
  if (!text) return 0;
  const ms = new Date(text).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function ageHours(value: unknown) {
  const ms = toDateMs(value);
  if (!ms) return 999999;
  return Math.max(0, (Date.now() - ms) / 3_600_000);
}

function ageDays(value: unknown) {
  return ageHours(value) / 24;
}

function computeRecencyWeight(value: unknown, windows = { fresh: 24, recent: 72, warm: 168 }) {
  const hours = ageHours(value);

  if (hours <= windows.fresh) return 1;
  if (hours <= windows.recent) return 0.7;
  if (hours <= windows.warm) return 0.45;
  return 0.2;
}

function decideMode(input: BuildDecisionInput): DecisionMode {
  if (input.health === "critical") return "stabilization";
  if (input.queueCritical > 0) return "stabilization";
  if (input.totalBrokenChapters > 0) return "maintenance";
  if (input.automationNot100) return "maintenance";
  if (input.unresolvedIncidents > 0) return "maintenance";
  if (input.health === "warning") return "growth";
  return "sovereign";
}

function buildBaseConfidence(input: BuildDecisionInput) {
  let confidence = 60;

  if (input.health === "healthy") confidence += 16;
  if (input.health === "warning") confidence -= 8;
  if (input.health === "critical") confidence -= 30;

  if (input.queueQueued === 0) confidence += 6;
  if (input.queueQueued > 10) confidence -= 8;
  if (input.queueQueued > 30) confidence -= 10;

  if (input.queueCritical > 0) confidence -= 18;
  if (input.queueCritical > 3) confidence -= 10;

  if (input.unresolvedIncidents > 0) {
    confidence -= Math.min(20, input.unresolvedIncidents * 2);
  }

  if (input.totalBrokenChapters > 0) {
    confidence -= Math.min(22, input.totalBrokenChapters);
  }

  if (input.totalBrokenChapters > 20) {
    confidence -= 10;
  }

  if (input.automationNot100) confidence -= 10;

  return clamp(confidence, 10, 100);
}

function mapPriorityForQueue(
  priority: "low" | "normal" | "high" | "critical"
): "low" | "normal" | "high" | "critical" {
  return priority;
}

function chooseEscalatedMode(params: {
  baseMode: DecisionMode;
  confidence: number;
  recentFailurePressure: number;
  recurringPressure: number;
  input: BuildDecisionInput;
}) {
  let mode = params.baseMode;

  if (
    params.input.health === "critical" ||
    params.input.queueCritical > 0 ||
    params.recentFailurePressure >= 20
  ) {
    mode = "stabilization";
  } else if (
    params.input.totalBrokenChapters > 0 ||
    params.input.unresolvedIncidents > 0 ||
    params.input.automationNot100 ||
    params.recurringPressure >= 18
  ) {
    mode = "maintenance";
  } else if (
    params.confidence >= 78 &&
    params.input.health === "healthy" &&
    params.input.queueQueued <= 6 &&
    params.input.queueCritical === 0 &&
    params.input.unresolvedIncidents === 0 &&
    !params.input.automationNot100
  ) {
    mode = "sovereign";
  } else if (
  params.confidence >= 58 &&
  (params.input.health === "healthy" || params.input.health === "warning")
) {
  mode = "growth";
} else {
    mode = "observation";
  }

  return mode;
}

function buildDecisionSummary(params: {
  mode: DecisionMode;
  input: BuildDecisionInput;
  confidence: number;
  autoApplicableActions: number;
  approvalRequiredActions: number;
  healthSignals: string[];
}) {
  const lines = [
    `Modo atual: ${params.mode.toUpperCase()}`,
    `Saúde: ${params.input.health}`,
    `Confiança: ${params.confidence}`,
    `Fila: ${params.input.queueQueued} pendente(s), ${params.input.queueCritical} crítica(s)`,
    `Incidentes: ${params.input.unresolvedIncidents}`,
    `Quebrados: ${params.input.totalBrokenChapters}`,
    `Automação 100%: ${params.input.automationNot100 ? "não" : "sim"}`,
    `Ações autoaplicáveis: ${params.autoApplicableActions}`,
    `Ações que exigem aprovação: ${params.approvalRequiredActions}`,
  ];

  if (params.healthSignals.length > 0) {
    lines.push(`Sinais-chave: ${params.healthSignals.slice(0, 4).join(" | ")}`);
  }

  return lines.join("\n");
}

export async function buildAutonomousDecision(
  db: Firestore,
  input: BuildDecisionInput
): Promise<AutonomousDecision> {
  const [memory, memoryInsights] = await Promise.all([
    readOperatorMemory(db),
    buildOperatorMemoryInsights(db).catch(() => null),
  ]);

  const baseMode = decideMode(input);
  let confidence = buildBaseConfidence(input);

  const highlights: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];
  const actions: AutonomousDecisionAction[] = [];

  const totalRuns = safeNumber(memory.executionMemory.totalRuns, 0);
  const successfulRuns = safeNumber(memory.executionMemory.successfulRuns, 0);
  const failedRuns = safeNumber(memory.executionMemory.failedRuns, 0);
  const successRate =
    totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;

  const recurringCritical = memory.recurringProblems.filter(
    (item) => item.severity === "critical"
  ).length;

  const recurringHigh = memory.recurringProblems.filter(
    (item) => item.severity === "high" || item.severity === "critical"
  ).length;

  const recentRecurringHigh = memory.recurringProblems.filter((item) => {
    const sev = item.severity === "high" || item.severity === "critical";
    const recent = ageDays(item.lastSeenAt) <= 7;
    return sev && recent;
  }).length;

  const riskySources = Object.values(memory.sourceMemory).filter(
    (item) => item.health === "critical" || item.recentFailures >= 3
  );

  const warningSources = Object.values(memory.sourceMemory).filter(
    (item) => item.health === "warning"
  );

  const trustedSources = Object.values(memory.sourceMemory).filter(
    (item) => item.health === "healthy" && item.trustScore >= 70
  );

  const freshRiskySources = riskySources.filter(
    (item) => ageDays(item.updatedAt) <= 3 || ageDays(item.lastFailureAt) <= 3
  );

  const avgCycleDurationMs = safeNumber(
    memory.executionMemory.avgCycleDurationMs,
    0
  );

  const autonomyConfidence = safeNumber(
    memory.autonomyMemory.confidenceScore,
    0
  );

  const canSafelyEscalate = !!memory.autonomyMemory.canSafelyEscalate;

  const proposalMemory = memory.proposalMemory;
  const approvalMemory = memory.approvalMemory;

  const recentEvents = Array.isArray(memoryInsights?.latestEvents)
    ? memoryInsights!.latestEvents
    : [];

  const recentFailures = recentEvents.filter((item: any) => !item?.success);
  const recentSuccesses = recentEvents.filter((item: any) => !!item?.success);

  const recentFailurePressure = recentFailures.reduce((acc: number, item: any) => {
    const impact = Math.abs(safeNumber(item?.impactScore, 0));
    const weight = computeRecencyWeight(item?.createdAt);
    return acc + impact * weight;
  }, 0);

  const recentSuccessRelief = recentSuccesses.reduce((acc: number, item: any) => {
    const impact = safeNumber(item?.impactScore, 0);
    const weight = computeRecencyWeight(item?.createdAt);
    return acc + impact * weight;
  }, 0);

  const recurringPressure =
    recurringCritical * 12 +
    recurringHigh * 5 +
    recentRecurringHigh * 4;

  if (successRate >= 85) confidence += 8;
  if (successRate >= 92) confidence += 4;
  if (successRate > 0 && successRate < 60) confidence -= 10;
  if (successRate > 0 && successRate < 40) confidence -= 8;

  if (failedRuns > successfulRuns && totalRuns >= 4) confidence -= 8;

  if (recurringHigh >= 3) confidence -= 10;
  if (recurringHigh >= 8) confidence -= 8;
  if (recurringCritical > 0) confidence -= 10;

  if (recentRecurringHigh >= 2) confidence -= 6;
  if (freshRiskySources.length >= 2) confidence -= 8;

  if (riskySources.length >= 2) confidence -= 8;
  if (riskySources.length >= 5) confidence -= 8;

  if (warningSources.length >= 4) confidence -= 6;
  if (trustedSources.length >= 3) confidence += 5;

  if (avgCycleDurationMs > 0 && avgCycleDurationMs < 20_000) confidence += 4;
  if (avgCycleDurationMs > 90_000) confidence -= 6;

  if (canSafelyEscalate && autonomyConfidence >= 75) confidence += 4;

  if (memoryInsights?.systemMemoryHealth === "critical") confidence -= 12;
  if (memoryInsights?.systemMemoryHealth === "warning") confidence -= 5;
  if (memoryInsights?.systemMemoryHealth === "healthy") confidence += 3;

  if (
    safeNumber(proposalMemory.totalRejected, 0) >
    safeNumber(proposalMemory.totalApproved, 0) + 5
  ) {
    confidence -= 4;
  }

  if (
    safeNumber(approvalMemory.approved, 0) >
    safeNumber(approvalMemory.rejected, 0) + 5
  ) {
    confidence += 3;
  }

  confidence -= clamp(Math.round(recentFailurePressure / 8), 0, 18);
  confidence += clamp(Math.round(recentSuccessRelief / 12), 0, 10);

  confidence = clamp(confidence, 10, 100);

  const mode = chooseEscalatedMode({
    baseMode,
    confidence,
    recentFailurePressure,
    recurringPressure,
    input,
  });

  pushUnique(highlights, `Modo operacional calculado: ${mode}.`);
  pushUnique(highlights, `Saúde atual do sistema: ${input.health}.`);
  pushUnique(
    highlights,
    `Taxa de sucesso histórica do operador: ${successRate}% em ${totalRuns} execução(ões).`
  );

  if (trustedSources.length > 0) {
    pushUnique(
      highlights,
      `${trustedSources.length} fonte(s) estão em estado saudável e confiável.`
    );
  }

  if (memoryInsights?.systemMemoryHealth) {
    pushUnique(
      highlights,
      `Saúde geral da memória operacional: ${memoryInsights.systemMemoryHealth}.`
    );
  }

  if (recentSuccesses.length >= 4 && recentFailures.length === 0) {
    pushUnique(
      highlights,
      "Os eventos mais recentes indicam estabilidade operacional consistente."
    );
  }

  if (input.totalBrokenChapters > 0) {
    pushUnique(
      warnings,
      `Existem ${input.totalBrokenChapters} capítulo(s) quebrado(s) exigindo recovery e validação.`
    );
  }

  if (input.queueCritical > 0) {
    pushUnique(
      warnings,
      `A fila possui ${input.queueCritical} task(s) crítica(s).`
    );
  }

  if (input.queueQueued > 20) {
    pushUnique(
      warnings,
      `A fila está pesada com ${input.queueQueued} task(s) pendente(s).`
    );
  }

  if (input.unresolvedIncidents > 0) {
    pushUnique(
      warnings,
      `Há ${input.unresolvedIncidents} incidente(s) ainda não resolvido(s).`
    );
  }

  if (input.automationNot100) {
    pushUnique(
      warnings,
      "A automação discovery → importação → validação → recovery ainda não está 100%."
    );
  }

  if (riskySources.length > 0) {
    pushUnique(
      warnings,
      `${riskySources.length} fonte(s) apresentam risco operacional elevado.`
    );
  }

  if (recurringHigh > 0) {
    pushUnique(
      warnings,
      `A memória detecta ${recurringHigh} problema(s) recorrente(s) de severidade alta/crítica.`
    );
  }

  if (recentFailures.length > recentSuccesses.length && recentFailures.length > 0) {
    pushUnique(
      warnings,
      "Os eventos recentes indicam pressão operacional acima do ideal."
    );
  }

  if (canSafelyEscalate && confidence >= 75) {
    pushUnique(
      highlights,
      "A memória histórica indica que a IA pode escalar autonomia com segurança."
    );
  } else {
    pushUnique(
      warnings,
      "A IA ainda deve agir com prudência antes de ampliar a autonomia."
    );
  }

  if (mode === "stabilization") {
    actions.push(
      buildSafeAction(
        "recovery-all",
        "critical",
        "Sistema instável / crítico exige manutenção pesada imediata.",
        "operational",
        "autonomy::recovery-all"
      ),
      buildSafeAction(
        "validate-all",
        "high",
        "Após estabilização, validar capítulos e consistência operacional.",
        "operational",
        "autonomy::validate-all"
      ),
      buildSafeAction(
        "process-queue",
        "high",
        "Fila operacional precisa ser drenada com prioridade.",
        "operational",
        "autonomy::process-queue"
      ),
      buildSafeAction(
        "optimize-system",
        "normal",
        "Reduzir gargalos e recorrência de falhas após estabilização.",
        "operational",
        "autonomy::optimize-system"
      )
    );

    if (input.totalBrokenChapters > 5) {
      actions.push(
        buildSafeAction(
          "recovery-chapter",
          "critical",
          "O volume de capítulos quebrados indica necessidade de foco em recuperação.",
          "operational",
          "autonomy::recovery-chapter"
        )
      );
    }

    pushUnique(
      recommendations,
      "Prioridade máxima em estabilidade: recovery, fila, incidentes e fontes críticas."
    );
  }

  if (mode === "maintenance") {
    if (input.totalBrokenChapters > 0) {
      actions.push(
        buildSafeAction(
          "recovery-chapter",
          "high",
          "Capítulos quebrados detectados exigem ciclo de repair.",
          "operational",
          "autonomy::recovery-chapter"
        )
      );
    }

    if (input.queueQueued > 0) {
      actions.push(
        buildSafeAction(
          "process-queue",
          input.queueQueued > 15 ? "high" : "normal",
          "A fila pendente precisa continuar sendo processada.",
          "operational",
          "autonomy::process-queue"
        )
      );
    }

    if (input.automationNot100) {
      actions.push(
        buildSafeAction(
          "optimize-system",
          "normal",
          "Refinar pipeline automático para reduzir falhas recorrentes.",
          "operational",
          "autonomy::optimize-system"
        )
      );
    }

    if (freshRiskySources.length > 0) {
      actions.push(
        buildSafeAction(
          "source-health-check",
          "high",
          "Fontes com falhas recentes exigem revalidação imediata.",
          "operational",
          "autonomy::source-health-check"
        )
      );
    }

    pushUnique(
      recommendations,
      "Manter ciclo forte de recovery, validação e limpeza de gargalos operacionais."
    );
  }

  if (mode === "growth") {
    actions.push(
      buildSafeAction(
        "optimize-system",
        "low",
        "Refinar performance, previsibilidade e robustez do sistema.",
        "operational",
        "autonomy::optimize-system"
      ),
      buildSafeAction(
        "process-queue",
        "low",
        "Evitar acúmulo desnecessário enquanto o sistema cresce.",
        "operational",
        "autonomy::process-queue"
      ),
      buildApprovalAction(
        "expand-discovery-strategy",
        "normal",
        "A IA recomenda expandir discovery/catalogação de forma mais agressiva.",
        "catalog",
        "autonomy::expand-discovery-strategy"
      ),
      buildApprovalAction(
        "expand-sync-strategy",
        "normal",
        "A IA recomenda ampliar a cobertura de sincronização do catálogo.",
        "catalog",
        "autonomy::expand-sync-strategy"
      )
    );

    pushUnique(
      recommendations,
      "Com a operação em alerta leve, o foco pode migrar para crescimento controlado."
    );
  }

  if (mode === "sovereign") {
    actions.push(
      buildSafeAction(
        "optimize-system",
        "low",
        "Sistema saudável — otimização contínua.",
        "operational",
        "autonomy::optimize-system"
      ),
      buildSafeAction(
        "process-queue",
        "low",
        "Manter fila limpa e sem acúmulo desnecessário.",
        "operational",
        "autonomy::process-queue"
      ),
      buildSafeAction(
        "source-health-check",
        "low",
        "Monitorar saúde das fontes para preservar estabilidade soberana.",
        "operational",
        "autonomy::source-health-check"
      ),
      buildApprovalAction(
        "propose-catalog-expansion",
        "normal",
        "Sistema apto para expansão de catálogo sob aprovação do usuário.",
        "catalog",
        "autonomy::propose-catalog-expansion"
      ),
      buildApprovalAction(
        "propose-ux-improvements",
        "low",
        "Sistema estável o suficiente para sugerir melhorias visuais/estruturais.",
        "ux",
        "autonomy::propose-ux-improvements"
      )
    );

    pushUnique(
      recommendations,
      "Sistema pronto para operação soberana com manutenção preventiva e expansão contínua."
    );
  }

  if (mode === "observation") {
    actions.push(
      buildSafeAction(
        "process-queue",
        "low",
        "Manter observação ativa da fila e evitar novos gargalos.",
        "operational",
        "autonomy::process-queue"
      )
    );

    pushUnique(
      recommendations,
      "A operação deve observar mais sinais antes de ampliar autonomia ou crescimento."
    );
  }

  if (confidence < 45) {
    pushUnique(
      warnings,
      "A confiança da autonomia está baixa; foco em observação e manutenção segura."
    );
  }

  if (confidence >= 85) {
    pushUnique(
      highlights,
      "A confiança operacional da autonomia está alta no ciclo atual."
    );
  }

  const dedupedActions = sortActions(dedupeActions(actions));
  const autoApplicableActions = dedupedActions.filter(
    (item) => item.safeToAutoApply && !item.requiresApproval
  );
  const approvalRequiredActions = dedupedActions.filter(
    (item) => item.requiresApproval
  );

  const healthSignals = [
    input.health,
    recentFailurePressure > 0 ? `pressão recente ${Math.round(recentFailurePressure)}` : "",
    recurringHigh > 0 ? `recorrências ${recurringHigh}` : "",
    freshRiskySources.length > 0 ? `fontes críticas ${freshRiskySources.length}` : "",
  ].filter(Boolean);

  const summary = buildDecisionSummary({
    mode,
    input,
    confidence,
    autoApplicableActions: autoApplicableActions.length,
    approvalRequiredActions: approvalRequiredActions.length,
    healthSignals,
  });

  await registerProposalGenerated(db, {
    title: `Decisão automática (${mode})`,
    summary,
    decision: "generated",
  });

  await appendOperatorMemoryEvent(db, {
    type: "autonomy-decision-generated",
    success: confidence >= 45,
    impactScore: clamp(Math.round(confidence / 10), -10, 10),
    title: `Autonomia em modo ${mode}`,
    summary,
    context: {
      mode,
      confidence,
      health: input.health,
      totalBrokenChapters: input.totalBrokenChapters,
      unresolvedIncidents: input.unresolvedIncidents,
      queueQueued: input.queueQueued,
      queueCritical: input.queueCritical,
      automationNot100: input.automationNot100,
      actions: dedupedActions.map((item) => ({
        type: item.type,
        priority: item.priority,
        requiresApproval: item.requiresApproval,
      })),
    },
  }).catch(() => null);

  return {
    mode,
    confidence,
    summary,
    actions: dedupedActions,
    highlights,
    warnings,
    recommendations,
    approvalRequiredActions,
    autoApplicableActions,
  };
}

export async function applyAutonomousDecision(
  db: Firestore,
  decision: AutonomousDecision,
  context: ApplyDecisionContext
) {
  const applied: AppliedDecisionItem[] = [];

  for (const action of decision.actions) {
    try {
      if (!action.safeToAutoApply || action.requiresApproval) {
        applied.push({
          actionType: action.type,
          skipped: true,
          reason: "Ação marcada apenas como recomendação/aprovação.",
        });
        continue;
      }

      if (action.type === "recovery-all") {
        const result = await enqueueOperatorTask(db, {
          type: "operator-maintenance",
          priority: mapPriorityForQueue(action.priority),
          title: "Recovery global automático",
          description: action.reason,
          dedupeKey: action.dedupeKey || "autonomy::recovery-all",
          maxAttempts: 3,
          meta: {
            source: "operator-autonomy",
            recoveryAll: true,
            context,
          },
        });

        applied.push({
          actionType: action.type,
          queuedTaskType: "operator-maintenance",
          created: result.created,
        });

        continue;
      }

      if (action.type === "validate-all") {
        const result = await enqueueOperatorTask(db, {
          type: "operator-maintenance",
          priority: mapPriorityForQueue(action.priority),
          title: "Validação global automática",
          description: action.reason,
          dedupeKey: action.dedupeKey || "autonomy::validate-all",
          maxAttempts: 3,
          meta: {
            source: "operator-autonomy",
            validateAll: true,
            context,
          },
        });

        applied.push({
          actionType: action.type,
          queuedTaskType: "operator-maintenance",
          created: result.created,
        });

        continue;
      }

      if (action.type === "process-queue") {
        applied.push({
          actionType: action.type,
          skipped: true,
          reason: "A fila já é processada pelo ciclo principal do operatorCore.",
        });
        continue;
      }

      if (action.type === "recovery-chapter") {
        const result = await enqueueOperatorTask(db, {
          type: "operator-maintenance",
          priority: action.priority === "critical" ? "critical" : "high",
          title: "Recovery orientado pela autonomia",
          description: action.reason,
          dedupeKey: action.dedupeKey || "autonomy::recovery-chapter",
          maxAttempts: 3,
          meta: {
            source: "operator-autonomy",
            focus: "broken-chapters",
            context,
          },
        });

        applied.push({
          actionType: action.type,
          queuedTaskType: "operator-maintenance",
          created: result.created,
        });

        continue;
      }

      if (action.type === "optimize-system") {
        const result = await enqueueOperatorTask(db, {
          type: "operator-maintenance",
          priority: mapPriorityForQueue(action.priority),
          title: "Otimização automática do sistema",
          description: action.reason,
          dedupeKey: action.dedupeKey || "autonomy::optimize-system",
          maxAttempts: 2,
          meta: {
            source: "operator-autonomy",
            optimization: true,
            context,
          },
        });

        applied.push({
          actionType: action.type,
          queuedTaskType: "operator-maintenance",
          created: result.created,
        });

        continue;
      }

      if (action.type === "source-health-check") {
        const result = await enqueueOperatorTask(db, {
          type: "source-health-check",
          priority: mapPriorityForQueue(action.priority),
          title: "Revisão automática da saúde das fontes",
          description: action.reason,
          dedupeKey: action.dedupeKey || "autonomy::source-health-check",
          maxAttempts: 3,
          meta: {
            source: "operator-autonomy",
            context,
          },
        });

        applied.push({
          actionType: action.type,
          queuedTaskType: "source-health-check",
          created: result.created,
        });

        continue;
      }

      applied.push({
        actionType: action.type,
        skipped: true,
        reason: "Ação autônoma ainda não mapeada para autoexecução.",
      });

      await upsertRecurringProblem(db, {
        key: `autonomy::unsupported-action::${normalizeText(action.type)}`,
        title: `Ação autônoma não mapeada: ${normalizeText(action.type)}`,
        type: "operator",
        severity: "warning",
        meta: {
          reason: action.reason,
        },
      });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Erro ao aplicar decisão autônoma.";

      applied.push({
        actionType: action.type,
        skipped: true,
        reason: message,
      });

      await upsertRecurringProblem(db, {
        key: `autonomy::apply-error::${normalizeText(action.type)}`,
        title: `Erro ao aplicar ação autônoma: ${normalizeText(action.type)}`,
        type: "operator",
        severity: "high",
        meta: {
          message,
        },
      });
    }
  }

  await updateAutonomyMemory(db, {
    mode: decision.mode,
    confidenceScore: decision.confidence,
    lastDecisionSummary: decision.summary,
    canSafelyEscalate: decision.confidence >= 75,
  });

  if (applied.some((item) => item.created)) {
    await registerProposalApplied(db, {
      title: `Aplicação automática (${decision.mode})`,
    }).catch(() => null);
  }

  await appendOperatorMemoryEvent(db, {
    type: "autonomy-decision-applied",
    success: true,
    impactScore: clamp(applied.filter((item) => item.created).length * 2, 1, 10),
    title: `Aplicação de autonomia (${decision.mode})`,
    summary: `Aplicadas ${applied.filter((item) => item.created).length} ação(ões) automáticas.`,
    context: {
      mode: decision.mode,
      confidence: decision.confidence,
      context,
      applied,
    },
  }).catch(() => null);

  return {
    ok: true,
    appliedCount: applied.filter((item) => !item.skipped).length,
    applied,
  };
}