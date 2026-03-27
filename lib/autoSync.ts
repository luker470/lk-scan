import type { Firestore } from "firebase-admin/firestore";
import { markSourceFailure, markSourceSuccess } from "@/lib/operatorLearning";
import { enqueueOperatorTask } from "@/lib/operatorQueue";
import { pickBestSource, getOrderedSources } from "@/lib/sourceResolver";

type SyncOptions = {
  maxChapters?: number;
  overwrite?: boolean;
};

type SyncSingleResult = {
  ok: boolean;
  mangaId: string;
  imported: number;
  updated: number;
  withPages: number;
  usedSourceUrl?: string;
  usedSourceHost?: string;
  attemptedSources?: string[];
  error?: string;
};

type SyncAllResult = {
  ok: boolean;
  processed: number;
  success: number;
  failed: number;
  imported: number;
  updated: number;
  withPages: number;
  items: SyncSingleResult[];
};

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function guessPagesForExistingChapter(chapter: Record<string, any>) {
  const candidates = [
    chapter.pages,
    chapter.images,
    chapter.pageLinks,
    chapter.imageLinks,
    chapter.pageUrls,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate
        .map((item: any) =>
          typeof item === "string"
            ? item.trim()
            : String(
                item?.url ||
                  item?.src ||
                  item?.image ||
                  item?.imageUrl ||
                  ""
              ).trim()
        )
        .filter(Boolean);
    }
  }

  return [];
}

async function updateSourceSuccess(
  db: Firestore,
  mangaRef: FirebaseFirestore.DocumentReference,
  sourceUrl: string,
  result: SyncSingleResult
) {
  const host = (() => {
    try {
      return new URL(sourceUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();

  await mangaRef.set(
    {
      sourceUrl,
      sourceHost: host,
      primarySourceUrl: sourceUrl,
      primarySourceHost: host,
      syncStatus: "active",
      sourceFailCount: 0,
      lastSuccessAt: new Date(),
      lastSyncError: "",
      updatedAt: new Date(),
    },
    { merge: true }
  );

  await markSourceSuccess(db, {
    sourceUrl,
    mangaId: mangaRef.id,
    message: `Sync concluído com sucesso para ${mangaRef.id}.`,
    meta: {
      imported: result.imported,
      updated: result.updated,
      withPages: result.withPages,
    },
  });
}

async function updateSourceFailure(
  db: Firestore,
  mangaRef: FirebaseFirestore.DocumentReference,
  sourceUrl: string,
  errorMessage: string
) {
  const currentSnap = await mangaRef.get().catch(() => null);
  const current = currentSnap?.data() || {};

  await mangaRef.set(
    {
      syncStatus: "warning",
      sourceFailCount: safeNumber(current.sourceFailCount, 0) + 1,
      lastErrorAt: new Date(),
      lastErrorMessage: errorMessage,
      lastSyncError: errorMessage,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  await markSourceFailure(db, {
    sourceUrl,
    mangaId: mangaRef.id,
    message: errorMessage,
  });
}

async function performLocalHeuristicSync(
  db: Firestore,
  mangaRef: FirebaseFirestore.DocumentReference,
  sourceUrl: string,
  options: SyncOptions
): Promise<SyncSingleResult> {
  const chaptersSnap = await mangaRef.collection("chapters").get().catch(() => null);

  if (!chaptersSnap) {
    return {
      ok: false,
      mangaId: mangaRef.id,
      imported: 0,
      updated: 0,
      withPages: 0,
      usedSourceUrl: sourceUrl,
      error: "Não foi possível ler capítulos existentes para sync heurístico.",
    };
  }

  let updated = 0;
  let withPages = 0;
  const maxChapters = options.maxChapters && options.maxChapters > 0 ? options.maxChapters : 999999;
  const docs = chaptersSnap.docs.slice(0, maxChapters);

  for (const chapterDoc of docs) {
    const chapter = chapterDoc.data() || {};
    const pages = guessPagesForExistingChapter(chapter);

    if (pages.length > 0) {
      await chapterDoc.ref.set(
        {
          pages,
          pagesCount: pages.length,
          pageCount: pages.length,
          updatedAt: new Date(),
          recoveryStatus: "validated-by-sync",
          sourceUrl:
            chapter.sourceUrl ||
            chapter.chapterUrl ||
            chapter.url ||
            sourceUrl,
        },
        { merge: true }
      );
      withPages += 1;
      updated += 1;
    }
  }

  return {
    ok: true,
    mangaId: mangaRef.id,
    imported: 0,
    updated,
    withPages,
    usedSourceUrl: sourceUrl,
    usedSourceHost: (() => {
      try {
        return new URL(sourceUrl).hostname.toLowerCase();
      } catch {
        return "";
      }
    })(),
    attemptedSources: [sourceUrl],
  };
}

export async function syncSingleManga(
  db: Firestore,
  mangaId: string,
  options: SyncOptions = {}
): Promise<SyncSingleResult> {
  const mangaRef = db.collection("mangas").doc(mangaId);
  const mangaSnap = await mangaRef.get().catch(() => null);

  if (!mangaSnap?.exists) {
    return {
      ok: false,
      mangaId,
      imported: 0,
      updated: 0,
      withPages: 0,
      error: "Mangá não encontrado.",
    };
  }

  const manga = mangaSnap.data() || {};
  const orderedSources = getOrderedSources(manga);
  const bestSource = pickBestSource(manga);

  if (!bestSource?.url) {
    return {
      ok: false,
      mangaId,
      imported: 0,
      updated: 0,
      withPages: 0,
      error: "Mangá sem fonte configurada.",
    };
  }

  const attemptedSources: string[] = [];

  for (const source of orderedSources.length ? orderedSources : [bestSource]) {
    if (!source?.url || source.isActive === false) continue;
    attemptedSources.push(source.url);

    try {
      const result = await performLocalHeuristicSync(
        db,
        mangaRef,
        source.url,
        options
      );

      if (result.ok) {
        const enrichedResult = {
          ...result,
          attemptedSources,
          usedSourceUrl: source.url,
          usedSourceHost: source.host || normalizeText(source.label),
        };

        await updateSourceSuccess(db, mangaRef, source.url, enrichedResult);

        if (result.withPages <= 0) {
          await enqueueOperatorTask(db, {
            type: "validate-manga",
            priority: "high",
            mangaId,
            sourceUrl: source.url,
            title: `Validar mangá ${mangaId} após sync com baixa qualidade`,
            description:
              "Sync concluído, mas sem páginas suficientes. Validar automaticamente.",
            maxAttempts: 3,
          });
        }

        return enrichedResult;
      }

      await updateSourceFailure(
        db,
        mangaRef,
        source.url,
        result.error || "Falha no sync heurístico."
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao tentar sincronizar.";

      await updateSourceFailure(db, mangaRef, source.url, message);
    }
  }

  await enqueueOperatorTask(db, {
    type: "sync-manga",
    priority: "critical",
    mangaId,
    sourceUrl: bestSource.url,
    title: `Nova tentativa de sync do mangá ${mangaId}`,
    description:
      "Todas as fontes falharam no sync atual. O operador vai tentar novamente automaticamente.",
    maxAttempts: 5,
    meta: {
      attemptedSources,
    },
  });

  return {
    ok: false,
    mangaId,
    imported: 0,
    updated: 0,
    withPages: 0,
    usedSourceUrl: bestSource.url,
    usedSourceHost: bestSource.host,
    attemptedSources,
    error: "Todas as fontes disponíveis falharam no sync.",
  };
}

export async function syncAllAutoSyncMangas(
  db: Firestore,
  options: SyncOptions = {}
): Promise<SyncAllResult> {
  const mangasSnap = await db
    .collection("mangas")
    .where("autoSync", "==", true)
    .get()
    .catch(() => null);

  if (!mangasSnap) {
    return {
      ok: false,
      processed: 0,
      success: 0,
      failed: 0,
      imported: 0,
      updated: 0,
      withPages: 0,
      items: [],
    };
  }

  const items: SyncSingleResult[] = [];
  let success = 0;
  let failed = 0;
  let imported = 0;
  let updated = 0;
  let withPages = 0;

  for (const mangaDoc of mangasSnap.docs) {
    const result = await syncSingleManga(db, mangaDoc.id, options);
    items.push(result);

    if (result.ok) success += 1;
    else failed += 1;

    imported += safeNumber(result.imported, 0);
    updated += safeNumber(result.updated, 0);
    withPages += safeNumber(result.withPages, 0);
  }

  return {
    ok: true,
    processed: mangasSnap.size,
    success,
    failed,
    imported,
    updated,
    withPages,
    items,
  };
}