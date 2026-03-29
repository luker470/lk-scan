import type { Firestore } from "firebase-admin/firestore";
import type {
  OperatorLearningScore,
  OperatorMetrics,
  OperatorReport,
} from "@/lib/operatorTypes";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dedupeLines(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of items) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }

  return out;
}

function topLearningHosts(learning: OperatorLearningScore[], limit = 3) {
  return learning
    .slice()
    .sort((a, b) => {
      if (b.recommendedPriority !== a.recommendedPriority) {
        return b.recommendedPriority - a.recommendedPriority;
      }
      return b.score - a.score;
    })
    .slice(0, limit);
}

function riskyLearningHosts(learning: OperatorLearningScore[], limit = 3) {
  return learning
    .slice()
    .sort((a, b) => {
      const aRisk =
        safeNumber(a.errorRate, 0) +
        (a.health === "critical" ? 50 : a.health === "warning" ? 20 : 0) -
        safeNumber(a.successRate, 0) * 0.3;

      const bRisk =
        safeNumber(b.errorRate, 0) +
        (b.health === "critical" ? 50 : b.health === "warning" ? 20 : 0) -
        safeNumber(b.successRate, 0) * 0.3;

      return bRisk - aRisk;
    })
    .slice(0, limit);
}

function hasAutoImportRisk(metrics: OperatorMetrics) {
  return (
    (metrics.autoSyncActive > 0 && metrics.last24hImportedChapters === 0) ||
    metrics.sourcesCritical > 0 ||
    metrics.sourcesWarning > 1 ||
    metrics.totalBrokenChapters > 0
  );
}

function buildOperationalHealth(metrics: OperatorMetrics) {
  const broken = safeNumber(metrics.totalBrokenChapters, 0);
  const criticalSources = safeNumber(metrics.sourcesCritical, 0);
  const warningSources = safeNumber(metrics.sourcesWarning, 0);
  const imported24h = safeNumber(metrics.last24hImportedChapters, 0);
  const autoSyncActive = safeNumber(metrics.autoSyncActive, 0);

  if (
    broken > 20 ||
    criticalSources > 0 ||
    (autoSyncActive > 0 && imported24h === 0 && broken > 0)
  ) {
    return "critical" as const;
  }

  if (
    broken > 0 ||
    warningSources > 1 ||
    (autoSyncActive > 0 && imported24h === 0)
  ) {
    return "warning" as const;
  }

  return "healthy" as const;
}

function buildExecutiveSummary(metrics: OperatorMetrics) {
  const health = buildOperationalHealth(metrics);

  if (health === "critical") {
    return "Relatório operacional detectou estado crítico: capítulos quebrados, fontes instáveis ou automação sem progresso recente exigem ação imediata.";
  }

  if (health === "warning") {
    return "Relatório operacional detectou estado de alerta: o site está funcionando, mas ainda existem gargalos em capítulos, fontes ou pipeline automático.";
  }

  return "Relatório operacional detectou estado saudável: catálogo ativo, tráfego presente e automação em condição estável no momento.";
}

function buildSearchText(report: {
  summary: string;
  highlights: string[];
  warnings: string[];
  actions: string[];
  recommendations: string[];
  metrics: OperatorMetrics;
  learning: OperatorLearningScore[];
  meta?: Record<string, unknown>;
}) {
  return [
    report.summary,
    ...report.highlights,
    ...report.warnings,
    ...report.actions,
    ...report.recommendations,
    JSON.stringify(report.metrics || {}),
    JSON.stringify(report.learning || []),
    JSON.stringify(report.meta || {}),
  ]
    .join(" ")
    .toLowerCase();
}

export function createOperatorReport(
  metrics: OperatorMetrics,
  learning: OperatorLearningScore[]
): OperatorReport {
  const highlights: string[] = [];
  const warnings: string[] = [];
  const actions: string[] = [];
  const recommendations: string[] = [];

  const totalMangas = safeNumber(metrics.totalMangas, 0);
  const totalChapters = safeNumber(metrics.totalChapters, 0);
  const totalViews = safeNumber(metrics.totalViews, 0);
  const dayViews = safeNumber(metrics.dayViews, 0);
  const weekViews = safeNumber(metrics.weekViews, 0);
  const monthViews = safeNumber(metrics.monthViews, 0);
  const totalUsers = safeNumber(metrics.totalUsers, 0);
  const totalFavorites = safeNumber(metrics.totalFavorites, 0);
  const totalFollowing = safeNumber(metrics.totalFollowing, 0);
  const totalHistoryEntries = safeNumber(metrics.totalHistoryEntries, 0);
  const totalBrokenChapters = safeNumber(metrics.totalBrokenChapters, 0);
  const autoSyncActive = safeNumber(metrics.autoSyncActive, 0);
  const sourcesHealthy = safeNumber(metrics.sourcesHealthy, 0);
  const sourcesWarning = safeNumber(metrics.sourcesWarning, 0);
  const sourcesCritical = safeNumber(metrics.sourcesCritical, 0);
  const last24hImportedChapters = safeNumber(metrics.last24hImportedChapters, 0);
  const last24hIncidents = safeNumber(metrics.last24hIncidents, 0);

  const health = buildOperationalHealth(metrics);
  const autoImportRisk = hasAutoImportRisk(metrics);

  highlights.push(
    `O site está com ${totalMangas} mangás e ${totalChapters} capítulos cadastrados.`
  );

  highlights.push(
    `${totalViews.toLocaleString()} views totais já foram registradas.`
  );

  highlights.push(
    `Tráfego recente: ${dayViews.toLocaleString()} no dia, ${weekViews.toLocaleString()} na semana e ${monthViews.toLocaleString()} no mês.`
  );

  highlights.push(
    `${last24hImportedChapters} capítulos foram atualizados/importados nas últimas 24 horas.`
  );

  highlights.push(
    `${totalUsers} usuários, ${totalFavorites} favoritos, ${totalFollowing} seguindo e ${totalHistoryEntries} registros de histórico privado.`
  );

  highlights.push(
    `Saúde operacional estimada do relatório: ${health}.`
  );

  if (sourcesHealthy > 0) {
    highlights.push(
      `${sourcesHealthy} fontes estão saudáveis no momento.`
    );
  }

  if (totalBrokenChapters > 0) {
    warnings.push(
      `${totalBrokenChapters} capítulos estão com páginas zeradas ou suspeitas.`
    );
    recommendations.push(
      "Priorizar recovery automático e fallback para capítulos com pagesCount 0."
    );
    actions.push(
      "Executar recovery, validação e reimportação seletiva nos capítulos suspeitos."
    );
  }

  if (sourcesCritical > 0) {
    warnings.push(`${sourcesCritical} fontes estão em estado crítico.`);
    recommendations.push(
      "Reduzir prioridade das fontes críticas e reforçar hosts saudáveis."
    );
  }

  if (sourcesWarning > 0) {
    warnings.push(`${sourcesWarning} fontes estão em alerta.`);
  }

  if (last24hIncidents > 0) {
    warnings.push(
      `${last24hIncidents} incidentes foram abertos nas últimas 24 horas.`
    );
  }

  if (autoSyncActive > 0) {
    actions.push(`${autoSyncActive} mangás estão com auto sync ativo.`);
  }

  if (totalFollowing > 0) {
    recommendations.push(
      "Aumentar a prioridade de sync de obras mais seguidas pelos usuários."
    );
  }

  if (totalFavorites > 0) {
    recommendations.push(
      "Usar favoritos e histórico para ranquear prioridade operacional e editorial."
    );
  }

  if (dayViews > 0 || weekViews > 0 || monthViews > 0) {
    actions.push(
      "Cruzar tráfego recente com qualidade dos capítulos para reduzir abandono na leitura."
    );
  }

  if (autoImportRisk) {
    warnings.push(
      "A descoberta/importação automática de mangás e capítulos ainda não está 100% confiável."
    );

    recommendations.push(
      "Reforçar o pipeline automático para identificar obra, capítulos, páginas e fallback de fonte sem depender de ação manual."
    );

    recommendations.push(
      "Adicionar recovery pós-importação para revalidar capítulos recém-importados e corrigir automaticamente falhas de parser."
    );

    actions.push(
      "O operador deve tratar descoberta, identificação, importação, validação e correção como um único fluxo automático."
    );
  }

  if (autoSyncActive > 0 && last24hImportedChapters === 0) {
    warnings.push(
      "Há mangás com auto sync ativo, mas nenhum capítulo novo foi importado nas últimas 24 horas."
    );
  }

  const topHosts = topLearningHosts(learning, 3);
  const riskyHosts = riskyLearningHosts(learning, 3);

  if (topHosts.length > 0) {
    actions.push(
      `Fontes mais fortes do momento: ${topHosts.map((item) => item.host).join(", ")}.`
    );
  }

  if (topHosts.some((item) => item.health === "healthy")) {
    recommendations.push(
      "Usar hosts saudáveis com alta prioridade recomendada como rota principal de importação."
    );
  }

  if (riskyHosts.length > 0) {
    warnings.push(
      `Hosts com maior risco recente: ${riskyHosts.map((item) => item.host).join(", ")}.`
    );
  }

  const dedupedHighlights = dedupeLines(highlights);
  const dedupedWarnings = dedupeLines(warnings);
  const dedupedActions = dedupeLines(actions);
  const dedupedRecommendations = dedupeLines(recommendations);

  const meta = {
    health,
    automationNot100: autoImportRisk,
    topHosts: topHosts.map((item) => ({
      host: item.host,
      score: item.score,
      successRate: item.successRate,
      errorRate: item.errorRate,
      health: item.health,
      recommendedPriority: item.recommendedPriority,
    })),
    riskyHosts: riskyHosts.map((item) => ({
      host: item.host,
      score: item.score,
      successRate: item.successRate,
      errorRate: item.errorRate,
      health: item.health,
      recommendedPriority: item.recommendedPriority,
    })),
    generatedBy: "LK AI Operator",
    executiveSummary: buildExecutiveSummary(metrics),
  };

  return {
    generatedAt: new Date(),
    summary:
      "Relatório operacional gerado pelo LK AI Operator com foco em saúde, catálogo, fontes, tráfego, atividade recente, automação e comportamento dos usuários.",
    highlights: dedupedHighlights,
    warnings: dedupedWarnings,
    actions: dedupedActions,
    recommendations: dedupedRecommendations,
    metrics,
    learning,
    meta,
  } as OperatorReport;
}

export async function persistOperatorReport(
  db: Firestore,
  report: OperatorReport
) {
  const payload = {
    ...report,
    generatedAt: report.generatedAt,
    createdAt: new Date(),
    searchText: buildSearchText({
      summary: report.summary,
      highlights: Array.isArray(report.highlights) ? report.highlights : [],
      warnings: Array.isArray(report.warnings) ? report.warnings : [],
      actions: Array.isArray(report.actions) ? report.actions : [],
      recommendations: Array.isArray(report.recommendations)
        ? report.recommendations
        : [],
      metrics: report.metrics,
      learning: Array.isArray(report.learning) ? report.learning : [],
      meta:
        report && typeof (report as any).meta === "object"
          ? ((report as any).meta as Record<string, unknown>)
          : {},
    }),
  };

  const ref = await db
    .collection("system")
    .doc("reports")
    .collection("items")
    .add(payload);

  return {
    id: ref.id,
  };
}