export type MangaSourceEntry = {
  url: string;
  host: string;
  label?: string;
  priority?: number;
  failCount?: number;
  isActive?: boolean;
  lastSuccessAt?: any;
  lastErrorAt?: any;
  lastErrorMessage?: string;
};

function cleanUrl(url?: string | null) {
  return String(url || "").trim();
}

function hostFromUrl(url?: string | null) {
  try {
    return new URL(String(url || "").trim()).hostname;
  } catch {
    return "";
  }
}

export function buildSourceEntry(
  url: string,
  label?: string,
  priority = 1
): MangaSourceEntry {
  return {
    url: cleanUrl(url),
    host: hostFromUrl(url),
    label: label || hostFromUrl(url),
    priority,
    failCount: 0,
    isActive: true,
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorMessage: "",
  };
}

export function mergeSourceLists(
  current: MangaSourceEntry[] = [],
  incoming: MangaSourceEntry[] = []
) {
  const map = new Map<string, MangaSourceEntry>();

  for (const item of current) {
    const url = cleanUrl(item?.url);
    if (!url) continue;

    map.set(url, {
      url,
      host: item?.host || hostFromUrl(url),
      label: item?.label || hostFromUrl(url),
      priority: Number(item?.priority || 1),
      failCount: Number(item?.failCount || 0),
      isActive: item?.isActive !== false,
      lastSuccessAt: item?.lastSuccessAt || null,
      lastErrorAt: item?.lastErrorAt || null,
      lastErrorMessage: String(item?.lastErrorMessage || ""),
    });
  }

  for (const item of incoming) {
    const url = cleanUrl(item?.url);
    if (!url) continue;

    const prev = map.get(url);

    map.set(url, {
      url,
      host: item?.host || prev?.host || hostFromUrl(url),
      label: item?.label || prev?.label || hostFromUrl(url),
      priority: Number(item?.priority || prev?.priority || 1),
      failCount: Number(prev?.failCount || item?.failCount || 0),
      isActive:
        typeof item?.isActive === "boolean"
          ? item.isActive
          : prev?.isActive !== false,
      lastSuccessAt: prev?.lastSuccessAt || item?.lastSuccessAt || null,
      lastErrorAt: prev?.lastErrorAt || item?.lastErrorAt || null,
      lastErrorMessage: String(
        prev?.lastErrorMessage || item?.lastErrorMessage || ""
      ),
    });
  }

  return [...map.values()].sort(
    (a, b) => Number(a.priority || 99) - Number(b.priority || 99)
  );
}

export function buildPrimaryAndBackups(
  primaryUrl?: string | null,
  currentBackups: MangaSourceEntry[] = [],
  newCandidateUrls: string[] = []
) {
  const primary = cleanUrl(primaryUrl);
  const primaryEntry = primary
    ? buildSourceEntry(primary, hostFromUrl(primary), 1)
    : null;

  const incomingBackups = newCandidateUrls
    .map((url, index) => buildSourceEntry(url, hostFromUrl(url), index + 2))
    .filter((item) => item.url && item.url !== primary);

  const backupSources = mergeSourceLists(currentBackups, incomingBackups).filter(
    (item) => item.url !== primary
  );

  return {
    primarySourceUrl: primaryEntry?.url || "",
    primarySourceHost: primaryEntry?.host || "",
    backupSources,
  };
}

export function getAllCandidateSourceUrls(manga: Record<string, any>) {
  const current = [
    String(manga?.primarySourceUrl || "").trim(),
    String(manga?.sourceUrl || "").trim(),
  ].filter(Boolean);

  const backups = Array.isArray(manga?.backupSources)
    ? manga.backupSources
        .map((item: any) => String(item?.url || "").trim())
        .filter(Boolean)
    : [];

  return [...new Set([...current, ...backups])];
}

export function getOrderedSources(manga: Record<string, any>) {
  const primary = String(
    manga?.primarySourceUrl || manga?.sourceUrl || ""
  ).trim();

  const backupSources: MangaSourceEntry[] = Array.isArray(manga?.backupSources)
    ? manga.backupSources
    : [];

  const ordered: MangaSourceEntry[] = [];

  if (primary) {
    ordered.push({
      url: primary,
      host: hostFromUrl(primary),
      label: hostFromUrl(primary),
      priority: 1,
      failCount: Number(manga?.sourceFailCount || 0),
      isActive: true,
      lastSuccessAt: manga?.lastSuccessAt || null,
      lastErrorAt: manga?.lastErrorAt || null,
      lastErrorMessage: String(manga?.lastErrorMessage || ""),
    });
  }

  ordered.push(
    ...backupSources
      .filter((item) => item?.url && item.url !== primary)
      .sort((a, b) => Number(a?.priority || 99) - Number(b?.priority || 99))
  );

  return ordered;
}

export function pickBestSource(manga: Record<string, any>) {
  const ordered = getOrderedSources(manga);

  const activeFirst = ordered.filter((item) => item?.isActive !== false);
  if (activeFirst.length > 0) return activeFirst[0];

  return ordered[0] || null;
}