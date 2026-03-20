import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { syncAllAutoSyncMangas, syncSingleManga } from "@/lib/autoSync";
import { discoverAndAutoImportFromSource } from "@/lib/discoveryAutoImport";
import { type DiscoverySourceKey } from "@/lib/discovery";
import { ADMIN_UID } from "@/lib/admin";

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

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
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

    const mangaId = String(body?.mangaId || "").trim();
    const source = String(body?.source || "").trim() as DiscoverySourceKey;
    const discoverNew = Boolean(body?.discoverNew);
    const maxChapters = Number(body?.maxChapters || 0);
    const overwrite = Boolean(body?.overwrite);

    if (mangaId) {
      const result = await syncSingleManga(db, mangaId, {
        maxChapters: maxChapters > 0 ? maxChapters : undefined,
        overwrite,
      });

      return NextResponse.json({
        ok: result.ok,
        mode: "single",
        result,
      });
    }

    let autoImportResult: any = null;

    if (discoverNew && source) {
      autoImportResult = await discoverAndAutoImportFromSource(db, source, {
        maxChapters: maxChapters > 0 ? maxChapters : undefined,
        overwrite,
      });
    }

    const syncResult = await syncAllAutoSyncMangas(db, {
      maxChapters: maxChapters > 0 ? maxChapters : undefined,
      overwrite,
    });

    return NextResponse.json({
      ok: true,
      mode: "all",
      discoverNew,
      source: source || "",
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