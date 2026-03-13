import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MANGA_HOSTS = new Set([
  "mangasonline.blog",
  "www.mangasonline.blog",
  "mangaonline.red",
  "www.mangaonline.red",
]);

type ChapterCandidate = {
  number: number | null;
  title: string;
  url: string;
};

function isAllowedMangaUrl(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return ALLOWED_MANGA_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html: string) {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function extractTitle(html: string) {
  const ogMatch = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"]+)["']/i
  );
  if (ogMatch?.[1]) return normalizeWhitespace(decodeHtmlEntities(ogMatch[1]));

  const twitterMatch = html.match(
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"]+)["']/i
  );
  if (twitterMatch?.[1]) {
    return normalizeWhitespace(decodeHtmlEntities(twitterMatch[1]));
  }

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match?.[1]) return stripTags(h1Match[1]);

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) return stripTags(titleMatch[1]);

  return "Sem título";
}

function extractCover(html: string, baseUrl: string) {
  const ogImage = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"]+)["']/i
  );
  if (ogImage?.[1]) {
    try {
      return new URL(ogImage[1], baseUrl).toString();
    } catch {
      return ogImage[1].trim();
    }
  }

  const imgMatches = Array.from(
    html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi)
  ).map((m) => m[1]);

  const preferred = imgMatches.find(
    (src) =>
      /cover|capa|thumb|poster|wp-content/i.test(src) &&
      !/logo|avatar|icon/i.test(src)
  );

  if (preferred) {
    try {
      return new URL(preferred, baseUrl).toString();
    } catch {
      return preferred.trim();
    }
  }

  return "";
}

function extractGenres(html: string) {
  const genres = new Set<string>();

  const labelBlocks = [
    /(?:Genre|Genres|Gênero|Gêneros)[\s\S]{0,500}/gi,
    /(?:Tipo|Tags)[\s\S]{0,500}/gi,
  ];

  for (const pattern of labelBlocks) {
    const matches = html.match(pattern) || [];
    for (const block of matches) {
      const links = Array.from(block.matchAll(/<a[^>]*>(.*?)<\/a>/gi)).map((m) =>
        stripTags(m[1])
      );
      for (const g of links) {
        if (g && g.length <= 40) genres.add(g);
      }
    }
  }

  return Array.from(genres).join(", ");
}

function chapterNumberFromText(text: string) {
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return null;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : null;
}

function chapterNumberFromUrl(url: string) {
  const patterns = [
    /capitulo[-_/ ]?(\d+(?:\.\d+)?)/i,
    /chapter[-_/ ]?(\d+(?:\.\d+)?)/i,
    /episodio[-_/ ]?(\d+(?:\.\d+)?)/i,
    /ep[-_/ ]?(\d+(?:\.\d+)?)/i,
    /\/(\d+(?:\.\d+)?)\/?$/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) return n;
    }
  }

  return null;
}

function toAbsoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function looksLikeChapter(url: string, text: string) {
  return (
    /capitulo|chapter|episodio|\/capitulo-|\/chapter-|\/episodio-/i.test(url) ||
    /cap[ií]tulo|chapter|epis[oó]dio/i.test(text)
  );
}

function cleanChapterTitle(label: string, number: number | null) {
  const clean = stripTags(label);

  if (clean) return clean;

  if (number !== null) {
    return `Capítulo ${String(Math.trunc(number)).padStart(3, "0")}`;
  }

  return "Capítulo";
}

function scoreCandidate(candidate: ChapterCandidate) {
  let score = 0;
  const u = candidate.url.toLowerCase();
  const t = candidate.title.toLowerCase();

  if (u.includes("pt-br")) score += 5;
  if (t.includes("pt-br")) score += 5;
  if (u.includes("capitulo")) score += 3;
  if (u.includes("chapter")) score += 3;
  if (t.includes("capítulo")) score += 2;
  if (t.includes("chapter")) score += 2;
  if (u.includes("raw")) score -= 10;
  if (t.includes("raw")) score -= 10;
  if (u.includes("novel")) score -= 10;
  if (t.includes("novel")) score -= 10;

  return score;
}

function dedupeAndSortChapters(candidates: ChapterCandidate[]) {
  const byUrl = new Map<string, ChapterCandidate>();

  for (const item of candidates) {
    byUrl.set(item.url, item);
  }

  const unique = Array.from(byUrl.values());

  const grouped = new Map<string, ChapterCandidate[]>();

  for (const item of unique) {
    const key =
      item.number !== null
        ? `num:${item.number}`
        : `url:${item.url.toLowerCase()}`;

    const arr = grouped.get(key) || [];
    arr.push(item);
    grouped.set(key, arr);
  }

  const deduped: ChapterCandidate[] = [];

  for (const [, arr] of grouped) {
    arr.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
    deduped.push(arr[0]);
  }

  deduped.sort((a, b) => {
    const na = a.number ?? Number.POSITIVE_INFINITY;
    const nb = b.number ?? Number.POSITIVE_INFINITY;

    if (na !== nb) return na - nb;

    const ua = a.url.match(/(\d+(?:\.\d+)?)/)?.[1] || "0";
    const ub = b.url.match(/(\d+(?:\.\d+)?)/)?.[1] || "0";

    return Number(ua) - Number(ub);
  });

  return deduped;
}

function extractChapterLinks(html: string, mangaUrl: string) {
  const candidates: ChapterCandidate[] = [];

  for (const match of html.matchAll(
    /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  )) {
    const href = match[1]?.trim();
    const label = stripTags(match[2] || "");

    if (!href) continue;

    const absolute = toAbsoluteUrl(href, mangaUrl);
    if (!absolute) continue;

    if (!looksLikeChapter(absolute, label)) continue;

    const number = chapterNumberFromUrl(absolute) ?? chapterNumberFromText(label);

    candidates.push({
      number,
      title: cleanChapterTitle(label, number),
      url: absolute,
    });
  }

  return dedupeAndSortChapters(candidates);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const mangaUrl = String(body?.mangaUrl || "").trim();

    if (!mangaUrl || !mangaUrl.startsWith("http")) {
      return NextResponse.json(
        { ok: false, error: "Invalid mangaUrl" },
        { status: 400 }
      );
    }

    if (!isAllowedMangaUrl(mangaUrl)) {
      return NextResponse.json(
        { ok: false, error: "Manga host not allowed" },
        { status: 403 }
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const u = new URL(mangaUrl);

      const res = await fetch(mangaUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

      if (!html || html.length < 500) {
        return NextResponse.json(
          { ok: false, error: "HTML recebido inválido ou muito curto." },
          { status: 400 }
        );
      }

      const title = extractTitle(html);
      const cover = extractCover(html, mangaUrl);
      const genre = extractGenres(html);
      const chapters = extractChapterLinks(html, mangaUrl);

      if (chapters.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Nenhum capítulo encontrado nessa obra. O HTML pode estar diferente do esperado.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        ok: true,
        title,
        cover,
        genre,
        chapters,
        chaptersCount: chapters.length,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Extract manga failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}