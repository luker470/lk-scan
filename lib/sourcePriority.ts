export const SOURCE_PRIORITY = [
  "mangasonline.blog",
  "mangaonline.red",
  "mangaschan.net",
  "tsuki-mangas.com",
];

export function getSourcePriorityScore(host: string) {
  const index = SOURCE_PRIORITY.findIndex((h) => host.includes(h));
  return index === -1 ? 999 : index;
}

type BackupSource = {
  url?: string;
  host?: string;
  label?: string;
  priority?: number;
  failCount?: number;
  isActive?: boolean;
  lastSuccessAt?: any;
  lastErrorAt?: any;
  lastErrorMessage?: string;
};

export type PreferredSource = {
  url: string;
  host: string;
  label: string;
  priority: number;
  failCount: number;
  isActive: boolean;
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

export function pickPreferredSource(manga: Record<string, any>): PreferredSource | null {
  const primaryUrl = cleanUrl(manga?.primarySourceUrl || manga?.sourceUrl || "");
  const backups: BackupSource[] = Array.isArray(manga?.backupSources)
    ? manga.backupSources
    : [];

  const candidates: PreferredSource[] = [];

  if (primaryUrl) {
    candidates.push({
      url: primaryUrl,
      host: hostFromUrl(primaryUrl),
      label: hostFromUrl(primaryUrl),
      priority: 1,
      failCount: Number(manga?.sourceFailCount || 0),
      isActive: manga?.sourceHealth !== "down",
    });
  }

  for (const item of backups) {
    const url = cleanUrl(item?.url);
    if (!url) continue;
    if (url === primaryUrl) continue;

    candidates.push({
      url,
      host: String(item?.host || hostFromUrl(url)),
      label: String(item?.label || item?.host || hostFromUrl(url)),
      priority: Number(item?.priority || 99),
      failCount: Number(item?.failCount || 0),
      isActive: item?.isActive !== false,
    });
  }

  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.failCount !== b.failCount) return a.failCount - b.failCount;
    return a.priority - b.priority;
  });

  return sorted[0] || null;
}
