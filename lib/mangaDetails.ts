import * as cheerio from "cheerio";
import { absoluteUrl, normalizeText, sanitizeMangaTitle } from "@/lib/discovery";

export type MangaDetails = {
  title: string;
  cover: string;
  banner: string;
  description: string;
  genres: string[];
  status: string;
  author: string;
  artist: string;
  sourceUrl: string;
  sourceHost: string;
};

function cleanText(value?: string | null) {
  return normalizeText(value || "");
}

function cleanImage(src?: string | null, baseUrl?: string) {
  if (!src) return "";
  let out = src.trim();

  if (baseUrl) {
    out = absoluteUrl(baseUrl, out);
  }

  return out.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp))/i, "").trim();
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
    throw new Error(`Falha ao buscar detalhes do mangá: ${res.status}`);
  }

  return await res.text();
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => cleanText(item)).filter(Boolean))];
}

function detectStatus(text: string) {
  const value = cleanText(text).toLowerCase();

  if (!value) return "";
  if (
    value.includes("ongoing") ||
    value.includes("em andamento") ||
    value.includes("andamento")
  ) {
    return "Em andamento";
  }

  if (
    value.includes("completed") ||
    value.includes("completo") ||
    value.includes("finalizado") ||
    value.includes("concluído") ||
    value.includes("concluido")
  ) {
    return "Completo";
  }

  if (
    value.includes("hiatus") ||
    value.includes("hiato") ||
    value.includes("pausado")
  ) {
    return "Hiato";
  }

  return cleanText(text);
}

function parseInfoPairs($: cheerio.CheerioAPI) {
  const info: Record<string, string> = {};

  const pairRoots = [
    ".tsinfo .imptdt",
    ".post-content_item",
    ".summary-content",
    ".summary-heading",
    ".fmed",
    ".wd-full",
  ];

  $(".tsinfo .imptdt").each((_, el) => {
    const label = cleanText($(el).find("i, h5").first().text() || $(el).text());
    const value =
      cleanText($(el).find("a").map((_, a) => $(a).text()).get().join(", ")) ||
      cleanText($(el).find(".mgen, .summary-content").text()) ||
      cleanText($(el).contents().last().text());

    if (label && value) info[label.toLowerCase()] = value;
  });

  $(".post-content_item").each((_, el) => {
    const label = cleanText($(el).find(".summary-heading").text()).toLowerCase();
    const value = cleanText($(el).find(".summary-content").text());
    if (label && value) info[label] = value;
  });

  for (const selector of pairRoots) {
    $(selector).each((_, el) => {
      const text = cleanText($(el).text());
      if (!text.includes(":")) return;

      const parts = text.split(":");
      const label = cleanText(parts.shift()).toLowerCase();
      const value = cleanText(parts.join(":"));
      if (label && value && !info[label]) {
        info[label] = value;
      }
    });
  }

  return info;
}

export async function fetchMangaDetails(sourceUrl: string): Promise<MangaDetails> {
  const html = await fetchHtml(sourceUrl);
  const $ = cheerio.load(html);

  const rawTitle =
    cleanText($(".entry-title").first().text()) ||
    cleanText($(".post-title h1").first().text()) ||
    cleanText($(".title").first().text()) ||
    cleanText($("h1").first().text()) ||
    cleanText($("meta[property='og:title']").attr("content")) ||
    "";

  const title = sanitizeMangaTitle(rawTitle, sourceUrl);

  const cover =
    cleanImage(
      $(".summary_image img").first().attr("data-src") ||
        $(".summary_image img").first().attr("data-lazy-src") ||
        $(".summary_image img").first().attr("src") ||
        $(".thumb img").first().attr("data-src") ||
        $(".thumb img").first().attr("src") ||
        $("meta[property='og:image']").attr("content"),
      sourceUrl
    ) || "";

  const banner =
    cleanImage(
      $(".profile-manga.summary-layout-1").first().attr("style")?.match(/url\((.*?)\)/)?.[1] ||
        $(".site-content .profile-manga").first().attr("style")?.match(/url\((.*?)\)/)?.[1] ||
        $("meta[property='og:image']").attr("content"),
      sourceUrl
    ) || cover;

  const description =
    cleanText($(".summary__content, .description-summary, .desc").first().text()) ||
    cleanText($("meta[name='description']").attr("content")) ||
    "";

  const genres = uniqueStrings([
    ...$(".genres-content a, .mgen a, .genre-info a, a[href*='/genero/']")
      .map((_, el) => $(el).text())
      .get(),
  ]);

  const info = parseInfoPairs($);

  const status = detectStatus(
    info["status"] ||
      info["situação"] ||
      info["situacao"] ||
      $(".summary-content").filter((_, el) => {
        const text = cleanText($(el).parent().text()).toLowerCase();
        return text.includes("status") || text.includes("situação") || text.includes("situacao");
      }).first().text()
  );

  const author =
    cleanText(
      info["author"] ||
        info["autor"] ||
        $(".summary-content").filter((_, el) => {
          const text = cleanText($(el).parent().text()).toLowerCase();
          return text.includes("author") || text.includes("autor");
        }).first().text()
    ) || "";

  const artist =
    cleanText(
      info["artist"] ||
        info["artista"] ||
        $(".summary-content").filter((_, el) => {
          const text = cleanText($(el).parent().text()).toLowerCase();
          return text.includes("artist") || text.includes("artista");
        }).first().text()
    ) || "";

  return {
    title,
    cover,
    banner,
    description,
    genres,
    status,
    author,
    artist,
    sourceUrl,
    sourceHost: new URL(sourceUrl).hostname,
  };
}
