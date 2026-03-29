import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { buildOperatorStatus } from "@/lib/operatorCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  const uid = req.headers.get("x-user-id");
  return uid === ADMIN_UID;
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    },
  });
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeHealth(value: unknown): "healthy" | "warning" | "critical" {
  const v = normalizeText(value).toLowerCase();
  if (v === "healthy") return "healthy";
  if (v === "warning") return "warning";
  return "critical";
}

function normalizeJobStatus(value: unknown): string {
  const v = normalizeText(value).toLowerCase();
  if (v === "idle" || v === "running" || v === "success" || v === "error") {
    return v;
  }
  return "idle";
}

function toDate(value: any) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    try {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }

  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value?._seconds === "number") {
    const d = new Date(value._seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoOrNull(value: any) {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

function serializeValue(value: any): any {
  if (value == null) return value;

  const d = toDate(value);
  if (d) return d.toISOString();

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = serializeValue(val);
    }
    return out;
  }

  return value;
}

function buildEmptyStatus(error?: string) {
  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    health: "critical" as const,
    currentJobStatus: "error",
    error: normalizeText(error) || "Falha ao carregar status do operador.",
    metrics: {
      totalMangas: 0,
      totalChapters: 0,
      totalViews: 0,
      dayViews: 0,
      weekViews: 0,
      monthViews: 0,
      totalUsers: 0,
      totalFavorites: 0,
      totalFollowing: 0,
      totalHistoryEntries: 0,
      totalBrokenChapters: 0,
      autoSyncActive: 0,
      sourcesHealthy: 0,
      sourcesWarning: 0,
      sourcesCritical: 0,
      last24hImportedChapters: 0,
      last24hIncidents: 0,
    },
    learning: [],
    latestIncidents: [],
    latestActions: [],
    latestReports: [],
    queue: {
      total: 0,
      queued: 0,
      running: 0,
      success: 0,
      warning: 0,
      error: 0,
      critical: 0,
      high: 0,
    },
    queuePreview: [],
    memoryInsights: null,
    recommendations: [
      "Falha ao carregar status do operador. Revisar Firebase Admin, operatorCore e coleções do sistema.",
    ],
    derived: {
      executiveHealth: "critical",
      executiveSummary:
        normalizeText(error) || "Falha ao carregar status do operador.",
      queuePressure: "low",
      incidentPressure: "low",
      sourcePressure: "low",
      trafficLevel: "low",
      growthReadiness: "low",
    },
    center: {
      summary: {
        totalMangas: 0,
        totalChapters: 0,
        totalViews: 0,
        dayViews: 0,
        weekViews: 0,
        monthViews: 0,
        totalBrokenChapters: 0,
        totalUsers: 0,
        totalFavorites: 0,
        totalFollowing: 0,
        totalHistoryEntries: 0,
        autoSyncActive: 0,
        last24hImportedChapters: 0,
        last24hIncidents: 0,
        unresolvedIncidents: 0,
        automationNot100: true,
      },
      operator: {
        health: "critical",
        currentJobStatus: "error",
        lastRunStartedAt: null,
        lastRunFinishedAt: null,
        lastRunError:
          normalizeText(error) || "Falha ao carregar status do operador.",
        lastRunReportSummary: "",
        lastBrokenChaptersCount: 0,
        lastReportId: "",
      },
    },
  };
}

function detectAutomationNot100(
  metrics: Record<string, unknown>,
  rawCenterSummary?: Record<string, unknown>
) {
  if (rawCenterSummary?.automationNot100 === true) return true;

  const totalBrokenChapters = safeNumber(metrics.totalBrokenChapters, 0);
  const sourcesCritical = safeNumber(metrics.sourcesCritical, 0);
  const sourcesWarning = safeNumber(metrics.sourcesWarning, 0);
  const autoSyncActive = safeNumber(metrics.autoSyncActive, 0);
  const imported24h = safeNumber(metrics.last24hImportedChapters, 0);

  return (
    totalBrokenChapters > 0 ||
    sourcesCritical > 0 ||
    sourcesWarning > 1 ||
    (autoSyncActive > 0 && imported24h === 0)
  );
}

function buildDerivedInsights(params: {
  metrics: Record<string, unknown>;
  queue: Record<string, unknown>;
  unresolvedIncidents: number;
  health: "healthy" | "warning" | "critical";
  automationNot100: boolean;
}) {
  const totalViews = safeNumber(params.metrics.totalViews, 0);
  const dayViews = safeNumber(params.metrics.dayViews, 0);
  const weekViews = safeNumber(params.metrics.weekViews, 0);
  const totalBrokenChapters = safeNumber(params.metrics.totalBrokenChapters, 0);
  const sourcesCritical = safeNumber(params.metrics.sourcesCritical, 0);
  const sourcesWarning = safeNumber(params.metrics.sourcesWarning, 0);
  const queueQueued = safeNumber(params.queue.queued, 0);
  const queueCritical = safeNumber(params.queue.critical, 0);
  const queueError = safeNumber(params.queue.error, 0);

  const queuePressure =
    queueCritical > 0 || queueError > 0
      ? "high"
      : queueQueued >= 10
      ? "medium"
      : "low";

  const incidentPressure =
    params.unresolvedIncidents >= 6
      ? "high"
      : params.unresolvedIncidents >= 2
      ? "medium"
      : "low";

  const sourcePressure =
    sourcesCritical > 0 ? "high" : sourcesWarning > 1 ? "medium" : "low";

  const trafficLevel =
    weekViews > 2000 || totalViews > 100000
      ? "high"
      : weekViews > 200 || dayViews > 30
      ? "medium"
      : "low";

  const growthReadiness =
    params.health === "healthy" &&
    !params.automationNot100 &&
    queuePressure === "low" &&
    incidentPressure === "low"
      ? "high"
      : params.health !== "critical" && queuePressure !== "high"
      ? "medium"
      : "low";

  let executiveSummary =
    "Operação estável. O LK AI Operator está apto para manutenção preventiva e crescimento controlado.";

  if (params.health === "critical") {
    executiveSummary =
      "Operação crítica. O foco deve ser estabilização, recovery, fila e correção das fontes/capítulos problemáticos.";
  } else if (params.health === "warning") {
    executiveSummary =
      "Operação em alerta. O site funciona, mas o operador ainda precisa reduzir gargalos de automação, fila e qualidade.";
  } else if (params.automationNot100) {
    executiveSummary =
      "Operação saudável com ressalvas. O sistema roda bem, mas a automação discovery/importação/validação ainda não está 100%.";
  }

  if (totalBrokenChapters > 0 && params.health !== "critical") {
    executiveSummary =
      "Há capítulos problemáticos impactando a estabilidade da leitura. Recovery e validação devem continuar como prioridade.";
  }

  return {
    executiveHealth: params.health,
    executiveSummary,
    queuePressure,
    incidentPressure,
    sourcePressure,
    trafficLevel,
    growthReadiness,
  };
}

function buildSmartRecommendations(params: {
  rawRecommendations: string[];
  metrics: Record<string, unknown>;
  queue: Record<string, unknown>;
  unresolvedIncidents: number;
  automationNot100: boolean;
}) {
  const recs = [...params.rawRecommendations];

  const totalBrokenChapters = safeNumber(params.metrics.totalBrokenChapters, 0);
  const sourcesCritical = safeNumber(params.metrics.sourcesCritical, 0);
  const sourcesWarning = safeNumber(params.metrics.sourcesWarning, 0);
  const autoSyncActive = safeNumber(params.metrics.autoSyncActive, 0);
  const imported24h = safeNumber(params.metrics.last24hImportedChapters, 0);
  const totalFollowing = safeNumber(params.metrics.totalFollowing, 0);
  const totalFavorites = safeNumber(params.metrics.totalFavorites, 0);
  const queueQueued = safeNumber(params.queue.queued, 0);
  const queueCritical = safeNumber(params.queue.critical, 0);
  const queueError = safeNumber(params.queue.error, 0);

  if (totalBrokenChapters > 0) {
    recs.push(
      `Executar recovery e validação contínua para ${totalBrokenChapters} capítulo(s) problemático(s).`
    );
  }

  if (sourcesCritical > 0) {
    recs.push(
      `Reduzir prioridade de ${sourcesCritical} fonte(s) crítica(s) e reforçar fallback de hosts saudáveis.`
    );
  }

  if (sourcesWarning > 1) {
    recs.push(
      `Monitorar ${sourcesWarning} fonte(s) em alerta para evitar degradação do pipeline automático.`
    );
  }

  if (autoSyncActive > 0 && imported24h === 0) {
    recs.push(
      "Há auto sync ativo sem capítulos importados nas últimas 24h; revisar parser, discovery e source resolution."
    );
  }

  if (queueCritical > 0 || queueError > 0) {
    recs.push(
      `Limpar a fila crítica/erro (${queueCritical} crítica(s), ${queueError} com erro) para reduzir acúmulo operacional.`
    );
  } else if (queueQueued >= 10) {
    recs.push(
      `A fila possui ${queueQueued} task(s) pendente(s); manter drenagem constante para evitar backlog.`
    );
  }

  if (params.unresolvedIncidents > 0) {
    recs.push(
      `Resolver ${params.unresolvedIncidents} incidente(s) em aberto para estabilizar o ambiente.`
    );
  }

  if (totalFollowing > 0 || totalFavorites > 0) {
    recs.push(
      "Usar favoritos, seguindo e histórico para priorizar sync, correções e expansão do catálogo."
    );
  }

  if (!params.automationNot100) {
    recs.push(
      "Com a operação estável, focar em crescimento controlado, discovery qualificado e manutenção preventiva."
    );
  }

  return [...new Set(recs.map((item) => normalizeText(item)).filter(Boolean))].slice(
    0,
    8
  );
}

function normalizeStatusPayload(raw: any) {
  const metrics = raw?.metrics || {};
  const queue = raw?.queue || {};
  const centerSummary = raw?.center?.summary || {};
  const centerOperator = raw?.center?.operator || {};
  const memoryInsights = raw?.memoryInsights || null;

  const health = normalizeHealth(raw?.health);
  const unresolvedIncidents =
    safeNumber(centerSummary?.unresolvedIncidents, 0) ||
    safeArray(raw?.latestIncidents).filter((item: any) => !item?.resolved).length;

  const automationNot100 = detectAutomationNot100(metrics, centerSummary);

  const recommendations = safeArray<string>(raw?.recommendations);
  const normalizedRecommendations = buildSmartRecommendations({
    rawRecommendations: recommendations.length
      ? recommendations
      : [
          automationNot100
            ? "A automação ainda não está 100%; manter foco em discovery, importação, validação e recovery."
            : "Operação estável. Foco em manutenção preventiva e crescimento controlado.",
        ],
    metrics,
    queue,
    unresolvedIncidents,
    automationNot100,
  });

  const derived = buildDerivedInsights({
    metrics,
    queue,
    unresolvedIncidents,
    health,
    automationNot100,
  });

  return {
    ok: !!raw?.ok,
    generatedAt: raw?.generatedAt || new Date().toISOString(),
    health,
    currentJobStatus: normalizeJobStatus(raw?.currentJobStatus),
    error: normalizeText(raw?.error),
    metrics: {
      totalMangas: safeNumber(metrics.totalMangas, 0),
      totalChapters: safeNumber(metrics.totalChapters, 0),
      totalViews: safeNumber(metrics.totalViews, 0),
      dayViews: safeNumber(metrics.dayViews, 0),
      weekViews: safeNumber(metrics.weekViews, 0),
      monthViews: safeNumber(metrics.monthViews, 0),
      totalUsers: safeNumber(metrics.totalUsers, 0),
      totalFavorites: safeNumber(metrics.totalFavorites, 0),
      totalFollowing: safeNumber(metrics.totalFollowing, 0),
      totalHistoryEntries: safeNumber(metrics.totalHistoryEntries, 0),
      totalBrokenChapters: safeNumber(metrics.totalBrokenChapters, 0),
      autoSyncActive: safeNumber(metrics.autoSyncActive, 0),
      sourcesHealthy: safeNumber(metrics.sourcesHealthy, 0),
      sourcesWarning: safeNumber(metrics.sourcesWarning, 0),
      sourcesCritical: safeNumber(metrics.sourcesCritical, 0),
      last24hImportedChapters: safeNumber(metrics.last24hImportedChapters, 0),
      last24hIncidents: safeNumber(metrics.last24hIncidents, 0),
    },
    learning: safeArray(raw?.learning).map((item: any) => ({
      host: normalizeText(item?.host),
      score: safeNumber(item?.score, 0),
      successRate: safeNumber(item?.successRate, 0),
      errorRate: safeNumber(item?.errorRate, 0),
      recommendedPriority: safeNumber(item?.recommendedPriority, 0),
      health: normalizeHealth(item?.health),
    })),
    latestIncidents: safeArray(raw?.latestIncidents).map((item: any) => ({
      ...serializeValue(item),
      id: normalizeText(item?.id),
      title: normalizeText(item?.title),
      type: normalizeText(item?.type),
      severity: normalizeText(item?.severity),
      resolved: !!item?.resolved,
      createdAt: toIsoOrNull(item?.createdAt) || serializeValue(item?.createdAt),
      updatedAt: toIsoOrNull(item?.updatedAt) || serializeValue(item?.updatedAt),
      resolvedAt: toIsoOrNull(item?.resolvedAt) || serializeValue(item?.resolvedAt),
    })),
    latestActions: safeArray(raw?.latestActions).map((item: any) => ({
      ...serializeValue(item),
      id: normalizeText(item?.id),
      type: normalizeText(item?.type),
      status: normalizeText(item?.status),
      message: normalizeText(item?.message),
      createdAt: toIsoOrNull(item?.createdAt) || serializeValue(item?.createdAt),
    })),
    latestReports: safeArray(raw?.latestReports).map((item: any) => ({
      ...serializeValue(item),
      id: normalizeText(item?.id),
      summary: normalizeText(item?.summary),
      generatedAt: toIsoOrNull(item?.generatedAt) || serializeValue(item?.generatedAt),
      createdAt: toIsoOrNull(item?.createdAt) || serializeValue(item?.createdAt),
    })),
    queue: {
      total: safeNumber(queue.total, 0),
      queued: safeNumber(queue.queued, 0),
      running: safeNumber(queue.running, 0),
      success: safeNumber(queue.success, 0),
      warning: safeNumber(queue.warning, 0),
      error: safeNumber(queue.error, 0),
      critical: safeNumber(queue.critical, 0),
      high: safeNumber(queue.high, 0),
    },
    queuePreview: safeArray(raw?.queuePreview).map((item: any) => ({
      ...serializeValue(item),
      id: normalizeText(item?.id),
      title: normalizeText(item?.title),
      type: normalizeText(item?.type),
      status: normalizeText(item?.status),
      priority: normalizeText(item?.priority),
      updatedAt: toIsoOrNull(item?.updatedAt) || serializeValue(item?.updatedAt),
      scheduledAt:
        toIsoOrNull(item?.scheduledAt) || serializeValue(item?.scheduledAt),
    })),
    memoryInsights: serializeValue(memoryInsights),
    recommendations: normalizedRecommendations,
    derived,
    center: {
      summary: {
        totalMangas: safeNumber(
          centerSummary.totalMangas,
          safeNumber(metrics.totalMangas, 0)
        ),
        totalChapters: safeNumber(
          centerSummary.totalChapters,
          safeNumber(metrics.totalChapters, 0)
        ),
        totalViews: safeNumber(
          centerSummary.totalViews,
          safeNumber(metrics.totalViews, 0)
        ),
        dayViews: safeNumber(
          centerSummary.dayViews,
          safeNumber(metrics.dayViews, 0)
        ),
        weekViews: safeNumber(
          centerSummary.weekViews,
          safeNumber(metrics.weekViews, 0)
        ),
        monthViews: safeNumber(
          centerSummary.monthViews,
          safeNumber(metrics.monthViews, 0)
        ),
        totalBrokenChapters: safeNumber(
          centerSummary.totalBrokenChapters,
          safeNumber(metrics.totalBrokenChapters, 0)
        ),
        totalUsers: safeNumber(
          centerSummary.totalUsers,
          safeNumber(metrics.totalUsers, 0)
        ),
        totalFavorites: safeNumber(
          centerSummary.totalFavorites,
          safeNumber(metrics.totalFavorites, 0)
        ),
        totalFollowing: safeNumber(
          centerSummary.totalFollowing,
          safeNumber(metrics.totalFollowing, 0)
        ),
        totalHistoryEntries: safeNumber(
          centerSummary.totalHistoryEntries,
          safeNumber(metrics.totalHistoryEntries, 0)
        ),
        autoSyncActive: safeNumber(
          centerSummary.autoSyncActive,
          safeNumber(metrics.autoSyncActive, 0)
        ),
        last24hImportedChapters: safeNumber(
          centerSummary.last24hImportedChapters,
          safeNumber(metrics.last24hImportedChapters, 0)
        ),
        last24hIncidents: safeNumber(
          centerSummary.last24hIncidents,
          safeNumber(metrics.last24hIncidents, 0)
        ),
        unresolvedIncidents,
        automationNot100,
      },
      operator: {
        health: normalizeHealth(centerOperator.health || raw?.health),
        currentJobStatus: normalizeJobStatus(
          centerOperator.currentJobStatus || raw?.currentJobStatus
        ),
        lastRunStartedAt:
          toIsoOrNull(centerOperator.lastRunStartedAt) ||
          serializeValue(centerOperator.lastRunStartedAt) ||
          null,
        lastRunFinishedAt:
          toIsoOrNull(centerOperator.lastRunFinishedAt) ||
          serializeValue(centerOperator.lastRunFinishedAt) ||
          null,
        lastRunError: normalizeText(centerOperator.lastRunError),
        lastRunReportSummary: normalizeText(centerOperator.lastRunReportSummary),
        lastBrokenChaptersCount: safeNumber(
          centerOperator.lastBrokenChaptersCount,
          0
        ),
        lastReportId: normalizeText(centerOperator.lastReportId),
      },
    },
  };
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return noStoreJson(
      {
        ok: false,
        error: "Não autorizado.",
      },
      401
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return noStoreJson(
        buildEmptyStatus("Firebase Admin não configurado."),
        500
      );
    }

    const raw = await buildOperatorStatus(db);
    const normalized = normalizeStatusPayload(raw);

    if (!normalized.ok && normalized.error) {
      return noStoreJson(normalized, 500);
    }

    return noStoreJson(normalized, 200);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro interno ao carregar status do operador.";

    return noStoreJson(buildEmptyStatus(message), 500);
  }
}