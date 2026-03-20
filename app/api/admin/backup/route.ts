import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { backupAllAutoSyncMangas, backupSingleMangaChapters } from "@/lib/backupManager";
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
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mangaId = String(body?.mangaId || "").trim();

    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    if (mangaId) {
      const result = await backupSingleMangaChapters(db, mangaId);
      return NextResponse.json({
        ok: true,
        mode: "single",
        result,
      });
    }

    const result = await backupAllAutoSyncMangas(db);

    return NextResponse.json({
      ok: true,
      mode: "all",
      ...result,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/backup error:", error);

    const message =
      error instanceof Error ? error.message : "Erro ao gerar backup.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
