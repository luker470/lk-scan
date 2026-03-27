import type { Firestore } from "firebase-admin/firestore";
import * as discoveryLib from "@/lib/discovery";
import * as mangaDetailsLib from "@/lib/mangaDetails";
import * as chapterDiscoveryLib from "@/lib/chapterDiscovery";
import type { DiscoverySourceKey } from "@/lib/discovery";
import {
  buildPrimaryAndBackups,
  getAllCandidateSourceUrls,
} from "@/lib/sourceResolver";
import {
  markSourceFailure,
  markSourceSuccess,
} from "@/lib/operatorLearning";
import { enqueueOperatorTask } from "@/lib/operatorQueue";

type AutoImportOptions = {
  maxChapters?: number;
  overwrite?: boolean;
};

type AutoImportItemResult = {
  ok: boolean;
  mangaId: string;
  title: string;
  source: string;
  discoveredChapters: number;
  importedChapters: number;
  chaptersWithPages: number;
  skipped: boolean;
  reason?: string;
  error?: string;
};

type AutoImportRunResult = {
  ok: boolean;
  totalDiscovered: number;
  okCount: number;
  errorCount: number;
  importedTotal: number;
  results: AutoImportItemResult[];
};

function pickFn<T extends (...args: any[]) => any>(
  candidates: Array<unknown>
): T | null {
  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate as T;
    }
  }
  return null;
}

async function callDiscoverMangasFromSource(source: DiscoverySourceKey) {
  const fn = pickFn<(...args: any[]) => Promise<any[]>>([
    (discoveryLib as any).discoverMangasFromSource,
    (discoveryLib as any).discoverFromSource,
    (discoveryLib as any).discoverSourceMangas,
    (discoveryLib as any).discoverMangas,
  ]);

  if (!fn) {
    throw new Error(
      "Nenhuma função compatível de descoberta foi encontrada em lib/discovery.ts."
    );
  }

  const result = await fn(source);
  return Array.isArray(result) ? result : [];
}

async function callFetchMangaDetails(
  source: DiscoverySourceKey,
  url: string
) {
  const fn = pickFn<(...args: any[]) => Promise<any>>([
    (mangaDetailsLib as any).fetchMangaDetails,
    (mangaDetailsLib as any).getMangaDetails,
    (mangaDetailsLib as any).fetchDetails,
  ]);

  if (!fn) {
    throw new Error(
      "Nenhuma função compatível de detalhes foi encontrada em lib/mangaDetails.ts."
    );
  }

  try {
    return await fn(source, url);
  } catch {
    return await fn(url);
  }
}

async function callDiscoverChaptersFromManga(
  source: DiscoverySourceKey,
  url: string
) {
  const fn = pickFn<(...args: any[]) => Promise<any[]>>([
    (chapterDiscoveryLib as any).discoverChaptersFromManga,
    (chapterDiscoveryLib as any).discoverChaptersFromMangaUrl,
    (chapterDiscoveryLib as any).discoverChapters,
    (chapterDiscoveryLib as any).discoverMangaChapters,
  ]);

  if (!fn) {
    throw new Error(
      "Nenhuma função compatível de capítulos foi encontrada em lib/chapterDiscovery.ts."
    );
  }

  try {
    const result = await fn(source, url);
    return Array.isArray(result) ? result : [];
  } catch {
    const result = await fn(url);
    return Array.isArray(result) ? result : [];
  }
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 120);
}

function extractPossibleUrls(input: any): string[] {
  const values = [
    input?.url,
    input?.sourceUrl,
    input?.link,
    input?.href,
    input?.mangaUrl,
    input?.pageUrl,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  return Array.from(new Set(values));
}

function hostFromUrl(url?: string | null) {
  try {
    return new URL(String(url || "").trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function chapterDocId(index: number, chapter: any) {
  const raw =
    chapter?.id ||
    chapter?.chapterId ||
    chapter?.number ||
    chapter?.slug ||
    index + 1;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    return String(Math.floor(numeric)).padStart(3, "0");
  }

  return (
    slugify(String(raw || index + 1)).slice(0, 32) ||
    String(index + 1).padStart(3, "0")
  );
}

function guessPages(chapter: any): string[] {
  const arrays = [
    chapter?.pages,
    chapter?.images,
    chapter?.pageLinks,
    chapter?.imageLinks,
    chapter?.pageUrls,
  ];

  const pages = arrays
    .flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(
          item.url ||
            item.src ||
            item.image ||
            item.imageUrl ||
            item.proxyUrl ||
            item.originalUrl ||
            ""
        ).trim();
      }
      return "";
    })
    .filter(Boolean);

  return Array.from(new Set(pages));
}

async function findExistingMangaBySourceUrl(
  db: Firestore,
  urls: string[]
) {
  const mangasSnap = await db
    .collection("mangas")
    .limit(5000)
    .get()
    .catch(() => null);

  if (!mangasSnap) return null;

  const normalized = new Set(urls.map((url) => normalizeText(url)));

  for (const doc of mangasSnap.docs) {
    const data = doc.data() || {};
    const candidates = getAllCandidateSourceUrls(data);

    if (candidates.some((url) => normalized.has(normalizeText(url)))) {
      return doc;
    }
  }

  return null;
}

async function createOrUpdateManga(
  db: Firestore,
  params: {
    source: DiscoverySourceKey;
    item: any;
    details: any;
  }
) {
  const discoveredUrls = [
    ...extractPossibleUrls(params.item),
    ...extractPossibleUrls(params.details),
  ];

  const title = normalizeText(
    params.details?.title || params.item?.title || params.item?.name || "Sem título"
  );

  const existing = await findExistingMangaBySourceUrl(db, discoveredUrls);
  const mangaRef = existing
    ? existing.ref
    : db.collection("mangas").doc(slugify(title) || crypto.randomUUID());

  const current = existing?.data() || {};

  const sourceBuild = buildPrimaryAndBackups(
    discoveredUrls[0] || current?.primarySourceUrl || current?.sourceUrl || "",
    Array.isArray(current?.backupSources) ? current.backupSources : [],
    discoveredUrls
  );

  await mangaRef.set(
    {
      title,
      altTitle: normalizeText(params.details?.altTitle || current?.altTitle || ""),
      description: normalizeText(
        params.details?.description || current?.description || ""
      ),
      cover: normalizeText(params.details?.cover || current?.cover || ""),
      genre: Array.isArray(params.details?.genre)
        ? params.details.genre
        : Array.isArray(current?.genre)
        ? current.genre
        : [],
      source: params.source,
      sourceUrl:
        sourceBuild.primarySourceUrl ||
        normalizeText(current?.sourceUrl || discoveredUrls[0] || ""),
      sourceHost:
        sourceBuild.primarySourceHost ||
        normalizeText(current?.sourceHost || hostFromUrl(discoveredUrls[0] || "")),
      primarySourceUrl: sourceBuild.primarySourceUrl,
      primarySourceHost: sourceBuild.primarySourceHost,
      backupSources: sourceBuild.backupSources,
      autoSync: current?.autoSync !== false,
      syncStatus: "active",
      lastDiscoveryAt: new Date(),
      lastSuccessAt: new Date(),
      updatedAt: new Date(),
      createdAt: current?.createdAt || new Date(),
    },
    { merge: true }
  );

  return mangaRef;
}

async function importChaptersForManga(
  db: Firestore,
  mangaRef: FirebaseFirestore.DocumentReference,
  source: DiscoverySourceKey,
  details: any,
  options: AutoImportOptions
) {
  const discovered = await callDiscoverChaptersFromManga(
    source,
    details?.url || details?.sourceUrl || details?.mangaUrl || ""
  ).catch(() => []);

  const maxChapters =
    options.maxChapters && options.maxChapters > 0
      ? options.maxChapters
      : discovered.length;

  const selected = discovered.slice(0, maxChapters);

  let importedChapters = 0;
  let chaptersWithPages = 0;

  for (let index = 0; index < selected.length; index += 1) {
    const chapter = selected[index] || {};
    const docId = chapterDocId(index, chapter);
    const chapterRef = mangaRef.collection("chapters").doc(docId);
    const chapterSnap = await chapterRef.get().catch(() => null);

    if (chapterSnap?.exists && !options.overwrite) {
      continue;
    }

    const pages = guessPages(chapter);

    await chapterRef.set(
      {
        title: normalizeText(
          chapter?.title || `Capítulo ${chapter?.number || index + 1}`
        ),
        number: safeNumber(chapter?.number, index + 1),
        sourceUrl: normalizeText(
          chapter?.sourceUrl ||
            chapter?.chapterUrl ||
            chapter?.url ||
            chapter?.originUrl ||
            details?.url ||
            ""
        ),
        pages,
        pagesCount: pages.length,
        pageCount: pages.length,
        importedAt: new Date(),
        updatedAt: new Date(),
        createdAt: chapterSnap?.data()?.createdAt || new Date(),
      },
      { merge: true }
    );

    importedChapters += 1;
    if (pages.length > 0) chaptersWithPages += 1;

    if (pages.length <= 0) {
      await enqueueOperatorTask(db, {
        type: "recovery-chapter",
        priority: "high",
        mangaId: mangaRef.id,
        chapterId: docId,
        sourceUrl: normalizeText(
          chapter?.sourceUrl ||
            chapter?.chapterUrl ||
            chapter?.url ||
            ""
        ),
        title: `Recovery do capítulo ${docId} de ${mangaRef.id}`,
        description:
          "Capítulo importado sem páginas válidas. Recovery automático necessário.",
        maxAttempts: 5,
      });
    }
  }

  await mangaRef.set(
    {
      chaptersCount: selected.length,
      lastDiscoveryImportAt: new Date(),
      updatedAt: new Date(),
      lastImportStats: {
        discoveredChapters: selected.length,
        importedChapters,
        chaptersWithPages,
      },
    },
    { merge: true }
  );

  return {
    discoveredChapters: selected.length,
    importedChapters,
    chaptersWithPages,
  };
}

async function processSingleDiscoveredManga(
  db: Firestore,
  source: DiscoverySourceKey,
  item: any,
  options: AutoImportOptions
): Promise<AutoImportItemResult> {
  const possibleUrls = extractPossibleUrls(item);
  const mainUrl = possibleUrls[0] || "";

  const details = await callFetchMangaDetails(source, mainUrl).catch(
    (error: unknown) => {
      throw new Error(
        error instanceof Error ? error.message : "Falha ao obter detalhes do mangá."
      );
    }
  );

  const mangaRef = await createOrUpdateManga(db, {
    source,
    item,
    details,
  });

  const chapterResult = await importChaptersForManga(
    db,
    mangaRef,
    source,
    details,
    options
  );

  const qualityLow =
    chapterResult.discoveredChapters > 0 &&
    chapterResult.chaptersWithPages === 0;

  await markSourceSuccess(db, {
    host: source,
    sourceUrl: mainUrl,
    mangaId: mangaRef.id,
    message: `Auto-import processado com sucesso para ${mangaRef.id}.`,
    meta: {
      discoveredChapters: chapterResult.discoveredChapters,
      importedChapters: chapterResult.importedChapters,
      chaptersWithPages: chapterResult.chaptersWithPages,
    },
  });

  if (qualityLow) {
    await enqueueOperatorTask(db, {
      type: "validate-manga",
      priority: "high",
      mangaId: mangaRef.id,
      sourceUrl: mainUrl,
      title: `Validar mangá ${mangaRef.id} após auto-import`,
      description:
        "A descoberta/importação ocorreu, mas os capítulos vieram sem páginas válidas.",
      maxAttempts: 3,
      meta: {
        source,
        chapterResult,
      },
    });
  }

  return {
    ok: true,
    mangaId: mangaRef.id,
    title: normalizeText(
      details?.title || item?.title || item?.name || mangaRef.id
    ),
    source,
    discoveredChapters: chapterResult.discoveredChapters,
    importedChapters: chapterResult.importedChapters,
    chaptersWithPages: chapterResult.chaptersWithPages,
    skipped: false,
  };
}

export async function discoverAndAutoImportFromSource(
  db: Firestore,
  source: DiscoverySourceKey,
  options: AutoImportOptions = {}
): Promise<AutoImportRunResult> {
  const discoveredItems = await callDiscoverMangasFromSource(source).catch(
    (error: unknown) => {
      throw new Error(
        error instanceof Error
          ? error.message
          : `Falha ao descobrir mangás da fonte ${source}.`
      );
    }
  );

  const results: AutoImportItemResult[] = [];
  let okCount = 0;
  let errorCount = 0;
  let importedTotal = 0;

  for (const item of discoveredItems) {
    try {
      const result = await processSingleDiscoveredManga(
        db,
        source,
        item,
        options
      );
      results.push(result);
      okCount += 1;
      importedTotal += result.importedChapters;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro no auto-import do item.";

      const title = normalizeText(item?.title || item?.name || "Sem título");
      const urls = extractPossibleUrls(item);
      const mainUrl = urls[0] || "";

      await markSourceFailure(db, {
        host: source,
        sourceUrl: mainUrl,
        message: `Falha no auto-import de "${title}": ${message}`,
      });

      await enqueueOperatorTask(db, {
        type: "discover-source",
        priority: "high",
        source,
        sourceUrl: mainUrl,
        title: `Revisar falha de auto-import em ${title}`,
        description:
          "Falha durante descoberta/importação automática. Nova revisão foi enfileirada.",
        maxAttempts: 4,
        meta: {
          title,
          error: message,
        },
      });

      results.push({
        ok: false,
        mangaId: "",
        title,
        source,
        discoveredChapters: 0,
        importedChapters: 0,
        chaptersWithPages: 0,
        skipped: false,
        error: message,
      });

      errorCount += 1;
    }
  }

  await db.collection("system").doc("actions").collection("items").add({
    type: "discovery-auto-import-run",
    status: errorCount > 0 ? "warning" : "success",
    message:
      errorCount > 0
        ? `Discovery/auto-import da fonte ${source} concluído com alertas.`
        : `Discovery/auto-import da fonte ${source} concluído com sucesso.`,
    meta: {
      source,
      totalDiscovered: discoveredItems.length,
      okCount,
      errorCount,
      importedTotal,
    },
    createdAt: new Date(),
  });

  return {
    ok: errorCount === 0,
    totalDiscovered: discoveredItems.length,
    okCount,
    errorCount,
    importedTotal,
    results,
  };
}