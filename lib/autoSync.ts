import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  buildChapterId,
  discoverChaptersFromMangaUrl,
  type DiscoveredChapter,
} from "@/lib/chapterDiscovery";
import { pickPreferredSource } from "@/lib/sourcePriority";

export type SyncMangaResult = {
  mangaId: string;
  title: string;
  sourceUrl: string;
  totalFound: number;
  imported: number;
  skipped: number;
  withPages: number;
  chaptersCount: number;
  latestChapter: string;
  lastChapterNumber: number;
  ok: boolean;
  error?: string;
};

type SyncOptions = {
  maxChapters?: number;
  overwrite?: boolean;
};

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeUrl(url: string) {
  return String(url || "").trim().replace(/\/+$/, "");
}

type ExistingChapterMap = {
  bySourceUrl: Set<string>;
  byNumber: Set<number>;
  byId: Set<string>;
};

async function loadExistingChapterMap(
  db: Firestore,
  mangaId: string
): Promise<ExistingChapterMap> {
  const snap = await db.collection("mangas").doc(mangaId).collection("chapters").get();

  const bySourceUrl = new Set<string>();
  const byNumber = new Set<number>();
  const byId = new Set<string>();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, any>;

    byId.add(doc.id);

    const sourceUrl = normalizeUrl(data?.sourceUrl || "");
    if (sourceUrl) bySourceUrl.add(sourceUrl);

    const number = Number(data?.number);
    if (Number.isFinite(number)) byNumber.add(number);
  }

  return { bySourceUrl, byNumber, byId };
}

function sanitizePages(pages: unknown) {
  if (!Array.isArray(pages)) return [];

  const seen = new Set<string>();

  return pages.filter((item) => {
    if (typeof item === "string") {
      const key = normalizeUrl(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }

    if (item && typeof item === "object") {
      const raw =
        String((item as any).mirrorUrl || "").trim() ||
        String((item as any).storageUrl || "").trim() ||
        String((item as any).url || "").trim() ||
        String((item as any).src || "").trim();

      const key = normalizeUrl(raw);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }

    return false;
  });
}

function shouldImportChapter(
  chapter: DiscoveredChapter,
  existing: ExistingChapterMap,
  overwrite?: boolean
) {
  if (overwrite) return true;

  const chapterId = buildChapterId(chapter.number, chapter.title);
  const normalizedSourceUrl = normalizeUrl(chapter.url || "");

  if (existing.byId.has(chapterId)) return false;
  if (normalizedSourceUrl && existing.bySourceUrl.has(normalizedSourceUrl)) return false;
  if (Number.isFinite(chapter.number) && existing.byNumber.has(chapter.number)) return false;

  return true;
}

async function importDiscoveredChapters(
  db: Firestore,
  mangaId: string,
  chapters: DiscoveredChapter[],
  options?: SyncOptions
) {
  const mangaRef = db.collection("mangas").doc(mangaId);
  const existing = await loadExistingChapterMap(db, mangaId);

  let imported = 0;
  let skipped = 0;
  let withPages = 0;

  for (const chapter of chapters) {
    const chapterId = buildChapterId(chapter.number, chapter.title);

    if (!shouldImportChapter(chapter, existing, options?.overwrite)) {
      skipped += 1;
      continue;
    }

    const chapterRef = mangaRef.collection("chapters").doc(chapterId);
    const existingSnap = await chapterRef.get();
    const existingData = existingSnap.exists ? existingSnap.data() || {} : {};

    const sanitizedPages = sanitizePages(chapter.pages || []);
    const normalizedSourceUrl = normalizeUrl(chapter.url || "");

    await chapterRef.set(
      {
        title: chapter.title || `Capítulo ${chapter.number}`,
        number: safeNumber(chapter.number, 0),
        slug: chapterId,
        sourceUrl: normalizedSourceUrl,
        sourceSite: chapter.source,
        pages: sanitizedPages,
        images: sanitizedPages,
        pagesCount: sanitizedPages.length,
        brokenPages: 0,
        normalized: true,
        views: safeNumber(existingData?.views, 0),
        createdAt: existingSnap.exists
          ? existingData?.createdAt || FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    imported += 1;

    if (sanitizedPages.length > 0) {
      withPages += 1;
    }

    existing.byId.add(chapterId);
    if (normalizedSourceUrl) existing.bySourceUrl.add(normalizedSourceUrl);

    const number = safeNumber(chapter.number, NaN);
    if (Number.isFinite(number)) existing.byNumber.add(number);
  }

  const allChaptersSnap = await mangaRef.collection("chapters").get();
  const allChapters = allChaptersSnap.docs.map((doc) => doc.data() as Record<string, any>);
  const chaptersCount = allChapters.length;

  const sortedByNumber = [...allChapters].sort(
    (a, b) => safeNumber(a?.number, 0) - safeNumber(b?.number, 0)
  );

  const lastChapter = sortedByNumber[sortedByNumber.length - 1] || {};

  return {
    imported,
    skipped,
    withPages,
    chaptersCount,
    latestChapter: String(lastChapter?.title || ""),
    lastChapterNumber: safeNumber(lastChapter?.number, 0),
  };
}

function shouldSkipSyncByRecentRun(manga: Record<string, any>) {
  const lastRun = manga?.syncLastRunAt?.toDate?.() || null;
  if (!lastRun) return false;

  const now = Date.now();
  const diffMs = now - lastRun.getTime();

  return diffMs < 1000 * 60 * 20;
}

export async function syncSingleManga(
  db: Firestore,
  mangaId: string,
  options?: SyncOptions
): Promise<SyncMangaResult> {
  const mangaRef = db.collection("mangas").doc(mangaId);
  const mangaSnap = await mangaRef.get();

  if (!mangaSnap.exists) {
    throw new Error(`Mangá não encontrado: ${mangaId}`);
  }

  const manga = mangaSnap.data() as Record<string, any>;
  const title = String(manga?.title || mangaId);

  const preferredSource = pickPreferredSource(manga);
  const sourceUrl = normalizeUrl(preferredSource?.url || manga?.sourceUrl || "");

  if (!sourceUrl) {
    throw new Error(`Mangá sem sourceUrl: ${mangaId}`);
  }

  if (!options?.overwrite && shouldSkipSyncByRecentRun(manga)) {
    return {
      mangaId,
      title,
      sourceUrl,
      totalFound: 0,
      imported: 0,
      skipped: 0,
      withPages: 0,
      chaptersCount: safeNumber(manga?.chaptersCount, 0),
      latestChapter: String(manga?.latestChapter || ""),
      lastChapterNumber: safeNumber(manga?.lastChapterNumber, 0),
      ok: true,
    };
  }

  try {
    const chapters = await discoverChaptersFromMangaUrl(sourceUrl, {
      maxChapters: options?.maxChapters,
    });

    if (!chapters.length) {
      await mangaRef.set(
        {
          syncEnabled: true,
          syncStatus: "warning",
          sourceHealth: "warning",
          lastSyncError: "Nenhum capítulo encontrado no sourceUrl.",
          syncLastRunAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        mangaId,
        title,
        sourceUrl,
        totalFound: 0,
        imported: 0,
        skipped: 0,
        withPages: 0,
        chaptersCount: safeNumber(manga?.chaptersCount, 0),
        latestChapter: String(manga?.latestChapter || ""),
        lastChapterNumber: safeNumber(manga?.lastChapterNumber, 0),
        ok: false,
        error: "Nenhum capítulo encontrado no sourceUrl.",
      };
    }

    const importedData = await importDiscoveredChapters(db, mangaId, chapters, options);

    await mangaRef.set(
      {
        autoSync: true,
        syncEnabled: true,
        syncStatus: "active",
        sourceHealth: "healthy",
        lastSyncError: "",
        syncMode: "incremental",
        syncLastRunAt: FieldValue.serverTimestamp(),
        syncImportedLastRun: importedData.imported,
        syncSkippedLastRun: importedData.skipped,
        syncFoundLastRun: chapters.length,
        sourceUrl,
        sourceHost: new URL(sourceUrl).hostname,
        primarySourceUrl: sourceUrl,
        primarySourceHost: new URL(sourceUrl).hostname,
        chaptersCount: importedData.chaptersCount,
        lastChapterNumber: importedData.lastChapterNumber,
        latestChapter: importedData.latestChapter,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      mangaId,
      title,
      sourceUrl,
      totalFound: chapters.length,
      imported: importedData.imported,
      skipped: importedData.skipped,
      withPages: importedData.withPages,
      chaptersCount: importedData.chaptersCount,
      latestChapter: importedData.latestChapter,
      lastChapterNumber: importedData.lastChapterNumber,
      ok: true,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Erro ao sincronizar.";

    await mangaRef.set(
      {
        syncEnabled: true,
        syncStatus: "error",
        sourceHealth: "warning",
        lastSyncError: message,
        syncLastRunAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      mangaId,
      title,
      sourceUrl,
      totalFound: 0,
      imported: 0,
      skipped: 0,
      withPages: 0,
      chaptersCount: safeNumber(manga?.chaptersCount, 0),
      latestChapter: String(manga?.latestChapter || ""),
      lastChapterNumber: safeNumber(manga?.lastChapterNumber, 0),
      ok: false,
      error: message,
    };
  }
}

export async function syncAllAutoSyncMangas(
  db: Firestore,
  options?: SyncOptions
) {
  const snap = await db.collection("mangas").where("autoSync", "==", true).get();

  const results: SyncMangaResult[] = [];

  for (const doc of snap.docs) {
    const result = await syncSingleManga(db, doc.id, options);
    results.push(result);
  }

  const okCount = results.filter((item) => item.ok).length;
  const errorCount = results.length - okCount;
  const importedTotal = results.reduce((sum, item) => sum + item.imported, 0);
  const skippedTotal = results.reduce((sum, item) => sum + item.skipped, 0);
  const withPagesTotal = results.reduce((sum, item) => sum + item.withPages, 0);

  return {
    totalMangas: results.length,
    okCount,
    errorCount,
    importedTotal,
    skippedTotal,
    withPagesTotal,
    results,
  };
}