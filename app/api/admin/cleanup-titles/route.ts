import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { cleanupBuggyMangaTitles } from "@/lib/mangaCleanup";
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
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const result = await cleanupBuggyMangaTitles(db);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/cleanup-titles error:", error);

    const message =
      error instanceof Error ? error.message : "Erro ao limpar títulos.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}