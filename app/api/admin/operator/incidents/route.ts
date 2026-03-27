import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

function safeNumber(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function matchesFilter(item: any, params: URLSearchParams) {
  const q = normalizeText(params.get("q"));
  const severity = normalizeText(params.get("severity"));
  const type = normalizeText(params.get("type"));
  const status = normalizeText(params.get("status"));

  if (severity && severity !== "all") {
    if (normalizeText(item?.severity) !== severity) return false;
  }

  if (type && type !== "all") {
    if (normalizeText(item?.type) !== type) return false;
  }

  if (status && status !== "all") {
    if (status === "open" && item?.resolved) return false;
    if (status === "resolved" && !item?.resolved) return false;
  }

  if (q) {
    const haystack = [
      item?.title,
      item?.type,
      item?.severity,
      item?.resolutionNote,
      item?.lastError,
      JSON.stringify(item?.meta || {}),
    ]
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(q)) return false;
  }

  return true;
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
      100,
      Math.max(1, safeNumber(searchParams.get("pageSize"), 20))
    );

    const snap = await db
      .collection("system")
      .doc("incidents")
      .collection("items")
      .orderBy("createdAt", "desc")
      .limit(400)
      .get()
      .catch(async () =>
        db.collection("system").doc("incidents").collection("items").limit(400).get()
      );

    let items = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    }));

    items = items.filter((item) => matchesFilter(item, searchParams));

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const paginatedItems = items.slice(start, start + pageSize);

    const summary = {
      total,
      open: items.filter((item) => !item?.resolved).length,
      resolved: items.filter((item) => !!item?.resolved).length,
      critical: items.filter((item) => item?.severity === "critical").length,
      high: items.filter((item) => item?.severity === "high").length,
      warning: items.filter((item) => item?.severity === "warning").length,
      info: items.filter((item) => item?.severity === "info").length,
    };

    return NextResponse.json({
      ok: true,
      items: paginatedItems,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPrevPage: safePage > 1,
      },
      summary,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
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

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();
    const id = String(body?.id || "").trim();
    const ids = Array.isArray(body?.ids)
      ? body.ids.map((v: unknown) => String(v || "").trim()).filter(Boolean)
      : [];
    const resolutionNote = String(body?.resolutionNote || "").trim();

    const targetIds = [...new Set([id, ...ids].filter(Boolean))];

    if (!action || targetIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe action e pelo menos um incidente." },
        { status: 400 }
      );
    }

    if (!["resolve", "reopen"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Ação inválida." },
        { status: 400 }
      );
    }

    const batch = db.batch();
    const now = new Date();

    for (const incidentId of targetIds) {
      const ref = db
        .collection("system")
        .doc("incidents")
        .collection("items")
        .doc(incidentId);

      if (action === "resolve") {
        batch.set(
          ref,
          {
            resolved: true,
            resolvedAt: now,
            resolvedBy: ADMIN_UID,
            resolutionNote: resolutionNote || "Resolvido manualmente no painel.",
            updatedAt: now,
          },
          { merge: true }
        );
      } else {
        batch.set(
          ref,
          {
            resolved: false,
            reopenedAt: now,
            reopenedBy: ADMIN_UID,
            updatedAt: now,
          },
          { merge: true }
        );
      }
    }

    await batch.commit();

    await db.collection("system").doc("actions").collection("items").add({
      type: "incident-management",
      status: "success",
      message:
        action === "resolve"
          ? `${targetIds.length} incidente(s) resolvido(s) manualmente.`
          : `${targetIds.length} incidente(s) reaberto(s) manualmente.`,
      meta: {
        action,
        ids: targetIds,
        resolutionNote,
      },
      createdAt: now,
    });

    return NextResponse.json({
      ok: true,
      action,
      updatedCount: targetIds.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}