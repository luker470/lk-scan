import type {
  OperatorChatAnswer,
  OperatorLearningScore,
  OperatorMetrics,
} from "@/lib/operatorTypes";

type SupportBrainInput = {
  question: string;
  metrics?: Partial<OperatorMetrics> | null;
  learning?: OperatorLearningScore[] | null;
  queue?: {
    total?: number;
    queued?: number;
    running?: number;
    success?: number;
    warning?: number;
    error?: number;
    critical?: number;
    high?: number;
  } | null;
  commentsAi?: {
    total?: number;
    pending?: number;
    review?: number;
    bug?: number;
    question?: number;
    request?: number;
    praise?: number;
    toxic?: number;
    spoiler?: number;
  } | null;
  incidents?: Array<Record<string, any>>;
  reports?: Array<Record<string, any>>;
  actions?: Array<Record<string, any>>;
  center?: {
    summary?: Record<string, any>;
    operator?: Record<string, any>;
  } | null;
};

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function t(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return t(value).toLowerCase();
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function yesNo(value: boolean) {
  return value ? "sim" : "não";
}

function healthLabel(input: SupportBrainInput) {
  const health = lower(
    input.center?.operator?.health ||
      input.center?.summary?.health ||
      "healthy"
  );

  if (health === "critical") return "crítico";
  if (health === "warning") return "em alerta";
  return "saudável";
}

function healthKey(input: SupportBrainInput) {
  const health = lower(
    input.center?.operator?.health ||
      input.center?.summary?.health ||
      "healthy"
  );

  if (health === "critical") return "critical";
  if (health === "warning") return "warning";
  return "healthy";
}

function topSources(learning: OperatorLearningScore[] = [], limit = 5) {
  return [...learning]
    .sort((a, b) => {
      if (b.recommendedPriority !== a.recommendedPriority) {
        return b.recommendedPriority - a.recommendedPriority;
      }
      if (b.score !== a.score) return b.score - a.score;
      return b.successRate - a.successRate;
    })
    .slice(0, limit);
}

function openIncidents(incidents: Array<Record<string, any>> = []) {
  return incidents.filter((item) => !item?.resolved);
}

function latestReport(reports: Array<Record<string, any>> = []) {
  return reports[0] || null;
}

function latestAction(actions: Array<Record<string, any>> = []) {
  return actions[0] || null;
}

function cleanList(values: Array<string | undefined | null | false>) {
  return values
    .map((item) => t(item))
    .filter(Boolean);
}

function pickTopPriorities(input: SupportBrainInput) {
  const metrics = input.metrics || {};
  const queue = input.queue || {};
  const commentsAi = input.commentsAi || {};
  const summary = input.center?.summary || {};

  const priorities: string[] = [];

  if (n(metrics.totalBrokenChapters) > 0) {
    priorities.push(
      `Corrigir ${n(metrics.totalBrokenChapters)} capítulo(s) quebrado(s) com recovery + validate.`
    );
  }

  if (n(metrics.sourcesCritical) > 0) {
    priorities.push(
      `Reduzir dependência de ${n(metrics.sourcesCritical)} fonte(s) crítica(s) e reforçar fallback.`
    );
  }

  if (n(queue.critical) > 0) {
    priorities.push(
      `Resolver ${n(queue.critical)} task(s) crítica(s) da fila antes de rotinas secundárias.`
    );
  }

  if (n(queue.error) > 0) {
    priorities.push(
      `Reprocessar ou investigar ${n(queue.error)} task(s) com erro para evitar requeue infinito.`
    );
  }

  if (n(commentsAi.review) > 0 || n(commentsAi.bug) > 0) {
    priorities.push(
      `Cruzar comentários em revisão/bug com incidentes e reader para cortar suporte manual.`
    );
  }

  if (summary.automationNot100) {
    priorities.push(
      "Fechar o gap da automação de discovery/import para chegar mais perto do modo 100% autônomo."
    );
  }

  if (priorities.length === 0) {
    priorities.push("Manutenção preventiva, otimização do catálogo e melhoria contínua do reader.");
  }

  return priorities.slice(0, 5);
}

function buildOverview(input: SupportBrainInput): OperatorChatAnswer {
  const metrics = input.metrics || {};
  const queue = input.queue || {};
  const commentsAi = input.commentsAi || {};
  const summary = input.center?.summary || {};
  const operator = input.center?.operator || {};
  const report = latestReport(input.reports || []);
  const action = latestAction(input.actions || []);
  const priorities = pickTopPriorities(input);

  const highlights: string[] = [];
  const warnings: string[] = [];
  const recommendations: string[] = [];

  highlights.push(
    `O LK-SCAN está ${healthLabel(input)} com ${n(metrics.totalMangas)} mangás, ${n(metrics.totalChapters)} capítulos e ${n(metrics.totalViews).toLocaleString("pt-BR")} visualizações totais.`
  );

  highlights.push(
    `Nas últimas 24 horas, ${n(metrics.last24hImportedChapters)} capítulos foram importados/atualizados e ${n(metrics.last24hIncidents)} incidente(s) foram registrados.`
  );

  highlights.push(
    `A fila operacional está com ${n(queue.queued)} pendente(s), ${n(queue.running)} executando, ${n(queue.error)} erro(s) e ${n(queue.critical)} task(s) crítica(s).`
  );

  highlights.push(
    `A central de comentários IA está com ${n(commentsAi.pending)} pendente(s), ${n(commentsAi.review)} em revisão e ${n(commentsAi.bug)} comentário(s) classificados como bug.`
  );

  if (report?.summary) {
    highlights.push(`Último relatório: ${t(report.summary)}`);
  }

  if (action?.message) {
    highlights.push(`Última ação operacional: ${t(action.message)}`);
  }

  if (n(metrics.totalBrokenChapters) > 0) {
    warnings.push(
      `${n(metrics.totalBrokenChapters)} capítulo(s) ainda estão quebrados ou com páginas suspeitas.`
    );
  }

  if (n(metrics.sourcesCritical) > 0) {
    warnings.push(
      `${n(metrics.sourcesCritical)} fonte(s) estão em estado crítico e impactam discovery/importação.`
    );
  }

  if (summary.automationNot100) {
    warnings.push(
      "A automação de descoberta/importação ainda não está 100% confiável."
    );
  }

  if (n(queue.critical) > 0) {
    warnings.push(
      `Existem ${n(queue.critical)} task(s) críticas aguardando prioridade máxima.`
    );
  }

  if (n(queue.error) > 0) {
    warnings.push(
      `Existem ${n(queue.error)} task(s) com falha e isso pode travar estabilização automática.`
    );
  }

  if (n(commentsAi.review) > 0) {
    warnings.push(
      `${n(commentsAi.review)} comentário(s) precisam de revisão ou moderação.`
    );
  }

  recommendations.push(
    "Priorizar recovery e validação automática dos capítulos quebrados antes de rotinas secundárias."
  );

  if (n(queue.queued) > 0) {
    recommendations.push(
      "Esvaziar a fila operacional reduz atraso em sync, recovery, comentários e validação."
    );
  }

  if (n(metrics.sourcesCritical) > 0 || n(metrics.sourcesWarning) > 1) {
    recommendations.push(
      "Reforçar hosts saudáveis e reduzir dependência das fontes críticas/em alerta."
    );
  }

  if (n(commentsAi.bug) > 0) {
    recommendations.push(
      "Cruzar comentários de bug com incidentes e fila para detectar problemas recorrentes no reader."
    );
  }

  if (summary.automationNot100) {
    recommendations.push(
      "Usar os sinais de queue + comentários + incidentes para fechar o ciclo de automação total."
    );
  }

  const answer =
    `Resumo operacional do LK AI Operator:\n\n` +
    `• Saúde geral: ${healthLabel(input)}\n` +
    `• Catálogo: ${n(metrics.totalMangas)} mangás e ${n(metrics.totalChapters)} capítulos\n` +
    `• Views: ${n(metrics.dayViews)} hoje, ${n(metrics.weekViews)} na semana e ${n(metrics.monthViews)} no mês\n` +
    `• Fila: ${n(queue.queued)} pendente(s), ${n(queue.running)} executando, ${n(queue.error)} erro(s)\n` +
    `• Comentários IA: ${n(commentsAi.pending)} pendente(s), ${n(commentsAi.review)} em revisão\n` +
    `• Automação 100%: ${yesNo(!summary.automationNot100)}\n` +
    `• Último ciclo: ${t(operator.lastRunReportSummary) || "sem resumo salvo ainda."}\n\n` +
    `Prioridades imediatas:\n${priorities.map((item, index) => `${index + 1}. ${item}`).join("\n")}`;

  return {
    answer,
    highlights,
    warnings,
    recommendations,
  };
}

function buildHealthAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const metrics = input.metrics || {};
  const summary = input.center?.summary || {};
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (n(metrics.totalBrokenChapters) > 0) {
    warnings.push(`${n(metrics.totalBrokenChapters)} capítulo(s) quebrados.`);
  }
  if (n(metrics.sourcesCritical) > 0) {
    warnings.push(`${n(metrics.sourcesCritical)} fonte(s) críticas.`);
  }
  if (n(metrics.last24hIncidents) > 0) {
    warnings.push(`${n(metrics.last24hIncidents)} incidente(s) nas últimas 24h.`);
  }
  if (summary.automationNot100) {
    warnings.push("A automação ainda não está 100% estável.");
  }

  recommendations.push(
    "Cruzar capítulos quebrados + comentários de bug + fila para definir prioridade real."
  );
  recommendations.push(
    "Usar recovery, validate e sync como trilha única de estabilização."
  );

  return {
    answer:
      `Saúde atual do sistema: ${healthLabel(input)}.\n\n` +
      `Capítulos quebrados: ${n(metrics.totalBrokenChapters)}\n` +
      `Fontes saudáveis: ${n(metrics.sourcesHealthy)}\n` +
      `Fontes em alerta: ${n(metrics.sourcesWarning)}\n` +
      `Fontes críticas: ${n(metrics.sourcesCritical)}\n` +
      `Incidentes recentes: ${n(metrics.last24hIncidents)}\n` +
      `Automação 100%: ${yesNo(!summary.automationNot100)}`,
    highlights: [
      `Tráfego recente: ${n(metrics.dayViews)} no dia e ${n(metrics.weekViews)} na semana.`,
      `${n(metrics.last24hImportedChapters)} capítulos importados/atualizados nas últimas 24h.`,
    ],
    warnings,
    recommendations,
  };
}

function buildQueueAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const queue = input.queue || {};
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (n(queue.queued) > 0) {
    warnings.push(`Existem ${n(queue.queued)} task(s) aguardando execução.`);
  }
  if (n(queue.error) > 0) {
    warnings.push(`Existem ${n(queue.error)} task(s) com falha.`);
  }
  if (n(queue.critical) > 0) {
    warnings.push(`Há ${n(queue.critical)} task(s) críticas na fila.`);
  }

  recommendations.push(
    "Dar prioridade para recovery-chapter, validate-chapter e sync-manga de alto impacto."
  );
  recommendations.push(
    "Evitar requeue infinito e recalcular prioridade com base em reincidência."
  );

  return {
    answer:
      `Fila operacional atual:\n\n` +
      `• Total: ${n(queue.total)}\n` +
      `• Pendentes: ${n(queue.queued)}\n` +
      `• Em execução: ${n(queue.running)}\n` +
      `• Sucesso: ${n(queue.success)}\n` +
      `• Warning: ${n(queue.warning)}\n` +
      `• Erro: ${n(queue.error)}\n` +
      `• Críticas: ${n(queue.critical)}\n` +
      `• Alta prioridade: ${n(queue.high)}`,
    highlights: [
      "A fila é o centro operacional do LK AI Operator para recovery, sync, validação e manutenção.",
    ],
    warnings,
    recommendations,
  };
}

function buildSourcesAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const metrics = input.metrics || {};
  const top = topSources(input.learning || [], 5);
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (n(metrics.sourcesCritical) > 0) {
    warnings.push(
      `${n(metrics.sourcesCritical)} fonte(s) críticas precisam de fallback imediato.`
    );
  }
  if (n(metrics.sourcesWarning) > 0) {
    warnings.push(
      `${n(metrics.sourcesWarning)} fonte(s) em alerta merecem revalidação.`
    );
  }

  recommendations.push("Usar hosts saudáveis como rota principal de discovery/import.");
  recommendations.push("Rebaixar automaticamente hosts reincidentes em falha.");

  return {
    answer:
      top.length > 0
        ? `Fontes mais fortes do momento:\n\n${top
            .map(
              (item, index) =>
                `${index + 1}. ${item.host} — score ${item.score}, health ${item.health}, prioridade ${item.recommendedPriority}`
            )
            .join("\n")}\n\nResumo geral: ${n(metrics.sourcesHealthy)} saudáveis, ${n(metrics.sourcesWarning)} em alerta e ${n(metrics.sourcesCritical)} críticas.`
        : "Ainda não há leitura suficiente para ranquear as fontes.",
    highlights: top.map(
      (item) =>
        `${item.host} está com score ${item.score}, taxa de sucesso ${item.successRate}% e saúde ${item.health}.`
    ),
    warnings,
    recommendations,
  };
}

function buildIncidentsAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const open = openIncidents(input.incidents || []);
  const warnings = open
    .slice(0, 6)
    .map((item) => t(item.title))
    .filter(Boolean);

  return {
    answer:
      open.length > 0
        ? `Existem ${open.length} incidente(s) em aberto.\n\n${open
            .slice(0, 6)
            .map((item, index) => `${index + 1}. ${t(item.title)}`)
            .join("\n")}`
        : "Não há incidentes em aberto no momento.",
    highlights: open.length
      ? [
          "Os incidentes ativos devem influenciar fila, recovery, validação e decisões automáticas do operador.",
        ]
      : ["O operador não detectou incidentes abertos no momento."],
    warnings,
    recommendations: open.length
      ? [
          "Priorizar incidentes de capítulos quebrados, fonte crítica e falha de automação.",
        ]
      : ["Manter monitoramento contínuo para detectar novas falhas cedo."],
  };
}

function buildCommentsAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const commentsAi = input.commentsAi || {};
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (n(commentsAi.review) > 0) {
    warnings.push(`${n(commentsAi.review)} comentário(s) precisam de revisão.`);
  }
  if (n(commentsAi.bug) > 0) {
    warnings.push(`${n(commentsAi.bug)} comentário(s) foram classificados como bug.`);
  }
  if (n(commentsAi.toxic) > 0 || n(commentsAi.spoiler) > 0) {
    warnings.push("Há comentários que exigem moderação por toxicidade ou spoiler.");
  }

  recommendations.push(
    "Transformar comentários de bug em sinais operacionais para validar obra, capítulo e reader."
  );
  recommendations.push(
    "Usar comentários de request para influenciar discovery, catálogo e sync prioritário."
  );

  return {
    answer:
      `Situação dos comentários assistidos pela IA:\n\n` +
      `• Total: ${n(commentsAi.total)}\n` +
      `• Pendentes: ${n(commentsAi.pending)}\n` +
      `• Em revisão: ${n(commentsAi.review)}\n` +
      `• Bugs: ${n(commentsAi.bug)}\n` +
      `• Dúvidas: ${n(commentsAi.question)}\n` +
      `• Pedidos: ${n(commentsAi.request)}\n` +
      `• Elogios: ${n(commentsAi.praise)}\n` +
      `• Tóxicos: ${n(commentsAi.toxic)}\n` +
      `• Spoilers: ${n(commentsAi.spoiler)}`,
    highlights: [
      "Os comentários já servem como sensor da comunidade para bugs, dúvidas, pedidos e satisfação.",
    ],
    warnings,
    recommendations,
  };
}

function buildPrioritiesAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const items = pickTopPriorities(input);

  return {
    answer: `Prioridades recomendadas agora:\n\n${items.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
    highlights: [
      "A prioridade ideal combina impacto no leitor, risco operacional e saúde das fontes.",
    ],
    warnings: [],
    recommendations: [
      "Executar o operador após ações críticas para confirmar estabilização.",
    ],
  };
}

function buildAutomationAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const summary = input.center?.summary || {};
  const metrics = input.metrics || {};
  const queue = input.queue || {};
  const warnings = cleanList([
    summary.automationNot100
      ? "A automação ainda não está 100% confiável."
      : "",
    n(metrics.sourcesCritical) > 0
      ? `${n(metrics.sourcesCritical)} fonte(s) críticas ainda afetam o fluxo automático.`
      : "",
    n(queue.error) > 0
      ? `${n(queue.error)} task(s) com erro podem quebrar continuidade da automação.`
      : "",
  ]);

  const recommendations = cleanList([
    "Fechar recovery + validate + sync + discovery em um ciclo único cada vez mais autônomo.",
    n(queue.queued) > 0
      ? "Reduzir acúmulo da fila para a automação reagir mais rápido."
      : "",
    n(metrics.totalBrokenChapters) > 0
      ? "Eliminar capítulos quebrados para reduzir retrabalho manual."
      : "",
  ]);

  return {
    answer:
      `Status da automação:\n\n` +
      `• Automação 100%: ${yesNo(!summary.automationNot100)}\n` +
      `• Capítulos quebrados: ${n(metrics.totalBrokenChapters)}\n` +
      `• Fontes críticas: ${n(metrics.sourcesCritical)}\n` +
      `• Fila com erro: ${n(queue.error)}\n` +
      `• Fila pendente: ${n(queue.queued)}\n` +
      `• Importações nas últimas 24h: ${n(metrics.last24hImportedChapters)}`,
    highlights: [
      "A automação real depende da soma entre discovery, sync, recovery, fila e comentários como sensores do sistema.",
    ],
    warnings,
    recommendations,
  };
}

function buildReaderAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const metrics = input.metrics || {};
  const commentsAi = input.commentsAi || {};
  const warnings = cleanList([
    n(metrics.totalBrokenChapters) > 0
      ? `${n(metrics.totalBrokenChapters)} capítulo(s) estão quebrados ou suspeitos.`
      : "",
    n(commentsAi.bug) > 0
      ? `${n(commentsAi.bug)} comentário(s) sinalizam bugs que podem envolver páginas ou reader.`
      : "",
  ]);

  return {
    answer:
      `Situação do reader e dos capítulos:\n\n` +
      `• Capítulos quebrados: ${n(metrics.totalBrokenChapters)}\n` +
      `• Comentários de bug: ${n(commentsAi.bug)}\n` +
      `• Incidentes recentes: ${n(metrics.last24hIncidents)}\n` +
      `• Importações/atualizações 24h: ${n(metrics.last24hImportedChapters)}`,
    highlights: [
      "Os comentários da comunidade podem virar gatilho automático para validate-chapter e recovery-chapter.",
    ],
    warnings,
    recommendations: [
      "Priorizar dedupe, limpeza de páginas inválidas e validação de capítulos suspeitos.",
      "Usar recovery quando comentários, fila e incidentes convergirem no mesmo capítulo.",
    ],
  };
}

function buildViewsAnswer(input: SupportBrainInput): OperatorChatAnswer {
  const metrics = input.metrics || {};

  return {
    answer:
      `Visão de tráfego atual:\n\n` +
      `• Views hoje: ${n(metrics.dayViews).toLocaleString("pt-BR")}\n` +
      `• Views na semana: ${n(metrics.weekViews).toLocaleString("pt-BR")}\n` +
      `• Views no mês: ${n(metrics.monthViews).toLocaleString("pt-BR")}\n` +
      `• Views totais: ${n(metrics.totalViews).toLocaleString("pt-BR")}`,
    highlights: [
      "O tráfego ajuda a definir quais obras e capítulos merecem sync, cache e recovery prioritário.",
    ],
    warnings: healthKey(input) === "critical"
      ? ["Mesmo com tráfego, a saúde operacional está crítica e pode afetar a leitura."]
      : [],
    recommendations: [
      "Cruzar obras com mais views com comentários de bug para atacar impacto real no usuário.",
    ],
  };
}

export function answerOperatorQuestion(
  input: SupportBrainInput
): OperatorChatAnswer {
  const question = lower(input.question);

  if (
    hasAny(question, [
      "saúde",
      "health",
      "status",
      "como está o sistema",
      "site está bem",
    ])
  ) {
    return buildHealthAnswer(input);
  }

  if (
    hasAny(question, [
      "automação",
      "automation",
      "discovery",
      "importação",
      "importacao",
      "sync automático",
      "sync automatico",
      "100%",
    ])
  ) {
    return buildAutomationAnswer(input);
  }

  if (hasAny(question, ["fila", "queue", "task", "tarefas"])) {
    return buildQueueAnswer(input);
  }

  if (hasAny(question, ["fonte", "fontes", "source", "hosts"])) {
    return buildSourcesAnswer(input);
  }

  if (
    hasAny(question, [
      "incidente",
      "incidentes",
      "alertas",
      "problemas importantes",
    ])
  ) {
    return buildIncidentsAnswer(input);
  }

  if (
    hasAny(question, [
      "comentário",
      "comentarios",
      "comments",
      "comunidade",
      "bugs reportados",
    ])
  ) {
    return buildCommentsAnswer(input);
  }

  if (
    hasAny(question, [
      "reader",
      "capítulo quebrado",
      "capitulos quebrados",
      "páginas",
      "paginas",
      "leitor",
    ])
  ) {
    return buildReaderAnswer(input);
  }

  if (
    hasAny(question, [
      "views",
      "visualizações",
      "visualizacoes",
      "tráfego",
      "trafego",
      "acessos",
    ])
  ) {
    return buildViewsAnswer(input);
  }

  if (
    hasAny(question, [
      "prioridade",
      "prioridades",
      "o que fazer agora",
      "qual o foco agora",
    ])
  ) {
    return buildPrioritiesAnswer(input);
  }

  return buildOverview(input);
}