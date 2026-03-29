import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
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

function safeNumber(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function safeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

function normalizeSeverity(value: unknown) {
  const v = normalizeLower(value);
  if (v === "critical" || v === "high" || v === "warning" || v === "info") {
    return v;
  }
  return "info";
}

function normalizeIncidentType(value: unknown) {
  return normalizeLower(value) || "unknown";
}

function matchesFilter(item: any, params: URLSearchParams) {
  const q = normalizeLower(params.get("q"));
  const severity = normalizeLower(params.get("severity"));
  const type = normalizeLower(params.get("type"));
  const status = normalizeLower(params.get("status"));

  if (severity && severity !== "all") {
    if (normalizeLower(item?.severity) !== severity) return false;
  }

  if (type && type !== "all") {
    if (normalizeLower(item?.type) !== type) return false;
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

function buildExecutiveSummary(items: any[]) {
  const total = items.length;
  const open = items.filter((item) => !item?.resolved).length;
  const critical = items.filter((item) => item?.severity === "critical").length;
  const high = items.filter((item) => item?.severity === "high").length;

  if (critical > 0) {
    return {
      health: "critical",
      message:
        "Há incidentes críticos em aberto. A prioridade é estabilizar o operador, a fila e os fluxos automáticos.",
    };
  }

  if (high > 0 || open >= 5) {
    return {
      health: "warning",
      message:
        "Existem incidentes relevantes em aberto. O sistema funciona, mas exige tratamento operacional contínuo.",
    };
  }

  if (open > 0) {
    return {
      health: "warning",
      message:
        "Há incidentes em aberto, porém sem severidade crítica. O foco deve ser reduzir a fila de pendências.",
    };
  }

  if (total === 0) {
    return {
      health: "healthy",
      message:
        "Nenhum incidente encontrado no período carregado. Operação limpa neste recorte.",
    };
  }

  return {
    health: "healthy",
    message:
      "Todos os incidentes carregados estão resolvidos. O ambiente está estável neste recorte.",
  };
}

function normalizeIncidentItem(item: any) {
  return {
    ...serializeValue(item),
    id: normalizeText(item?.id),
    title: normalizeText(item?.title),
    type: normalizeIncidentType(item?.type),
    severity: normalizeSeverity(item?.severity),
    resolved: !!item?.resolved,
    resolutionNote: normalizeText(item?.resolutionNote),
    lastError: normalizeText(item?.lastError),
    resolvedBy: normalizeText(item?.resolvedBy),
    reopenedBy: normalizeText(item?.reopenedBy),
    createdAt: toIsoOrNull(item?.createdAt) || serializeValue(item?.createdAt),
    updatedAt: toIsoOrNull(item?.updatedAt) || serializeValue(item?.updatedAt),
    resolvedAt:
      toIsoOrNull(item?.resolvedAt) || serializeValue(item?.resolvedAt),
    reopenedAt:
      toIsoOrNull(item?.reopenedAt) || serializeValue(item?.reopenedAt),
    meta: serializeValue(item?.meta || {}),
  };
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

    items = items
      .filter((item) => matchesFilter(item, searchParams))
      .sort((a, b) => {
        const ad = toDate(a?.createdAt)?.getTime() || 0;
        const bd = toDate(b?.createdAt)?.getTime() || 0;
        return bd - ad;
      });

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const paginatedItems = items.slice(start, start + pageSize).map(normalizeIncidentItem);

    const summary = {
      total,
      open: items.filter((item) => !item?.resolved).length,
      resolved: items.filter((item) => !!item?.resolved).length,
      critical: items.filter((item) => normalizeSeverity(item?.severity) === "critical").length,
      high: items.filter((item) => normalizeSeverity(item?.severity) === "high").length,
      warning: items.filter((item) => normalizeSeverity(item?.severity) === "warning").length,
      info: items.filter((item) => normalizeSeverity(item?.severity) === "info").length,
      byType: {
        site: items.filter((item) => normalizeIncidentType(item?.type) === "site").length,
        api: items.filter((item) => normalizeIncidentType(item?.type) === "api").length,
        source: items.filter((item) => normalizeIncidentType(item?.type) === "source").length,
        parser: items.filter((item) => normalizeIncidentType(item?.type) === "parser").length,
        chapter: items.filter((item) => normalizeIncidentType(item?.type) === "chapter").length,
        sync: items.filter((item) => normalizeIncidentType(item?.type) === "sync").length,
        queue: items.filter((item) => normalizeIncidentType(item?.type) === "queue").length,
        backup: items.filter((item) => normalizeIncidentType(item?.type) === "backup").length,
        comment: items.filter((item) => normalizeIncidentType(item?.type) === "comment").length,
        operator: items.filter((item) => normalizeIncidentType(item?.type) === "operator").length,
        unknown: items.filter((item) => normalizeIncidentType(item?.type) === "unknown").length,
      },
    };

    const executive = buildExecutiveSummary(items);

    return noStoreJson({
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
      executive,
      filters: {
        q: normalizeText(searchParams.get("q")),
        severity: normalizeText(searchParams.get("severity")) || "all",
        type: normalizeText(searchParams.get("type")) || "all",
        status: normalizeText(searchParams.get("status")) || "all",
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

export async function PATCH(req: Request) {
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

    const body = await req.json().catch(() => ({}));
    const action = normalizeLower(body?.action);
    const id = normalizeText(body?.id);
    const ids = safeArray(body?.ids)
      .map((v: unknown) => normalizeText(v))
      .filter(Boolean);
    const resolutionNote = normalizeText(body?.resolutionNote);
    const reopenReason = normalizeText(body?.reopenReason);

    const targetIds = [...new Set([id, ...ids].filter(Boolean))];

    if (!action || targetIds.length === 0) {
      return noStoreJson(
        { ok: false, error: "Informe action e pelo menos um incidente." },
        400
      );
    }

    if (!["resolve", "reopen"].includes(action)) {
      return noStoreJson(
        { ok: false, error: "Ação inválida." },
        400
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
            reopenReason: reopenReason || "Reaberto manualmente no painel.",
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
        reopenReason,
      },
      createdAt: now,
    });

    const updatedDocs = await Promise.all(
      targetIds.slice(0, 50).map(async (incidentId) => {
        const snap = await db
          .collection("system")
          .doc("incidents")
          .collection("items")
          .doc(incidentId)
          .get()
          .catch(() => null);

        if (!snap?.exists) return null;

        return normalizeIncidentItem({
          id: snap.id,
          ...(snap.data() as any),
        });
      })
    );

    return noStoreJson({
      ok: true,
      action,
      updatedCount: targetIds.length,
      updatedItems: updatedDocs.filter(Boolean),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return noStoreJson(
      { ok: false, error: message },
      500
    );
  }
}