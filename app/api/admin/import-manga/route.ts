import { NextResponse } from "next/server";

export const runtime = "nodejs";

function isAuthed(req: Request) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_SYNC_TOKEN;
}

function extractChapterLinks(html: string) {
  const matches =
    html.match(/https?:\/\/[^\s"'<>]+\/capitulo[^\s"'<>]+/gi) || [];

  return Array.from(new Set(matches));
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const mangaId = body?.mangaId;
  const mangaUrl = body?.mangaUrl;

  if (!mangaId || !mangaUrl) {
    return new NextResponse("Missing mangaId or mangaUrl", { status: 400 });
  }

  try {
    const res = await fetch(mangaUrl);
    const html = await res.text();

    const chapters = extractChapterLinks(html);

    if (!chapters.length) {
      return new NextResponse("Nenhum capítulo encontrado", { status: 400 });
    }

    let imported = 0;

    for (let i = 0; i < chapters.length; i++) {
      const chapterUrl = chapters[i];

      const r = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/import`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": process.env.ADMIN_SYNC_TOKEN!,
          },
          body: JSON.stringify({
            mangaId,
            chapterNumber: i + 1,
            chapterUrl,
          }),
        }
      );

      if (r.ok) imported++;
    }

    return NextResponse.json({
      ok: true,
      totalChapters: chapters.length,
      imported,
    });
  } catch (e: any) {
    console.error(e);
    return new NextResponse("Import failed", { status: 500 });
  }
}
