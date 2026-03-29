import type { Firestore } from "firebase-admin/firestore";
import {
  buildKnowledgeFromOperationalState,
  listOperatorKnowledge,
} from "@/lib/operatorKnowledge";
import {
  readOperatorMemory,
  upsertRecurringProblem,
  updateBehaviorMemory,
} from "@/lib/operatorMemory";

export type OperatorDecisionAction =
  | "validate-broken-chapters"
  | "reduce-source-risk"
  | "stabilize-automation"
  | "prioritize-incident-resolution"
  | "clean-queue"
  | "monitor-only"
  | "request-user-approval";

export type OperatorApprovalRequest = {
  type:
    | "ui-change"
    | "layout-change"
    | "reader-change"
    | "new-page"
    | "content-change"
    | "architecture-change"
    | "branding-change"
    | "database-change";
  title: string;
  reason: string;
  impact: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  proposalSummary: string;
  suggestedFiles?: string[];
};

export type OperatorDecisionResult = {
  ok: boolean;
  health: "healthy" | "warning" | "critical";
  mode: "stabilization" | "growth" | "maintenance" | "observation";
  primaryGoal: string;
  autoActions: OperatorDecisionAction[];
  priorities: string[];
  approvalRequests: OperatorApprovalRequest[];
  insights: string[];
  memorySignals: string[];
  knowledgeSignals: string[];
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function healthFromInput(input: {
  totalBrokenChapters?: number;
  sourcesCritical?: number;
  sourcesWarning?: number;
  unresolvedIncidents?: number;
}) {
  if (
    safeNumber(input.totalBrokenChapters) > 15 ||
    safeNumber(input.sourcesCritical) > 0 ||
    safeNumber(input.unresolvedIncidents) > 10
  ) {
    return "critical" as const;
  }

  if (
    safeNumber(input.totalBrokenChapters) > 0 ||
    safeNumber(input.sourcesWarning) > 0 ||
    safeNumber(input.unresolvedIncidents) > 0
  ) {
    return "warning" as const;
  }

  return "healthy" as const;
}

export async function buildOperatorDecision(
  db: Firestore,
  input: {
    totalBrokenChapters?: number;
    sourcesCritical?: number;
    sourcesWarning?: number;
    last24hImportedChapters?: number;
    unresolvedIncidents?: number;
    queueQueued?: number;
    queueCritical?: number;
    queueError?: number;
    commentBugs?: number;
    automationNot100?: boolean;
  }
): Promise<OperatorDecisionResult> {
  const memory = await readOperatorMemory(db);

  await buildKnowledgeFromOperationalState(db, {
    totalBrokenChapters: input.totalBrokenChapters,
    sourcesCritical: input.sourcesCritical,
    sourcesWarning: input.sourcesWarning,
    last24hImportedChapters: input.last24hImportedChapters,
    unresolvedIncidents: input.unresolvedIncidents,
    queueQueued: input.queueQueued,
  });

  const knowledge = await listOperatorKnowledge(db, { limit: 12 });

  const health = healthFromInput(input);

  const autoActions: OperatorDecisionAction[] = [];
  const priorities: string[] = [];
  const approvalRequests: OperatorApprovalRequest[] = [];
  const insights: string[] = [];
  const memorySignals: string[] = [];
  const knowledgeSignals: string[] = [];

  let mode: OperatorDecisionResult["mode"] = "maintenance";
  let primaryGoal = "Manter estabilidade operacional.";

  if (health === "critical") {
    mode = "stabilization";
    primaryGoal = "Estabilizar reader, fontes e automação imediatamente.";
  } else if (health === "warning") {
    mode = "maintenance";
    primaryGoal = "Reduzir riscos antes de ampliar mudanças.";
  } else {
    mode = "growth";
    primaryGoal = "Operação saudável; abrir espaço para evolução controlada.";
  }

  if (safeNumber(input.totalBrokenChapters) > 0) {
    autoActions.push("validate-broken-chapters");
    priorities.push(
      `Validar e recuperar ${safeNumber(input.totalBrokenChapters)} capítulo(s) quebrado(s).`
    );

    await upsertRecurringProblem(db, {
      key: "chapter-broken-pages",
      title: "Capítulos quebrados ou com páginas suspeitas",
      type: "chapter",
      severity:
        safeNumber(input.totalBrokenChapters) > 15 ? "high" : "warning",
      incrementBy: Math.max(1, safeNumber(input.totalBrokenChapters, 1)),
      meta: { totalBrokenChapters: safeNumber(input.totalBrokenChapters) },
    });
  }

  if (safeNumber(input.sourcesCritical) > 0) {
    autoActions.push("reduce-source-risk");
    priorities.push(
      `Reduzir dependência de ${safeNumber(input.sourcesCritical)} fonte(s) crítica(s).`
    );
  }

  if (safeNumber(input.queueCritical) > 0 || safeNumber(input.queueError) > 0) {
    autoActions.push("clean-queue");
    priorities.push(
      `Limpar fila crítica/erro: ${safeNumber(input.queueCritical)} crítica(s) e ${safeNumber(input.queueError)} em erro.`
    );
  }

  if (safeNumber(input.unresolvedIncidents) > 0) {
    autoActions.push("prioritize-incident-resolution");
    priorities.push(
      `Resolver ${safeNumber(input.unresolvedIncidents)} incidente(s) em aberto.`
    );
  }

  if (input.automationNot100 || safeNumber(input.last24hImportedChapters) === 0) {
    autoActions.push("stabilize-automation");
    priorities.push(
      "Estabilizar descoberta/importação automática e reduzir gargalos recentes."
    );
  }

  if (safeNumber(input.commentBugs) > 0) {
    insights.push(
      `A comunidade reportou ${safeNumber(input.commentBugs)} comentário(s) com bug recentemente.`
    );
  }

  if (health === "healthy") {
    approvalRequests.push({
      type: "reader-change",
      title: "Evoluir experiência do leitor",
      reason:
        "Com a operação estável, a IA pode começar a propor melhorias visuais e funcionais no reader.",
      impact: "high",
      risk: "medium",
      proposalSummary:
        "Criar proposta de melhoria da página de capítulo, com mockup e justificativa antes de aplicar.",
      suggestedFiles: [
        "app/manga/[id]/chapter/[chapterId]/ChapterClient.tsx",
        "components/ReaderPro.tsx",
      ],
    });
  }

  if (safeNumber(input.queueQueued) === 0 && health === "healthy") {
    autoActions.push("monitor-only");
    priorities.push("Manter observação contínua e preparar melhorias aprováveis.");
  }

  for (const item of memory.recurringProblems.slice(0, 5)) {
    memorySignals.push(
      `${item.title}: recorrência ${item.count}x, último sinal em ${item.lastSeenAt || "data desconhecida"}.`
    );
  }

  for (const item of knowledge.slice(0, 5)) {
    knowledgeSignals.push(`${item.title} (confiança ${item.confidence}%).`);
  }

  if (health === "critical") {
    insights.push(
      "A IA deve operar em modo de estabilização, evitando propostas estruturais até reduzir risco operacional."
    );
  } else if (health === "warning") {
    insights.push(
      "A IA pode manter manutenção automática, mas deve segurar mudanças estruturais até melhorar a saúde geral."
    );
  } else {
    insights.push(
      "A IA pode continuar operação automática e abrir propostas de melhoria para sua aprovação."
    );
  }

  await updateBehaviorMemory(db, {
    preferredFocus:
      health === "critical"
        ? "stabilization"
        : health === "warning"
        ? "maintenance"
        : "growth",
    lastGlobalHealth: health,
    lastGlobalAssessment: primaryGoal,
    lastGlobalAssessmentAt: new Date().toISOString(),
  });

  return {
    ok: true,
    health,
    mode,
    primaryGoal,
    autoActions: Array.from(new Set(autoActions)),
    priorities: Array.from(new Set(priorities)).slice(0, 8),
    approvalRequests,
    insights,
    memorySignals,
    knowledgeSignals,
  };
}
