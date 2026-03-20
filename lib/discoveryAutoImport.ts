import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { discoverFromSource } from "@/lib/discoveryScraper";
import { sanitizeMangaTitle, slugify, type DiscoverySourceKey } from "@/lib/discovery";
import {
  discoverChaptersFromMangaUrl,
  buildChapterId,
  type DiscoveredChapter,
} from "@/lib/chapterDiscovery";
import { normalizeAndUpsertManga } from "@/lib/mangaNormalizer";

type AutoImportOptions = {
  maxChapters?: number;
  overwrite?: boolean;
};

type AutoImportItemResult = {
  sourceUrl: string;
  title: string;
  mangaId: string;
  created: boolean;
  imported: number;
  skipped: number;
  withPages: number;
  totalFound: number;
  ok: boolean;
  error?: string;
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

async function importChaptersToManga(
  db: Firestore,
  mangaId: string,
  sourceUrl: string,
  options?: AutoImportOptions
) {
  const mangaRef = db.collection("mangas").doc(mangaId);
  const chapters = await discoverChaptersFromMangaUrl(sourceUrl, {
    maxChapters: options?.maxChapters,
  });

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

  await mangaRef.set(
    {
      autoSync: true,
      syncEnabled: true,
      syncStatus: "active",
      syncMode: "incremental",
      lastSyncError: "",
      syncLastRunAt: FieldValue.serverTimestamp(),
      syncImportedLastRun: imported,
      syncSkippedLastRun: skipped,
      syncFoundLastRun: chapters.length,
      sourceUrl,
      sourceHost: new URL(sourceUrl).hostname,
      chaptersCount,
      lastChapterNumber: safeNumber(lastChapter?.number, 0),
      latestChapter: String(lastChapter?.title || ""),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    totalFound: chapters.length,
    imported,
    skipped,
    withPages,
  };
}

export async function discoverAndAutoImportFromSource(
  db: Firestore,
  source: DiscoverySourceKey,
  options?: AutoImportOptions
) {
  const discovered = await discoverFromSource(source);
  const results: AutoImportItemResult[] = [];

  for (const item of discovered) {
    try {
      const manga = await normalizeAndUpsertManga(db, {
        title: item.title,
        sourceUrl: item.url,
        cover: item.cover || "",
        description: item.description || "",
        genres: item.genres || [],
        latestChapter: item.latestChapter || "",
        sourceSite: item.source || "",
      });

      const imported = await importChaptersToManga(db, manga.mangaId, item.url, options);
      const discoveredId = `${source}__${slugify(item.url)}`;

      await db.collection("discovered_mangas").doc(discoveredId).set(
        {
          source: item.source,
          title: manga.payload.title,
          cleanTitle: manga.payload.title,
          url: item.url,
          cover: item.cover || "",
          latestChapter: item.latestChapter || "",
          description: item.description || "",
          genres: item.genres || [],
          approved: true,
          autoImported: true,
          mangaId: manga.mangaId,
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      results.push({
        sourceUrl: item.url,
        title: manga.payload.title,
        mangaId: manga.mangaId,
        created: manga.created,
        imported: imported.imported,
        skipped: imported.skipped,
        withPages: imported.withPages,
        totalFound: imported.totalFound,
        ok: true,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao importar automaticamente.";

      results.push({
        sourceUrl: item.url,
        title: sanitizeMangaTitle(item.title, item.url),
        mangaId: "",
        created: false,
        imported: 0,
        skipped: 0,
        withPages: 0,
        totalFound: 0,
        ok: false,
        error: message,
      });
    }
  }

  const okCount = results.filter((item) => item.ok).length;
  const errorCount = results.length - okCount;
  const importedTotal = results.reduce((sum, item) => sum + item.imported, 0);

  return {
    ok: true,
    totalDiscovered: discovered.length,
    okCount,
    errorCount,
    importedTotal,
    results,
  };
}