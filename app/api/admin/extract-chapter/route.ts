import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CHAPTER_HOSTS = new Set([
  "mangasonline.blog",
  "www.mangasonline.blog",
  "mangaonline.red",
  "www.mangaonline.red",
]);

function isAllowedChapterUrl(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return ALLOWED_CHAPTER_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function extractImageUrlsFromHtml(html: string) {
  const matches =
    html.match(
      /https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]+)?/gi
    ) || [];

  const filtered = matches.filter((u) =>
    u.includes("/wp-content/uploads/WP-manga/data/")
  );

  const unique = Array.from(new Set(filtered));

  const num = (u: string) => {
    const clean = u.split("?")[0];
    const m = clean.match(/(\d+)\.(jpe?g|png|webp|gif)$/i);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
  };

  unique.sort((a, b) => {
    const na = num(a);
    const nb = num(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });

  return unique;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const chapterUrl = String(body?.chapterUrl || "").trim();

    if (!chapterUrl || !chapterUrl.startsWith("http")) {
      return NextResponse.json(
        { ok: false, error: "Invalid chapterUrl" },
        { status: 400 }
      );
    }

    if (!isAllowedChapterUrl(chapterUrl)) {
      return NextResponse.json(
        { ok: false, error: "Chapter host not allowed" },
        { status: 403 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const u = new URL(chapterUrl);

      const res = await fetch(chapterUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,*/*",
          Referer: `${u.protocol}//${u.host}/`,
          "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        cache: "no-store",
      });

      if (!res.ok) {
        return NextResponse.json(
          { ok: false, error: `Upstream error: ${res.status}` },
          { status: 502 }
        );
      }

      const html = await res.text();
      const urls = extractImageUrlsFromHtml(html);

      if (urls.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "Não encontrei imagens no HTML desse capítulo.",
          },
          { status: 400 }
        );
      }

      const pages = urls.map((url, i) => ({
        index: i + 1,
        url,
      }));

      return NextResponse.json({
        ok: true,
        pages,
        pagesCount: pages.length,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Extract failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}