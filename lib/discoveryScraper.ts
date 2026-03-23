import * as cheerio from "cheerio";
import { absoluteUrl, normalizeText, type DiscoverySourceKey } from "@/lib/discovery";

export type DiscoveredMangaItem = {
  source: DiscoverySourceKey;
  title: string;
  url: string;
  cover?: string;
  latestChapter?: string;
  description?: string;
  genres?: string[];
};

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
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Falha ao buscar lista de mangás: ${res.status}`);
  }

  return await res.text();
}

function cleanImage(src?: string | null, baseUrl?: string) {
  if (!src) return "";
  return absoluteUrl(baseUrl || "", src.trim());
}

function uniqueByUrl(items: DiscoveredMangaItem[]) {
  return items.filter(
    (item, index, arr) => arr.findIndex((x) => x.url === item.url) === index
  );
}

function parseMangaOnlineRed(html: string): DiscoveredMangaItem[] {
  const baseUrl = "https://mangaonline.red";
  const $ = cheerio.load(html);
  const results: DiscoveredMangaItem[] = [];

  $(".page-item-detail, .c-tabs-item__content, .postbody .bs").each((_, el) => {
    const root = $(el);

    const link =
      root.find("a").first().attr("href") ||
      root.find(".post-title a").attr("href") ||
      root.find(".item-thumb a").attr("href") ||
      "";

    const title =
      normalizeText(root.find(".post-title, .series-title, h3, h4").first().text()) ||
      normalizeText(root.find("a").first().attr("title")) ||
      "";

    const cover =
      cleanImage(
        root.find("img").first().attr("data-src") ||
          root.find("img").first().attr("data-lazy-src") ||
          root.find("img").first().attr("src"),
        baseUrl
      ) || "";

    const latestChapter =
      normalizeText(root.find(".chapter, .latest-chap, .post-on").first().text()) || "";

    const finalUrl = absoluteUrl(baseUrl, link);

    if (!finalUrl || !title) return;

    results.push({
      source: "mangaonlinered",
      title,
      url: finalUrl,
      cover,
      latestChapter,
      description: "",
      genres: [],
    });
  });

  return uniqueByUrl(results);
}

function parseMangasOnline(html: string): DiscoveredMangaItem[] {
  const baseUrl = "https://mangasonline.blog";
  const $ = cheerio.load(html);
  const results: DiscoveredMangaItem[] = [];

  $(".listupd .bs, .utao .uta, .page-item-detail").each((_, el) => {
    const root = $(el);

    const link =
      root.find("a").first().attr("href") ||
      root.find(".bsx a").attr("href") ||
      "";

    const title =
      normalizeText(root.find(".tt, .title, h2, h3").first().text()) ||
      normalizeText(root.find("a").first().attr("title")) ||
      "";

    const cover =
      cleanImage(
        root.find("img").first().attr("data-src") ||
          root.find("img").first().attr("data-lazy-src") ||
          root.find("img").first().attr("src"),
        baseUrl
      ) || "";

    const latestChapter =
      normalizeText(root.find(".epxs, .chapter, .latest-chap").first().text()) || "";

    const finalUrl = absoluteUrl(baseUrl, link);

    if (!finalUrl || !title) return;

    results.push({
      source: "mangasonline",
      title,
      url: finalUrl,
      cover,
      latestChapter,
      description: "",
      genres: [],
    });
  });

  return uniqueByUrl(results);
}

export async function discoverFromSource(
  source: DiscoverySourceKey
): Promise<DiscoveredMangaItem[]> {
  if (source === "mangaonlinered") {
    const html = await fetchHtml("https://mangaonline.red/");
    return parseMangaOnlineRed(html);
  }

  if (source === "mangasonline") {
    const html = await fetchHtml("https://mangasonline.blog/");
    return parseMangasOnline(html);
  }

  throw new Error(`Fonte não suportada: ${source}`);
}