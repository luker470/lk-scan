import * as cheerio from "cheerio";
import {
  absoluteUrl,
  DISCOVERY_SOURCES,
  sanitizeMangaTitle,
  type DiscoveryItem,
  type DiscoverySourceKey,
  uniqueByUrlAndTitle,
} from "@/lib/discovery";

async function fetchHtml(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      Referer: new URL(url).origin,
      Origin: new URL(url).origin,
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

function cleanImage(src?: string | null) {
  if (!src) return "";
  return src.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp))/i, "").trim();
}

function getCardTitle(root: cheerio.Cheerio<any>, pageUrl: string) {
  const href = absoluteUrl(pageUrl, root.find("a").first().attr("href"));
  const rawTitle =
    root.find(".tt").first().text().trim() ||
    root.find(".series-title").first().text().trim() ||
    root.find(".bigor .tt").first().text().trim() ||
    root.find("a[title]").first().attr("title") ||
    root.find("img").first().attr("alt") ||
    "";

  return sanitizeMangaTitle(rawTitle, href);
}

function parseMangasOnline(html: string, pageUrl: string): DiscoveryItem[] {
  const $ = cheerio.load(html);
  const items: DiscoveryItem[] = [];

  $(
    "div.bs, div.page-item-detail, div.listupd .bs, .utao .uta .imgu, .listupd .bsx"
  ).each((_, el) => {
    const root = $(el);
    const url = absoluteUrl(pageUrl, root.find("a").first().attr("href")) || "";
    const title = getCardTitle(root, pageUrl);

    const cover = cleanImage(
      absoluteUrl(
        pageUrl,
        root.find("img").first().attr("data-src") ||
          root.find("img").first().attr("data-lazy-src") ||
          root.find("img").first().attr("src")
      )
    );

    const latestChapter =
      root.find(".epxs, .chapter, .lchx").first().text().trim() || "";

    if (!title || !url) return;

    items.push({
      source: "mangasonline",
      title,
      url,
      cover,
      latestChapter,
    });
  });

  return items;
}

function parseMangaOnlineRed(html: string, pageUrl: string): DiscoveryItem[] {
  const $ = cheerio.load(html);
  const items: DiscoveryItem[] = [];

  $(
    "div.bs, div.page-item-detail, div.listupd .bs, .listupd .bsx, .utao .uta"
  ).each((_, el) => {
    const root = $(el);
    const url = absoluteUrl(pageUrl, root.find("a").first().attr("href")) || "";
    const title = getCardTitle(root, pageUrl);

    const cover = cleanImage(
      absoluteUrl(
        pageUrl,
        root.find("img").first().attr("data-src") ||
          root.find("img").first().attr("data-lazy-src") ||
          root.find("img").first().attr("src")
      )
    );

    const latestChapter =
      root.find(".epxs, .chapter, .lchx").first().text().trim() || "";

    if (!title || !url) return;

    items.push({
      source: "mangaonlinered",
      title,
      url,
      cover,
      latestChapter,
    });
  });

  return items;
}

function parseSource(source: DiscoverySourceKey, html: string, pageUrl: string) {
  switch (source) {
    case "mangasonline":
      return parseMangasOnline(html, pageUrl);
    case "mangaonlinered":
      return parseMangaOnlineRed(html, pageUrl);
    default:
      return [];
  }
}

export async function discoverFromSource(
  sourceKey: DiscoverySourceKey
): Promise<DiscoveryItem[]> {
  const source = DISCOVERY_SOURCES.find((s) => s.key === sourceKey && s.enabled);
  if (!source) {
    throw new Error("Fonte inválida ou desativada.");
  }

  const all: DiscoveryItem[] = [];

  for (const listUrl of source.listUrls) {
    try {
      const html = await fetchHtml(listUrl);
      const parsed = parseSource(source.key, html, listUrl);
      all.push(...parsed);
    } catch (error) {
      console.error("[DISCOVERY_ERROR]", source.key, listUrl, error);
    }
  }

  return uniqueByUrlAndTitle(all);
}