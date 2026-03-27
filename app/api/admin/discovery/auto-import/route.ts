import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { discoverAndAutoImportFromSource } from "@/lib/discoveryAutoImport";
import { type DiscoverySourceKey } from "@/lib/discovery";
import { ADMIN_UID } from "@/lib/admin";
import { markSourceFailure, markSourceSuccess } from "@/lib/operatorLearning";
import { enqueueOperatorTask } from "@/lib/operatorQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  const token = req.headers.get("x-admin-token");
  const envToken = process.env.ADMIN_SYNC_TOKEN;

  if (uid && uid === ADMIN_UID) return true;
  if (token && envToken && token === envToken) return true;

  return false;
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const source = String(body?.source || "").trim() as DiscoverySourceKey;
    const maxChapters = safeNumber(body?.maxChapters, 0);
    const overwrite = Boolean(body?.overwrite);
    const requestedBy = String(req.headers.get("x-user-id") || "system");

    if (!source) {
      return NextResponse.json(
        { ok: false, error: "Fonte não informada." },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const startedAt = Date.now();

    const result = await discoverAndAutoImportFromSource(db, source, {
      maxChapters: maxChapters > 0 ? maxChapters : undefined,
      overwrite,
    });

    if (result.ok) {
      await markSourceSuccess(db, {
        host: source,
        message: `Descoberta/importação automática executada com sucesso para ${source}.`,
        meta: {
          totalDiscovered: result.totalDiscovered ?? 0,
          importedTotal: result.importedTotal ?? 0,
          okCount: result.okCount ?? 0,
          errorCount: result.errorCount ?? 0,
          requestedBy,
        },
      });

      if ((result.importedTotal ?? 0) <= 0 && (result.totalDiscovered ?? 0) > 0) {
        await enqueueOperatorTask(db, {
          type: "discover-source",
          priority: "high",
          source,
          title: `Revalidar descoberta da fonte ${source}`,
          description:
            "A descoberta encontrou obras, mas a importação ficou abaixo do esperado.",
          maxAttempts: 3,
          meta: {
            requestedBy,
            result,
          },
        });
      }
    } else {
      await markSourceFailure(db, {
        host: source,
        message: `Erro na descoberta/importação para ${source}.`,
        meta: {
          requestedBy,
          totalDiscovered: result.totalDiscovered ?? 0,
          importedTotal: result.importedTotal ?? 0,
          okCount: result.okCount ?? 0,
          errorCount: result.errorCount ?? 0,
        },
      });

      await enqueueOperatorTask(db, {
        type: "discover-source",
        priority: "critical",
        source,
        title: `Refazer descoberta/importação da fonte ${source}`,
        description:
          "A descoberta/importação falhou e foi colocada na fila para nova tentativa automática.",
        maxAttempts: 5,
        meta: {
          requestedBy,
          result,
        },
      });
    }

    await db.collection("system").doc("actions").collection("items").add({
      type: "discovery-auto-import",
      status: result.ok ? "success" : "error",
      message: result.ok
        ? `Discovery auto-import concluído para ${source}.`
        : `Discovery auto-import falhou para ${source}.`,
      meta: {
        source,
        durationMs: Date.now() - startedAt,
        requestedBy,
        result,
      },
      createdAt: new Date(),
    });

    return NextResponse.json({
      ...result,
      durationMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/discovery/auto-import error:", error);

    const message =
      error instanceof Error ? error.message : "Erro no auto import.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}