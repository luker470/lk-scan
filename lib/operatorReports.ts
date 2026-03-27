import type { Firestore } from "firebase-admin/firestore";
import type {
  OperatorLearningScore,
  OperatorMetrics,
  OperatorReport,
} from "@/lib/operatorTypes";

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

function hasAutoImportRisk(metrics: OperatorMetrics) {
  return (
    (metrics.autoSyncActive > 0 && metrics.last24hImportedChapters === 0) ||
    metrics.sourcesCritical > 0 ||
    metrics.sourcesWarning > 1 ||
    metrics.totalBrokenChapters > 0
  );
}

export function createOperatorReport(
  metrics: OperatorMetrics,
  learning: OperatorLearningScore[]
): OperatorReport {
  const highlights: string[] = [];
  const warnings: string[] = [];
  const actions: string[] = [];
  const recommendations: string[] = [];

  highlights.push(
    `O site está com ${metrics.totalMangas} mangás e ${metrics.totalChapters} capítulos cadastrados.`
  );

  highlights.push(
    `${metrics.totalViews.toLocaleString()} views totais já foram registradas.`
  );

  highlights.push(
    `Tráfego recente: ${metrics.dayViews.toLocaleString()} no dia, ${metrics.weekViews.toLocaleString()} na semana e ${metrics.monthViews.toLocaleString()} no mês.`
  );

  highlights.push(
    `${metrics.last24hImportedChapters} capítulos foram atualizados/importados nas últimas 24 horas.`
  );

  highlights.push(
    `${metrics.totalUsers} usuários, ${metrics.totalFavorites} favoritos, ${metrics.totalFollowing} seguindo e ${metrics.totalHistoryEntries} registros de histórico privado.`
  );

  if (metrics.totalBrokenChapters > 0) {
    warnings.push(
      `${metrics.totalBrokenChapters} capítulos estão com páginas zeradas ou suspeitas.`
    );
    recommendations.push(
      "Priorizar recovery automático e fallback para capítulos com pagesCount 0."
    );
  }

  if (metrics.sourcesCritical > 0) {
    warnings.push(`${metrics.sourcesCritical} fontes estão em estado crítico.`);
    recommendations.push(
      "Reduzir prioridade das fontes críticas e reforçar hosts saudáveis."
    );
  }

  if (metrics.sourcesWarning > 0) {
    warnings.push(`${metrics.sourcesWarning} fontes estão em alerta.`);
  }

  if (metrics.last24hIncidents > 0) {
    warnings.push(
      `${metrics.last24hIncidents} incidentes foram abertos nas últimas 24 horas.`
    );
  }

  if (metrics.autoSyncActive > 0) {
    actions.push(`${metrics.autoSyncActive} mangás estão com auto sync ativo.`);
  }

  if (metrics.totalFollowing > 0) {
    recommendations.push(
      "Aumentar a prioridade de sync de obras mais seguidas pelos usuários."
    );
  }

  if (metrics.totalFavorites > 0) {
    recommendations.push(
      "Usar favoritos e histórico para ranquear prioridade operacional e editorial."
    );
  }

  if (metrics.dayViews > 0 || metrics.weekViews > 0 || metrics.monthViews > 0) {
    actions.push(
      "Cruzar tráfego recente com qualidade dos capítulos para reduzir abandono na leitura."
    );
  }

  if (hasAutoImportRisk(metrics)) {
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

  if (metrics.autoSyncActive > 0 && metrics.last24hImportedChapters === 0) {
    warnings.push(
      "Há mangás com auto sync ativo, mas nenhum capítulo novo foi importado nas últimas 24 horas."
    );
  }

  const topHosts = topLearningHosts(learning, 3);

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

  return {
    generatedAt: new Date(),
    summary:
      "Relatório operacional gerado pelo LK AI Operator com foco em saúde, catálogo, fontes, tráfego, atividade recente, automação e comportamento dos usuários.",
    highlights,
    warnings,
    actions,
    recommendations,
    metrics,
    learning,
  };
}

export async function persistOperatorReport(
  db: Firestore,
  report: OperatorReport
) {
  const ref = await db
    .collection("system")
    .doc("reports")
    .collection("items")
    .add({
      ...report,
      generatedAt: report.generatedAt,
      createdAt: new Date(),
      searchText: [
        report.summary,
        ...report.highlights,
        ...report.warnings,
        ...report.actions,
        ...report.recommendations,
      ]
        .join(" ")
        .toLowerCase(),
    });

  return {
    id: ref.id,
  };
}