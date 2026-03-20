export type DiscoverySourceKey =
  | "mangasonline"
  | "mangaonlinered";

export type DiscoveryItem = {
  source: DiscoverySourceKey;
  title: string;
  url: string;
  cover?: string;
  latestChapter?: string;
  description?: string;
  genres?: string[];
};

export type DiscoverySourceConfig = {
  key: DiscoverySourceKey;
  label: string;
  enabled: boolean;
  listUrls: string[];
};

export const DISCOVERY_SOURCES: DiscoverySourceConfig[] = [
  {
    key: "mangasonline",
    label: "Mangás Online",
    enabled: true,
    listUrls: [
      "https://mangasonline.blog/manga/",
      "https://mangasonline.blog/manga/page/2/",
      "https://mangasonline.blog/manga/page/3/",
    ],
  },
  {
    key: "mangaonlinered",
    label: "Manga Online Red",
    enabled: true,
    listUrls: [
      "https://mangaonline.red/manga/",
      "https://mangaonline.red/manga/page/2/",
      "https://mangaonline.red/manga/page/3/",
    ],
  },
];

export function normalizeText(input?: string | null) {
  return (input || "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLooseText(input?: string | null) {
  return normalizeText(input)
    .replace(/[“”"']/g, "")
    .trim();
}

export function slugify(input: string) {
  return normalizeLooseText(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function absoluteUrl(base: string, maybeRelative?: string | null) {
  if (!maybeRelative) return "";
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative || "";
  }
}

export function uniqueByUrlAndTitle(items: DiscoveryItem[]) {
  const seen = new Set<string>();
  const out: DiscoveryItem[] = [];

  for (const item of items) {
    const key = `${item.source}::${item.url}::${normalizeLooseText(item.title).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

export function extractTitleFromUrl(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";

    return toDisplayTitle(
      decodeURIComponent(last)
        .replace(/\.(jpg|jpeg|png|webp|gif)$/i, "")
        .replace(/[._-]+/g, " ")
        .trim()
    );
  } catch {
    return "";
  }
}

export function looksLikeImageFilename(value?: string | null) {
  const text = normalizeLooseText(value).toLowerCase();
  if (!text) return true;

  return (
    /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(text) ||
    text.includes(".jpg") ||
    text.includes(".jpeg") ||
    text.includes(".png") ||
    text.includes(".webp") ||
    text.includes("format-webp") ||
    text.includes("ac uf") ||
    /^[a-f0-9-]{20,}$/i.test(text.replace(/\s+/g, "")) ||
    text.length < 3
  );
}

export function toDisplayTitle(value?: string | null) {
  const text = normalizeLooseText(value);
  if (!text) return "";

  return text
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (
        /^(of|the|and|in|on|at|to|for|da|de|do|dos|das|no|na|nos|nas)$/i.test(lower)
      ) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeMangaTitle(rawTitle?: string | null, rawUrl?: string | null) {
  const title = toDisplayTitle(rawTitle);

  if (title && !looksLikeImageFilename(title)) {
    return title;
  }

  const fromUrl = rawUrl ? extractTitleFromUrl(rawUrl) : "";
  if (fromUrl && !looksLikeImageFilename(fromUrl)) {
    return fromUrl;
  }

  return title || fromUrl || "Sem título";
}