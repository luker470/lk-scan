import * as cheerio from "cheerio";
import {
  absoluteUrl,
  normalizeText,
  sanitizeMangaTitle,
  slugify,
} from "@/lib/discovery";

export type SupportedSourceKey = "mangasonline" | "mangaonlinered";

export type DiscoveredChapter = {
  title: string;
  number: number;
  url: string;
  pages: string[];
  source: SupportedSourceKey;
};

export type ChapterDiscoveryDiagnostics = {
  mangaUrl: string;
  source: SupportedSourceKey;
  chapterSelectorsTried: string[];
  pageSelectorsTried: string[];
  foundChapterLinks: number;
  foundPages: number;
  lastError?: string;
};

function detectSourceFromUrl(url: string): SupportedSourceKey {
  const host = new URL(url).hostname.replace(/^www\./, "");

  if (host.includes("mangasonline.blog")) return "mangasonline";
  if (host.includes("mangaonline.red")) return "mangaonlinered";

  throw new Error(`Fonte ainda não suportada: ${host}`);
}

async function fetchHtml(url: string) {
  const origin = new URL(url).origin;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      Referer: origin,
      Origin: origin,
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Falha ao buscar ${url}: ${res.status}`);
  }

  return await res.text();
}

function cleanImageUrl(src?: string | null, baseUrl?: string) {
  if (!src) return "";

  let out = src.trim();

  if (baseUrl) {
    out = absoluteUrl(baseUrl, out);
  }

  return out
    .replace(/\s+/g, "")
    .replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp))/i, "")
    .trim();
}

function parseChapterNumber(input: string, fallback: number) {
  const text = input.replace(",", ".").trim();

  const match =
    text.match(/cap[ií]tulo\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    text.match(/chapter\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    text.match(/epis[oó]dio\s*([0-9]+(?:\.[0-9]+)?)/i) ||
    text.match(/\b([0-9]+(?:\.[0-9]+)?)\b/);

  if (!match) return fallback;

  const num = Number(match[1]);
  return Number.isFinite(num) ? num : fallback;
}

function uniqueStrings(arr: string[]) {
  return [...new Set(arr.filter(Boolean))];
}

function shouldIgnoreImage(url: string) {
  const lower = url.toLowerCase();

  return (
    !lower ||
    lower.includes("logo") ||
    lower.includes("avatar") ||
    lower.includes("icon") ||
    lower.includes("banner") ||
    lower.includes("spinner") ||
    lower.includes("loading") ||
    lower.includes("ads") ||
    lower.includes("doubleclick") ||
    lower.includes("googlesyndication") ||
    lower.includes("emoji") ||
    lower.includes("gravatar")
  );
}

function getMangaSlugFromUrl(mangaUrl: string) {
  try {
    const u = new URL(mangaUrl);
    const parts = u.pathname.split("/").filter(Boolean);
    return (parts[parts.length - 1] || "").toLowerCase();
  } catch {
    return "";
  }
}

function isChapterUrlForManga(chapterUrl: string, mangaUrl: string) {
  try {
    const chapter = new URL(chapterUrl);
    const manga = new URL(mangaUrl);

    if (chapter.hostname !== manga.hostname) return false;

    const mangaSlug = getMangaSlugFromUrl(mangaUrl);
    const chapterPath = chapter.pathname.toLowerCase();

    if (!mangaSlug) return true;

    if (chapterPath.includes(`/${mangaSlug}/`)) return true;
    if (chapterPath.includes("capitulo")) return true;
    if (chapterPath.includes("chapter")) return true;

    return false;
  } catch {
    return false;
  }
}

function buildChapterSelectors() {
  return [
    "li.wp-manga-chapter > a",
    ".wp-manga-chapter > a",
    "#chapterlist li a",
    ".listing-chapters_wrap li a",
    ".main.version-chap li.wp-manga-chapter a",
    ".version-chap li a",
    ".chapter-list li a",
    ".page-content-listing ul li a",
    ".page-content-listing a",
    ".chapters-wrapper a",
    ".eplister li a",
    ".clstyle li a",
    ".su-spoiler-content a",
    ".postbody a[href*='capitulo']",
    ".entry-content a[href*='capitulo']",
    ".entry-content a[href*='chapter']",
    "a[href*='/chapter/']",
    "a[href*='capitulo']",
    "a[href*='chapter-']",
  ];
}

function extractChapterLinks(
  html: string,
  mangaUrl: string,
  diagnostics?: ChapterDiscoveryDiagnostics
) {
  const $ = cheerio.load(html);
  const selectors = buildChapterSelectors();

  const seen = new Set<string>();
  const chapters: Array<{ title: string; url: string; number: number }> = [];
  let fallback = 1;

  for (const selector of selectors) {
    diagnostics?.chapterSelectorsTried.push(selector);

    $(selector).each((_, el) => {
      const link = $(el);
      const href = absoluteUrl(mangaUrl, link.attr("href"));

      if (!href) return;
      if (!isChapterUrlForManga(href, mangaUrl)) return;
      if (seen.has(href)) return;

      const titleRaw =
        link.text().trim() ||
        link.attr("title") ||
        link.closest("li").text().trim() ||
        link.parent().text().trim() ||
        "";

      const title = normalizeText(titleRaw) || `Capítulo ${fallback}`;

      seen.add(href);
      chapters.push({
        title,
        url: href,
        number: parseChapterNumber(title, fallback),
      });

      fallback += 1;
    });

    if (chapters.length) break;
  }

  const unique = chapters.filter(
    (item, index, arr) => arr.findIndex((x) => x.url === item.url) === index
  );

  unique.sort((a, b) => a.number - b.number);

  if (diagnostics) {
    diagnostics.foundChapterLinks = unique.length;
  }

  return unique;
}

function buildPageSelectors() {
  return [
    ".reading-content img",
    ".reading-content .page-break img",
    ".reader-area img",
    "#readerarea img",
    ".entry-content img",
    ".chapter-content img",
    ".chapter-body img",
    ".rdminimal img",
    "img.wp-manga-chapter-img",
    ".container-chapter-reader img",
    ".chapter_container img",
    ".text-left img",
    ".page-break.no-gaps img",
  ];
}

function extractPagesFromImgs(
  $: cheerio.CheerioAPI,
  chapterUrl: string,
  diagnostics?: ChapterDiscoveryDiagnostics
) {
  const selectors = buildPageSelectors();

  for (const selector of selectors) {
    diagnostics?.pageSelectorsTried.push(selector);

    const collected: string[] = [];

    $(selector).each((_, el) => {
      const img = $(el);

      const src =
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        img.attr("data-cfsrc") ||
        img.attr("data-original") ||
        img.attr("data-lazy") ||
        img.attr("src");

      const finalUrl = cleanImageUrl(src, chapterUrl);

      if (!finalUrl || shouldIgnoreImage(finalUrl)) return;

      collected.push(finalUrl);
    });

    const uniqueCollected = uniqueStrings(collected);
    if (uniqueCollected.length) {
      if (diagnostics) {
        diagnostics.foundPages = uniqueCollected.length;
      }
      return uniqueCollected;
    }
  }

  return [];
}

function extractPagesFromScripts(
  html: string,
  chapterUrl: string,
  diagnostics?: ChapterDiscoveryDiagnostics
) {
  const matches =
    html.match(/https?:\/\/[^"'\\\s]+?\.(jpg|jpeg|png|webp)/gi) || [];

  const cleaned = uniqueStrings(
    matches.map((item) => cleanImageUrl(item, chapterUrl)).filter(Boolean)
  ).filter((item) => !shouldIgnoreImage(item));

  if (cleaned.length && diagnostics) {
    diagnostics.foundPages = cleaned.length;
  }

  return cleaned;
}

function extractPagesFromChapterHtml(
  html: string,
  chapterUrl: string,
  diagnostics?: ChapterDiscoveryDiagnostics
) {
  const $ = cheerio.load(html);

  const fromImgs = extractPagesFromImgs($, chapterUrl, diagnostics);
  if (fromImgs.length) return fromImgs;

  const fromScripts = extractPagesFromScripts(html, chapterUrl, diagnostics);
  if (fromScripts.length) return fromScripts;

  return [];
}

export async function discoverChaptersFromMangaUrl(
  mangaUrl: string,
  options?: {
    maxChapters?: number;
  }
): Promise<DiscoveredChapter[]> {
  const source = detectSourceFromUrl(mangaUrl);
  const html = await fetchHtml(mangaUrl);

  const diagnostics: ChapterDiscoveryDiagnostics = {
    mangaUrl,
    source,
    chapterSelectorsTried: [],
    pageSelectorsTried: [],
    foundChapterLinks: 0,
    foundPages: 0,
  };

  const chapterLinks = extractChapterLinks(html, mangaUrl, diagnostics);

  if (!chapterLinks.length) {
    throw new Error("Nenhum capítulo encontrado na página da obra.");
  }

  let linksToImport = [...chapterLinks];

  if (options?.maxChapters && options.maxChapters > 0) {
    linksToImport = linksToImport.slice(-options.maxChapters);
  }

  const discovered: DiscoveredChapter[] = [];

  for (const chapter of linksToImport) {
    try {
      const chapterHtml = await fetchHtml(chapter.url);
      const pages = extractPagesFromChapterHtml(chapterHtml, chapter.url, diagnostics);

      discovered.push({
        title: chapter.title,
        number: chapter.number,
        url: chapter.url,
        pages,
        source,
      });
    } catch (error) {
      console.error("[DISCOVERY_CHAPTER_IMPORT_ERROR]", chapter.url, error);
    }
  }

  discovered.sort((a, b) => a.number - b.number);

  return discovered;
}

export async function diagnoseMangaChapterDiscovery(mangaUrl: string) {
  const source = detectSourceFromUrl(mangaUrl);
  const html = await fetchHtml(mangaUrl);

  const diagnostics: ChapterDiscoveryDiagnostics = {
    mangaUrl,
    source,
    chapterSelectorsTried: [],
    pageSelectorsTried: [],
    foundChapterLinks: 0,
    foundPages: 0,
  };

  const chapterLinks = extractChapterLinks(html, mangaUrl, diagnostics);

  if (!chapterLinks.length) {
    diagnostics.lastError = "Nenhum capítulo encontrado na página da obra.";
    return diagnostics;
  }

  const lastChapter = chapterLinks[chapterLinks.length - 1];

  try {
    const chapterHtml = await fetchHtml(lastChapter.url);
    extractPagesFromChapterHtml(chapterHtml, lastChapter.url, diagnostics);
  } catch (error: unknown) {
    diagnostics.lastError =
      error instanceof Error ? error.message : "Erro ao diagnosticar capítulo.";
  }

  return diagnostics;
}

export function buildChapterId(number: number, title: string) {
  const safeNumber = Number.isFinite(number) ? String(number).replace(".", "-") : "0";
  return `chapter-${safeNumber}-${slugify(title || "capitulo")}`.slice(0, 120);
}

export function buildCleanMangaTitle(rawTitle?: string | null, rawUrl?: string | null) {
  return sanitizeMangaTitle(rawTitle, rawUrl);
}