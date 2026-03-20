import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  buildChapterId,
  discoverChaptersFromMangaUrl,
  type DiscoveredChapter,
} from "@/lib/chapterDiscovery";

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

    const sourceUrl = String(data?.sourceUrl || "").trim();
    if (sourceUrl) bySourceUrl.add(sourceUrl);

    const number = Number(data?.number);
    if (Number.isFinite(number)) byNumber.add(number);
  }

  return { bySourceUrl, byNumber, byId };
}

function shouldImportChapter(
  chapter: DiscoveredChapter,
  existing: ExistingChapterMap,
  overwrite?: boolean
) {
  if (overwrite) return true;

  const chapterId = buildChapterId(chapter.number, chapter.title);

  if (existing.byId.has(chapterId)) return false;
  if (chapter.url && existing.bySourceUrl.has(chapter.url)) return false;
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

    await chapterRef.set(
      {
        title: chapter.title || `Capítulo ${chapter.number}`,
        number: safeNumber(chapter.number, 0),
        slug: chapterId,
        sourceUrl: chapter.url,
        sourceSite: chapter.source,
        pages: chapter.pages || [],
        images: chapter.pages || [],
        pagesCount: Array.isArray(chapter.pages) ? chapter.pages.length : 0,
        views: safeNumber(existingData?.views, 0),
        createdAt: existingSnap.exists
          ? existingData?.createdAt || FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    imported += 1;

    if ((chapter.pages || []).length > 0) {
      withPages += 1;
    }
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
  const sourceUrl = String(manga?.sourceUrl || "").trim();

  if (!sourceUrl) {
    throw new Error(`Mangá sem sourceUrl: ${mangaId}`);
  }

  try {
    const chapters = await discoverChaptersFromMangaUrl(sourceUrl, {
      maxChapters: options?.maxChapters,
    });

    if (!chapters.length) {
      await mangaRef.set(
        {
          syncStatus: "warning",
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
        syncStatus: "active",
        lastSyncError: "",
        syncMode: "incremental",
        syncLastRunAt: FieldValue.serverTimestamp(),
        syncImportedLastRun: importedData.imported,
        syncSkippedLastRun: importedData.skipped,
        syncFoundLastRun: chapters.length,
        sourceUrl,
        sourceHost: new URL(sourceUrl).hostname,
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
        syncStatus: "error",
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

  return {
    totalMangas: results.length,
    okCount,
    errorCount,
    importedTotal,
    skippedTotal,
    results,
  };
}