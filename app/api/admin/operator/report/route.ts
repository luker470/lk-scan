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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

function safeNumber(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: string | null) {
  return String(value || "").trim().toLowerCase();
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
    const ad = new Date(a?.generatedAt || 0).getTime();
    const bd = new Date(b?.generatedAt || 0).getTime();
    return bd - ad;
  });
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, safeNumber(searchParams.get("page"), 1));
    const pageSize = Math.min(
      50,
      Math.max(1, safeNumber(searchParams.get("pageSize"), 10))
    );
    const q = normalizeText(searchParams.get("q"));

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

    items = sortReports(items);

    if (q) {
      items = items.filter((item) => buildReportSearchText(item).includes(q));
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const paginatedItems = items.slice(start, start + pageSize);

    const latest = items[0] || null;
    const latestMetrics = latest?.metrics || {};

    return NextResponse.json({
      ok: true,
      items: paginatedItems,
      latest,
      summary: {
        totalReports: total,
        latestGeneratedAt: latest?.generatedAt || null,
        latestTotalMangas: latestMetrics.totalMangas ?? 0,
        latestTotalChapters: latestMetrics.totalChapters ?? 0,
        latestTotalViews: latestMetrics.totalViews ?? 0,
        latestBrokenChapters: latestMetrics.totalBrokenChapters ?? 0,
        latestUsers: latestMetrics.totalUsers ?? 0,
      },
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const [metrics, learning, queue] = await Promise.all([
      collectOperatorMetrics(db),
      buildOperatorLearning(db),
      getOperatorQueueStats(db).catch(() => buildQueueFallback()),
    ]);

    const report = createOperatorReport(metrics, learning);
    const persisted = await persistOperatorReport(db, report);

    await db.collection("system").doc("actions").collection("items").add({
      type: "operator-report",
      status: "success",
      message: "Novo relatório operacional gerado manualmente.",
      meta: {
        reportId: persisted.id,
        totalMangas: metrics.totalMangas,
        totalBrokenChapters: metrics.totalBrokenChapters,
        totalUsers: metrics.totalUsers,
        totalViews: metrics.totalViews,
        queue,
      },
      createdAt: new Date(),
    });

    return NextResponse.json({
      ok: true,
      report,
      id: persisted.id,
      queue,
      summary: {
        totalMangas: metrics.totalMangas,
        totalChapters: metrics.totalChapters,
        totalViews: metrics.totalViews,
        totalBrokenChapters: metrics.totalBrokenChapters,
        totalUsers: metrics.totalUsers,
        queueQueued: queue.queued ?? 0,
        queueCritical: queue.critical ?? 0,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}