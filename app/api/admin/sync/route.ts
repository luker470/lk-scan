import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { syncAllAutoSyncMangas, syncSingleManga } from "@/lib/autoSync";
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
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const startedAt = Date.now();
    const body = await req.json().catch(() => ({}));

    const mangaId = String(body?.mangaId || "").trim();
    const source = String(body?.source || "").trim() as DiscoverySourceKey;
    const discoverNew = Boolean(body?.discoverNew);
    const maxChapters = safeNumber(body?.maxChapters, 0);
    const overwrite = Boolean(body?.overwrite);
    const requestedBy = String(req.headers.get("x-user-id") || "system");

    if (mangaId) {
      const mangaSnap = await db.collection("mangas").doc(mangaId).get().catch(() => null);
      const manga = mangaSnap?.data() || {};
      const sourceUrl =
        String(manga?.primarySourceUrl || manga?.sourceUrl || "").trim();

      const result = await syncSingleManga(db, mangaId, {
        maxChapters: maxChapters > 0 ? maxChapters : undefined,
        overwrite,
      });

      if (result.ok) {
        await markSourceSuccess(db, {
          sourceUrl,
          mangaId,
          message: `Sync manual/automático executado com sucesso para o mangá ${mangaId}.`,
          meta: {
            mode: "single",
            imported: result.imported ?? 0,
            updated: result.updated ?? 0,
            withPages: result.withPages ?? 0,
          },
        });

        if (safeNumber(result.withPages, 0) <= 0) {
          await enqueueOperatorTask(db, {
            type: "validate-manga",
            priority: "high",
            mangaId,
            sourceUrl,
            title: `Validar mangá ${mangaId} após sync com poucas páginas`,
            description:
              "O sync terminou, mas não trouxe páginas suficientes. Validar e tentar correção automática.",
            maxAttempts: 3,
            meta: {
              requestedBy,
            },
          });
        }
      } else {
        await markSourceFailure(db, {
          sourceUrl,
          mangaId,
          message: result.error || `Falha no sync do mangá ${mangaId}.`,
          meta: {
            mode: "single",
          },
        });

        await enqueueOperatorTask(db, {
          type: "sync-manga",
          priority: "high",
          mangaId,
          sourceUrl,
          title: `Repetir sync do mangá ${mangaId}`,
          description:
            "Falha detectada no sync. Task enfileirada para nova tentativa automática.",
          maxAttempts: 4,
          meta: {
            requestedBy,
            previousError: result.error || "",
          },
        });
      }

      await db.collection("system").doc("actions").collection("items").add({
        type: "admin-sync",
        status: result.ok ? "success" : "error",
        message: result.ok
          ? `Sync individual concluído para ${mangaId}.`
          : `Sync individual falhou para ${mangaId}.`,
        meta: {
          mangaId,
          requestedBy,
          durationMs: Date.now() - startedAt,
          result,
        },
        createdAt: new Date(),
      });

      return NextResponse.json({
        ok: result.ok,
        mode: "single",
        durationMs: Date.now() - startedAt,
        result,
      });
    }

    let autoImportResult: any = null;

    if (discoverNew && source) {
      autoImportResult = await discoverAndAutoImportFromSource(db, source, {
        maxChapters: maxChapters > 0 ? maxChapters : undefined,
        overwrite,
      });

      if (autoImportResult?.ok) {
        await markSourceSuccess(db, {
          host: source,
          message: `Descoberta/importação automática executada com sucesso para ${source}.`,
          meta: {
            mode: "discovery-auto-import",
            totalDiscovered: autoImportResult.totalDiscovered ?? 0,
            importedTotal: autoImportResult.importedTotal ?? 0,
            okCount: autoImportResult.okCount ?? 0,
            errorCount: autoImportResult.errorCount ?? 0,
          },
        });
      } else {
        await markSourceFailure(db, {
          host: source,
          message:
            `Falha na descoberta/importação automática para ${source}.`,
          meta: {
            totalDiscovered: autoImportResult?.totalDiscovered ?? 0,
            importedTotal: autoImportResult?.importedTotal ?? 0,
            okCount: autoImportResult?.okCount ?? 0,
            errorCount: autoImportResult?.errorCount ?? 0,
          },
        });

        await enqueueOperatorTask(db, {
          type: "discover-source",
          priority: "high",
          source,
          title: `Repetir descoberta/importação da fonte ${source}`,
          description:
            "A descoberta/importação falhou e foi enfileirada para nova tentativa automática.",
          maxAttempts: 4,
          meta: {
            requestedBy,
            autoImportResult,
          },
        });
      }
    }

    const syncResult = await syncAllAutoSyncMangas(db, {
      maxChapters: maxChapters > 0 ? maxChapters : undefined,
      overwrite,
    });

    await db.collection("system").doc("actions").collection("items").add({
      type: "admin-sync",
      status: syncResult?.ok === false ? "error" : "success",
      message:
        syncResult?.ok === false
          ? "Sync automático global executado com falhas."
          : "Sync automático global executado com sucesso.",
      meta: {
        requestedBy,
        discoverNew,
        source: source || "",
        durationMs: Date.now() - startedAt,
        autoImportResult,
        syncResult,
      },
      createdAt: new Date(),
    });

    if ((syncResult?.withPages ?? 0) <= 0 && (syncResult?.processed ?? 0) > 0) {
      await enqueueOperatorTask(db, {
        type: "operator-maintenance",
        priority: "high",
        title: "Revisar sync global com baixa captura de páginas",
        description:
          "O sync global executou, mas retornou baixa qualidade de páginas. Revisão automática necessária.",
        maxAttempts: 3,
        meta: {
          requestedBy,
          syncResult,
        },
      });
    }

    return NextResponse.json({
      mode: "all",
      discoverNew,
      source: source || "",
      durationMs: Date.now() - startedAt,
      autoImportResult,
      ...syncResult,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/sync error:", error);

    const message =
      error instanceof Error ? error.message : "Erro ao sincronizar.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}