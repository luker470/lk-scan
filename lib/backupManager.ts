import { FieldValue, type Firestore } from "firebase-admin/firestore";

type BackupChapterResult = {
  chapterId: string;
  title: string;
  ok: boolean;
  pagesCount: number;
  error?: string;
};

type BackupMangaResult = {
  mangaId: string;
  title: string;
  totalChapters: number;
  backedUp: number;
  skipped: number;
  errorCount: number;
  results: BackupChapterResult[];
};

function safeString(value: unknown) {
  return String(value || "").trim();
}

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export async function backupSingleMangaChapters(
  db: Firestore,
  mangaId: string
): Promise<BackupMangaResult> {
  const mangaRef = db.collection("mangas").doc(mangaId);
  const mangaSnap = await mangaRef.get();

  if (!mangaSnap.exists) {
    throw new Error(`Mangá não encontrado: ${mangaId}`);
  }

  const manga = mangaSnap.data() as Record<string, any>;
  const title = safeString(manga?.title || mangaId);

  const chaptersSnap = await mangaRef.collection("chapters").get();

  const results: BackupChapterResult[] = [];
  let backedUp = 0;
  let skipped = 0;
  let errorCount = 0;

  for (const doc of chaptersSnap.docs) {
    const chapter = doc.data() as Record<string, any>;
    const pages = safeArray(chapter?.pages);
    const title = safeString(chapter?.title || doc.id);
    const sourceUrl = safeString(chapter?.sourceUrl);

    if (!pages.length) {
      skipped += 1;
      results.push({
        chapterId: doc.id,
        title,
        ok: false,
        pagesCount: 0,
        error: "Capítulo sem páginas para backup.",
      });
      continue;
    }

    try {
      await doc.ref.set(
        {
          backup: {
            enabled: true,
            status: "ready",
            snapshotAt: FieldValue.serverTimestamp(),
            sourceUrl,
            pages,
            pagesCount: pages.length,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      backedUp += 1;

      results.push({
        chapterId: doc.id,
        title,
        ok: true,
        pagesCount: pages.length,
      });
    } catch (error: unknown) {
      errorCount += 1;

      results.push({
        chapterId: doc.id,
        title,
        ok: false,
        pagesCount: pages.length,
        error: error instanceof Error ? error.message : "Erro ao gerar backup.",
      });
    }
  }

  await mangaRef.set(
    {
      backupEnabled: true,
      backupLastRunAt: FieldValue.serverTimestamp(),
      backupChaptersCount: backedUp,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    mangaId,
    title,
    totalChapters: chaptersSnap.size,
    backedUp,
    skipped,
    errorCount,
    results,
  };
}

export async function backupAllAutoSyncMangas(db: Firestore) {
  const snap = await db.collection("mangas").where("autoSync", "==", true).get();

  const results: BackupMangaResult[] = [];

  for (const doc of snap.docs) {
    try {
      const result = await backupSingleMangaChapters(db, doc.id);
      results.push(result);
    } catch (error: unknown) {
      results.push({
        mangaId: doc.id,
        title: safeString(doc.data()?.title || doc.id),
        totalChapters: 0,
        backedUp: 0,
        skipped: 0,
        errorCount: 1,
        results: [
          {
            chapterId: "",
            title: "Erro geral",
            ok: false,
            pagesCount: 0,
            error: error instanceof Error ? error.message : "Erro ao gerar backup do mangá.",
          },
        ],
      });
    }
  }

  return {
    totalMangas: results.length,
    okCount: results.filter((item) => item.errorCount === 0).length,
    errorCount: results.filter((item) => item.errorCount > 0).length,
    totalBackedUp: results.reduce((sum, item) => sum + item.backedUp, 0),
    totalSkipped: results.reduce((sum, item) => sum + item.skipped, 0),
    results,
  };
}