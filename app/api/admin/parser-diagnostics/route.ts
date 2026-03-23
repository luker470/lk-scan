import { NextRequest, NextResponse } from "next/server";
import { ADMIN_UID } from "@/lib/admin";
import { diagnoseMangaChapterDiscovery } from "@/lib/chapterDiscovery";

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
    const mangaUrl = String(body?.mangaUrl || "").trim();

    if (!mangaUrl) {
      return NextResponse.json(
        { ok: false, error: "mangaUrl obrigatório." },
        { status: 400 }
      );
    }

    const result = await diagnoseMangaChapterDiscovery(mangaUrl);

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/parser-diagnostics error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Erro ao diagnosticar parser.",
      },
      { status: 500 }
    );
  }
}