import { NextRequest, NextResponse } from "next/server";
import { getAdminBucket, getAdminDb } from "@/lib/firebaseAdmin";
import {
  mirrorAllAutoSyncMangas,
  mirrorAllChaptersOfManga,
  mirrorChapterPagesToStorage,
} from "@/lib/storageBackup";
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
    const body = await req.json().catch(() => ({}));
    const mangaId = String(body?.mangaId || "").trim();
    const chapterId = String(body?.chapterId || "").trim();

    const db = getAdminDb();
    const bucket = getAdminBucket();

    if (!db || !bucket) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin ou Storage não configurado." },
        { status: 500 }
      );
    }

    if (mangaId && chapterId) {
      const result = await mirrorChapterPagesToStorage(db, bucket, mangaId, chapterId);
      return NextResponse.json({ ok: true, mode: "chapter", result });
    }

    if (mangaId) {
      const result = await mirrorAllChaptersOfManga(db, bucket, mangaId);
      return NextResponse.json({ ok: true, mode: "manga", result });
    }

    const result = await mirrorAllAutoSyncMangas(db, bucket);
    return NextResponse.json({ ok: true, mode: "all", ...result });
  } catch (error: unknown) {
    console.error("POST /api/admin/mirror error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao espelhar páginas.",
      },
      { status: 500 }
    );
  }
}