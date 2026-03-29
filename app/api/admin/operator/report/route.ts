import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { collectOperatorMetrics } from "@/lib/operatorMetrics";
import { buildOperatorLearning } from "@/lib/operatorLearning";
import {
  createOperatorReport,
  persistOperatorReport,
} from "@/lib/operatorReports";
import { getOperatorQueueStats } from "@/lib/operatorQueue";
import {
  storeOperatorMemory,
  upsertRecurringProblem,
} from "@/lib/operatorMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

function safeNumber(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeQuery(value: string | null) {
  return normalizeText(value).toLowerCase();
}

function buildQueueFallback() {
  return {
    total: 0,
    queued: 0,
    running: 0,
    success: 0,
    warning: 0,
    error: 0,
    critical: 0,
    high: 0,
  };
}

function toDate(value: any, fallback: Date | null = null) {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : fallback;
    } catch {
      return fallback;
    }
  }
  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof value?._seconds === "number") {
    const d = new Date(value._seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function serializeValue(value: any): any {
  if (value == null) return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value?.toDate === "function") {
    try {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {}
  }

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

function buildReportSearchText(item: any) {
  return [
    item?.summary,
    ...(Array.isArray(item?.highlights) ? item.highlights : []),
    ...(Array.isArray(item?.warnings) ? item.warnings : []),
    ...(Array.isArray(item?.actions) ? item.actions : []),
    ...(Array.isArray(item?.recommendations) ? item.recommendations : []),
    JSON.stringify(item?.metrics || {}),
    JSON.stringify(item?.learning || []),
    JSON.stringify(item?.meta || {}),
  ]
    .join(" ")
    .toLowerCase();
}

function sortReports(items: any[]) {
  return [...items].sort((a, b) => {
    const ad = toDate(a?.generatedAt)?.getTime() || 0;
    const bd = toDate(b?.generatedAt)?.getTime() || 0;
    return bd - ad;
  });
}

function buildReportOperationalHealth(item: any) {
  const metrics = item?.metrics || {};
  const queue = item?.meta?.queue || item?.queue || {};

  const broken = Number(metrics.totalBrokenChapters || 0);
  const criticalSources = Number(metrics.sourcesCritical || 0);
  const warningSources = Number(metrics.sourcesWarning || 0);
  const queueCritical = Number(queue.critical || 0);
  const queueError = Number(queue.error || 0);
  const autoSyncActive = Number(metrics.autoSyncActive || 0);
  const imported24h = Number(metrics.last24hImportedChapters || 0);

  if (
    broken > 20 ||
    criticalSources > 0 ||
    queueCritical > 0 ||
    queueError > 0
  ) {
    return "critical";
  }

  if (
    broken > 0 ||
    warningSources > 1 ||
    (autoSyncActive > 0 && imported24h === 0)
  ) {
    return "warning";
  }

  return "healthy";
}

function buildExecutiveSummary(item: any) {
  const metrics = item?.metrics || {};
  const queue = item?.meta?.queue || item?.queue || {};
  const health = buildReportOperationalHealth(item);

  const totalMangas = Number(metrics.totalMangas || 0);
  const totalChapters = Number(metrics.totalChapters || 0);
  const totalViews = Number(metrics.totalViews || 0);
  const broken = Number(metrics.totalBrokenChapters || 0);
  const users = Number(metrics.totalUsers || 0);
  const queued = Number(queue.queued || 0);
  const critical = Number(queue.critical || 0);

  let message =
    "Relatório gerado com leitura operacional do catálogo, fila, fontes e estabilidade.";

  if (health === "critical") {
    message = `Estado crítico: ${broken} capítulo(s) quebrado(s), ${critical} task(s) crítica(s) e possíveis gargalos em fontes/fila.`;
  } else if (health === "warning") {
    message = `Estado em alerta: ${broken} capítulo(s) problemático(s), ${queued} task(s) pendente(s) e automação ainda exigindo atenção.`;
  } else {
    message = `Operação saudável: ${totalMangas} mangá(s), ${totalChapters} capítulo(s), ${users} usuário(s) e ${totalViews} view(s) totais.`;
  }

  return {
    health,
    message,
    totalMangas,
    totalChapters,
    totalViews,
    totalBrokenChapters: broken,
    totalUsers: users,
    queueQueued: queued,
    queueCritical: critical,
  };
}

async function createAction(
  db: FirebaseFirestore.Firestore,
  status: "success" | "warning" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await db.collection("system").doc("actions").collection("items").add({
    type: "operator-report",
    status,
    message,
    meta: meta || {},
    createdAt: new Date(),
  });
}

async function createIncident(
  db: FirebaseFirestore.Firestore,
  title: string,
  severity: "warning" | "high" | "critical",
  meta?: Record<string, unknown>,
  type = "operator"
) {
  const existing = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .where("title", "==", title)
    .where("type", "==", type)
    .where("resolved", "==", false)
    .limit(1)
    .get()
    .catch(() => null);

  if (existing && !existing.empty) {
    return { ok: true as const, created: false as const };
  }

  const ref = await db.collection("system").doc("incidents").collection("items").add({
    title,
    type,
    severity,
    resolved: false,
    meta: meta || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { ok: true as const, created: true as const, id: ref.id };
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return noStoreJson(
      { ok: false, error: "Unauthorized" },
      401
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return noStoreJson(
        { ok: false, error: "Firebase Admin não configurado." },
        500
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, safeNumber(searchParams.get("page"), 1));
    const pageSize = Math.min(
      50,
      Math.max(1, safeNumber(searchParams.get("pageSize"), 10))
    );
    const q = normalizeQuery(searchParams.get("q"));
    const healthFilter = normalizeQuery(searchParams.get("health"));

    const snap = await db
      .collection("system")
      .doc("reports")
      .collection("items")
      .orderBy("generatedAt", "desc")
      .limit(300)
      .get()
      .catch(async () =>
        db.collection("system").doc("reports").collection("items").limit(300).get()
      );

    let items = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));

    items = sortReports(items).map((item) => ({
      ...item,
      executive: buildExecutiveSummary(item),
    }));

    if (q) {
      items = items.filter((item) => buildReportSearchText(item).includes(q));
    }

    if (healthFilter === "healthy" || healthFilter === "warning" || healthFilter === "critical") {
      items = items.filter((item) => item.executive?.health === healthFilter);
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const paginatedItems = items.slice(start, start + pageSize);

    const latest = items[0] || null;
    const latestMetrics = latest?.metrics || {};
    const latestExecutive = latest?.executive || null;

    const healthCounts = {
      healthy: items.filter((item) => item.executive?.health === "healthy").length,
      warning: items.filter((item) => item.executive?.health === "warning").length,
      critical: items.filter((item) => item.executive?.health === "critical").length,
    };

    return noStoreJson({
      ok: true,
      items: paginatedItems,
      latest,
      summary: {
        totalReports: total,
        latestGeneratedAt: latest?.generatedAt || null,
        latestHealth: latestExecutive?.health || "critical",
        latestMessage: latestExecutive?.message || "",
        latestTotalMangas: latestMetrics.totalMangas ?? 0,
        latestTotalChapters: latestMetrics.totalChapters ?? 0,
        latestTotalViews: latestMetrics.totalViews ?? 0,
        latestBrokenChapters: latestMetrics.totalBrokenChapters ?? 0,
        latestUsers: latestMetrics.totalUsers ?? 0,
        healthCounts,
      },
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
      filters: {
        q,
        health: healthFilter || "all",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return noStoreJson(
      { ok: false, error: message },
      500
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return noStoreJson(
      { ok: false, error: "Unauthorized" },
      401
    );
  }

  const startedAt = new Date();
  const reportRunId = `report-${startedAt.getTime()}`;

  try {
    const db = getAdminDb();

    if (!db) {
      return noStoreJson(
        { ok: false, error: "Firebase Admin não configurado." },
        500
      );
    }

    const [metrics, learning, queue] = await Promise.all([
      collectOperatorMetrics(db),
      buildOperatorLearning(db),
      getOperatorQueueStats(db).catch(() => buildQueueFallback()),
    ]);

    const report = createOperatorReport(metrics, learning);
    const persisted = await persistOperatorReport(db, report);
    const executive = buildExecutiveSummary({
      ...report,
      meta: {
        ...(report?.meta || {}),
        queue,
      },
      queue,
    });

    await db.collection("system").doc("operator").set(
      {
        lastManualReportId: persisted.id,
        lastManualReportAt: new Date(),
        lastManualReportHealth: executive.health,
        lastManualReportSummary: executive.message,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await createAction(
      db,
      executive.health === "critical"
        ? "warning"
        : executive.health === "warning"
        ? "warning"
        : "success",
      "Novo relatório operacional gerado manualmente.",
      {
        reportId: persisted.id,
        reportRunId,
        totalMangas: metrics.totalMangas,
        totalBrokenChapters: metrics.totalBrokenChapters,
        totalUsers: metrics.totalUsers,
        totalViews: metrics.totalViews,
        queue,
        executive,
      }
    );

    await storeOperatorMemory(db, {
      type: "manual-report",
      success: executive.health !== "critical",
      impactScore:
        executive.health === "healthy"
          ? 8
          : executive.health === "warning"
          ? 3
          : -6,
      title: "Relatório manual do operador gerado",
      summary: executive.message,
      context: {
        reportId: persisted.id,
        reportRunId,
        executive,
        queue: serializeValue(queue),
      },
    }).catch(() => null);

    if (executive.health === "critical") {
      await createIncident(
        db,
        "Relatório manual detectou estado crítico do operador",
        "high",
        {
          reportId: persisted.id,
          reportRunId,
          executive,
          queue,
        },
        "operator"
      );

      await upsertRecurringProblem(db, {
        key: "report::critical-health",
        title: "Relatórios detectando saúde crítica",
        type: "operator",
        severity: "high",
        meta: {
          reportId: persisted.id,
          health: executive.health,
        },
      }).catch(() => null);
    } else if (executive.health === "warning") {
      await upsertRecurringProblem(db, {
        key: "report::warning-health",
        title: "Relatórios detectando operação em alerta",
        type: "operator",
        severity: "warning",
        meta: {
          reportId: persisted.id,
          health: executive.health,
        },
      }).catch(() => null);
    }

    return noStoreJson({
      ok: true,
      report,
      id: persisted.id,
      queue,
      executive,
      summary: {
        totalMangas: metrics.totalMangas,
        totalChapters: metrics.totalChapters,
        totalViews: metrics.totalViews,
        totalBrokenChapters: metrics.totalBrokenChapters,
        totalUsers: metrics.totalUsers,
        queueQueued: queue.queued ?? 0,
        queueCritical: queue.critical ?? 0,
        health: executive.health,
        message: executive.message,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return noStoreJson(
      {
        ok: false,
        error: message,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        runId: reportRunId,
      },
      500
    );
  }
}