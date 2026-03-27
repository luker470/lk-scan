import type { Firestore } from "firebase-admin/firestore";
import type { OperatorMetrics } from "@/lib/operatorTypes";

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function resolveDate(dateLike: any): Date | null {
  if (!dateLike) return null;

  if (dateLike instanceof Date) return dateLike;

  if (typeof dateLike?.toDate === "function") {
    const d = dateLike.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (typeof dateLike?.seconds === "number") {
    const d = new Date(dateLike.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof dateLike?._seconds === "number") {
    const d = new Date(dateLike._seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(dateLike);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isDateWithinLast24h(dateLike: any) {
  const d = resolveDate(dateLike);
  if (!d) return false;

  return Date.now() - d.getTime() <= 1000 * 60 * 60 * 24;
}

export async function collectOperatorMetrics(
  db: Firestore
): Promise<OperatorMetrics> {
  const mangasSnap = await db.collection("mangas").get().catch(() => null);
  const usersSnap = await db.collection("users").get().catch(() => null);

  const sourceHealthSnap = await db
    .collection("system")
    .doc("sourceHealth")
    .collection("hosts")
    .get()
    .catch(() => null);

  const incidentsSnap = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .limit(300)
    .get()
    .catch(() => null);

  let totalMangas = 0;
  let totalChapters = 0;
  let totalViews = 0;
  let dayViews = 0;
  let weekViews = 0;
  let monthViews = 0;

  let autoSyncActive = 0;
  let totalBrokenChapters = 0;
  let last24hImportedChapters = 0;

  if (mangasSnap) {
    totalMangas = mangasSnap.size;

    for (const mangaDoc of mangasSnap.docs) {
      const manga = mangaDoc.data() || {};

      totalViews += safeNumber(manga.views, 0);
      dayViews += safeNumber(manga.dayViews, 0);
      weekViews += safeNumber(manga.weekViews, 0);
      monthViews += safeNumber(manga.monthViews, 0);

      totalChapters += safeNumber(manga.chaptersCount, 0);

      if (manga.autoSync) autoSyncActive += 1;

      const chaptersSnap = await mangaDoc.ref
        .collection("chapters")
        .get()
        .catch(() => null);

      if (!chaptersSnap) continue;

      for (const chapterDoc of chaptersSnap.docs) {
        const chapter = chapterDoc.data() || {};
        const pagesCount = safeNumber(
          chapter.pagesCount ?? chapter.pageCount,
          0
        );

        if (pagesCount <= 0) {
          totalBrokenChapters += 1;
        }

        if (isDateWithinLast24h(chapter.updatedAt || chapter.createdAt)) {
          last24hImportedChapters += 1;
        }
      }
    }
  }

  let totalUsers = 0;
  let totalFavorites = 0;
  let totalFollowing = 0;
  let totalHistoryEntries = 0;

  if (usersSnap) {
    totalUsers = usersSnap.size;

    for (const userDoc of usersSnap.docs) {
      const [favoritesSnap, followingSnap, historySnap] = await Promise.all([
        userDoc.ref.collection("favorites").get().catch(() => null),
        userDoc.ref.collection("following").get().catch(() => null),
        userDoc.ref.collection("history").get().catch(() => null),
      ]);

      totalFavorites += favoritesSnap?.size || 0;
      totalFollowing += followingSnap?.size || 0;
      totalHistoryEntries += historySnap?.size || 0;
    }
  }

  let sourcesHealthy = 0;
  let sourcesWarning = 0;
  let sourcesCritical = 0;

  if (sourceHealthSnap) {
    for (const hostDoc of sourceHealthSnap.docs) {
      const data = hostDoc.data() || {};
      const health = String(data.health || "warning").toLowerCase();

      if (health === "healthy") sourcesHealthy += 1;
      else if (health === "critical") sourcesCritical += 1;
      else sourcesWarning += 1;
    }
  }

  let last24hIncidents = 0;

  if (incidentsSnap) {
    for (const doc of incidentsSnap.docs) {
      const data = doc.data() || {};
      if (isDateWithinLast24h(data.createdAt)) {
        last24hIncidents += 1;
      }
    }
  }

  return {
    totalMangas,
    totalChapters,
    totalViews,

    dayViews,
    weekViews,
    monthViews,

    totalUsers,
    totalFavorites,
    totalFollowing,
    totalHistoryEntries,

    totalBrokenChapters,
    autoSyncActive,

    sourcesHealthy,
    sourcesWarning,
    sourcesCritical,

    last24hImportedChapters,
    last24hIncidents,
  };
}