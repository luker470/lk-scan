import type { Firestore } from "firebase-admin/firestore";
import {
  enqueueOperatorTask,
  finishOperatorTask,
} from "@/lib/operatorQueue";
import {
  markRecoveryFailure,
  markRecoverySuccess,
  markSourceFailure,
  markSourceSuccess,
} from "@/lib/operatorLearning";

type RecoveryCandidate = {
  mangaId: string;
  chapterId: string;
  title: string;
  sourceUrl?: string;
  pagesCount: number;
  lastError?: string;
};

type RecoveryResultItem = {
  mangaId: string;
  chapterId: string;
  title: string;
  ok: boolean;
  action: string;
  reason?: string;
};

type RecoverySummary = {
  ok: boolean;
  scanned: number;
  recovered: number;
  failed: number;
  skipped: number;
  items: RecoveryResultItem[];
};

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isHttpUrl(value: unknown) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function hostFromUrl(url?: string | null) {
  try {
    return new URL(String(url || "").trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizePageValue(page: any): string | null {
  if (!page) return null;

  if (typeof page === "string" && page.trim()) {
    return page.trim();
  }

  if (typeof page === "object") {
    const possible =
      page.storageUrl ||
      page.mirrorUrl ||
      page.url ||
      page.src ||
      page.image ||
      page.imageUrl ||
      page.proxyUrl ||
      page.originalUrl;

    if (typeof possible === "string" && possible.trim()) {
      return possible.trim();
    }
  }

  return null;
}

function extractPagesFromChapter(chapter: Record<string, any>): string[] {
  const rawCandidates = [
    chapter.pages,
    chapter.images,
    chapter.pageLinks,
    chapter.imageLinks,
    chapter.pageUrls,
  ];

  const pages = rawCandidates
    .flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .map(normalizePageValue)
    .filter((value): value is string => !!value && isHttpUrl(value));

  return Array.from(new Set(pages.map((item) => item.trim())));
}

function chapterLooksBroken(chapter: Record<string, any>) {
  const storedCount = safeNumber(
    chapter.pagesCount ?? chapter.pageCount ?? chapter.imagesCount,
    0
  );

  const extractedPages = extractPagesFromChapter(chapter);

  if (storedCount <= 0) return true;
  if (extractedPages.length <= 0) return true;

  return false;
}

function pagesLookHealthy(pages: string[]) {
  return Array.isArray(pages) && pages.length > 0;
}

async function registerAction(
  db: Firestore,
  type: string,
  status: "success" | "warning" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await db.collection("system").doc("actions").collection("items").add({
    type,
    status,
    message,
    meta: meta || {},
    createdAt: new Date(),
  });
}

async function hasOpenRecoveryIncident(
  db: Firestore,
  mangaId: string,
  chapterId: string,
  title: string
) {
  const snap = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .where("type", "==", "chapter")
    .where("resolved", "==", false)
    .limit(50)
    .get()
    .catch(() => null);

  if (!snap || snap.empty) return false;

  return snap.docs.some((doc) => {
    const data = doc.data() || {};
    const meta = data.meta || {};

    if (
      String(meta?.mangaId || "") === mangaId &&
      String(meta?.chapterId || "") === chapterId
    ) {
      return true;
    }

    return String(data.title || "") === title;
  });
}

async function registerRecoveryIncident(
  db: Firestore,
  title: string,
  severity: "warning" | "high",
  meta?: Record<string, unknown>
) {
  const mangaId = normalizeText(meta?.mangaId);
  const chapterId = normalizeText(meta?.chapterId);

  if (mangaId && chapterId) {
    const exists = await hasOpenRecoveryIncident(db, mangaId, chapterId, title);
    if (exists) {
      return { ok: true as const, created: false as const };
    }
  }

  await db.collection("system").doc("incidents").collection("items").add({
    title,
    type: "chapter",
    severity,
    meta: meta || {},
    resolved: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { ok: true as const, created: true as const };
}

async function resolveChapterIncidentsForChapter(
  db: Firestore,
  mangaId: string,
  chapterId: string
) {
  const snap = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .where("type", "==", "chapter")
    .where("resolved", "==", false)
    .get()
    .catch(() => null);

  if (!snap || snap.empty) return 0;

  const matches = snap.docs.filter((doc) => {
    const data = doc.data() || {};
    const meta = data.meta || {};

    if (meta?.mangaId === mangaId && meta?.chapterId === chapterId) {
      return true;
    }

    if (Array.isArray(meta?.brokenChapters)) {
      return meta.brokenChapters.some(
        (item: any) =>
          String(item?.mangaId || "") === mangaId &&
          String(item?.chapterId || "") === chapterId
      );
    }

    return false;
  });

  if (matches.length === 0) return 0;

  const batch = db.batch();
  const now = new Date();

  for (const doc of matches) {
    batch.set(
      doc.ref,
      {
        resolved: true,
        resolvedAt: now,
        resolutionNote:
          "Resolvido automaticamente pelo operatorRecovery após reconstrução/validação das páginas.",
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
  return matches.length;
}

async function queueReimportTask(
  db: Firestore,
  params: {
    mangaId: string;
    chapterId: string;
    title: string;
    sourceUrl?: string;
  }
) {
  return enqueueOperatorTask(db, {
    type: "reimport-chapter",
    priority: "critical",
    title: `Reimportar capítulo ${params.title}`,
    description:
      "Recovery local falhou; capítulo enfileirado para reimportação automática.",
    mangaId: params.mangaId,
    chapterId: params.chapterId,
    sourceUrl: params.sourceUrl || "",
    dedupeKey: `reimport-recovery::${params.mangaId}::${params.chapterId}`,
    maxAttempts: 5,
    meta: {
      reason: "local-recovery-insufficient",
    },
  });
}

async function queueValidateTask(
  db: Firestore,
  params: {
    mangaId: string;
    chapterId: string;
    title: string;
    sourceUrl?: string;
    reason?: string;
  }
) {
  return enqueueOperatorTask(db, {
    type: "validate-chapter",
    priority: "normal",
    title: `Validar capítulo ${params.title}`,
    description:
      params.reason ||
      "Validar capítulo após recovery/importação para confirmar integridade.",
    mangaId: params.mangaId,
    chapterId: params.chapterId,
    sourceUrl: params.sourceUrl || "",
    dedupeKey: `validate-after-recovery::${params.mangaId}::${params.chapterId}::${normalizeText(
      params.reason
    )}`,
    maxAttempts: 3,
    meta: {
      reason: params.reason || "post-recovery-validation",
    },
  });
}

async function markChapterRecovered(
  db: Firestore,
  params: {
    mangaId: string;
    chapterId: string;
    title: string;
    pages: string[];
    sourceUrl?: string;
  }
) {
  const ref = db
    .collection("mangas")
    .doc(params.mangaId)
    .collection("chapters")
    .doc(params.chapterId);

  await ref.set(
    {
      pages: params.pages,
      pagesCount: params.pages.length,
      pageCount: params.pages.length,
      recoveryStatus: "recovered-local",
      validationStatus: "pending-post-recovery",
      recoveredAt: new Date(),
      updatedAt: new Date(),
      lastError: "",
    },
    { merge: true }
  );

  const resolved = await resolveChapterIncidentsForChapter(
    db,
    params.mangaId,
    params.chapterId
  );

  await registerAction(
    db,
    "chapter-recovery",
    "success",
    `Capítulo recuperado automaticamente a partir dos dados locais: ${params.title}.`,
    {
      mangaId: params.mangaId,
      chapterId: params.chapterId,
      pagesCount: params.pages.length,
      resolvedIncidents: resolved,
    }
  );

  await markRecoverySuccess(db, {
    sourceUrl: params.sourceUrl || "",
    mangaId: params.mangaId,
    chapterId: params.chapterId,
    message: `Recovery local bem-sucedido: ${params.title}`,
    meta: {
      pagesCount: params.pages.length,
    },
  });

  await markSourceSuccess(db, {
    sourceUrl: params.sourceUrl || "",
    mangaId: params.mangaId,
    chapterId: params.chapterId,
    message: `Capítulo válido após recovery: ${params.title}`,
  });

  await queueValidateTask(db, {
    mangaId: params.mangaId,
    chapterId: params.chapterId,
    title: params.title,
    sourceUrl: params.sourceUrl,
    reason: "post-local-recovery",
  });
}

async function recoverSingleChapter(
  db: Firestore,
  mangaId: string,
  chapterId: string,
  chapter: Record<string, any>
): Promise<RecoveryResultItem> {
  const ref = db
    .collection("mangas")
    .doc(mangaId)
    .collection("chapters")
    .doc(chapterId);

  const title = String(chapter.title || `Capítulo ${chapter.number || chapterId}`);
  const sourceUrl =
    chapter.sourceUrl ||
    chapter.chapterUrl ||
    chapter.url ||
    chapter.originUrl ||
    "";

  const extractedPages = extractPagesFromChapter(chapter);

  if (pagesLookHealthy(extractedPages)) {
    await markChapterRecovered(db, {
      mangaId,
      chapterId,
      title,
      pages: extractedPages,
      sourceUrl,
    });

    return {
      mangaId,
      chapterId,
      title,
      ok: true,
      action: "recovered-local",
    };
  }

  if (isHttpUrl(sourceUrl)) {
    await ref.set(
      {
        recoveryStatus: "pending-reimport",
        recoveryRequestedAt: new Date(),
        updatedAt: new Date(),
        lastError:
          "Capítulo marcado para reimportação automática: dados locais insuficientes.",
      },
      { merge: true }
    );

    const queued = await queueReimportTask(db, {
      mangaId,
      chapterId,
      title,
      sourceUrl,
    });

    await registerAction(
      db,
      "chapter-recovery",
      "warning",
      `Capítulo marcado para reimportação automática: ${title}.`,
      {
        mangaId,
        chapterId,
        sourceUrl,
        queuedTask: queued.id || "",
      }
    );

    await markRecoveryFailure(db, {
      sourceUrl,
      mangaId,
      chapterId,
      message: `Recovery local falhou, capítulo enfileirado para reimportação: ${title}`,
    });

    await markSourceFailure(db, {
      sourceUrl,
      mangaId,
      chapterId,
      message: `Sem páginas locais válidas em ${title}`,
    });

    return {
      mangaId,
      chapterId,
      title,
      ok: false,
      action: "pending-reimport",
      reason: "Sem páginas locais válidas, mas com sourceUrl disponível.",
    };
  }

  await ref.set(
    {
      recoveryStatus: "failed",
      updatedAt: new Date(),
      lastError:
        "Falha no recovery automático: capítulo sem páginas válidas e sem sourceUrl utilizável.",
    },
    { merge: true }
  );

  await registerRecoveryIncident(
    db,
    `Recovery automático falhou para ${title}.`,
    "high",
    {
      mangaId,
      chapterId,
      title,
      sourceHost: hostFromUrl(sourceUrl),
    }
  );

  await registerAction(
    db,
    "chapter-recovery",
    "error",
    `Falha no recovery automático do capítulo: ${title}.`,
    {
      mangaId,
      chapterId,
    }
  );

  await markRecoveryFailure(db, {
    sourceUrl,
    mangaId,
    chapterId,
    message: `Recovery automático falhou sem possibilidade de reimportação: ${title}`,
  });

  return {
    mangaId,
    chapterId,
    title,
    ok: false,
    action: "failed",
    reason: "Sem páginas válidas e sem sourceUrl.",
  };
}

export async function validateSingleChapter(
  db: Firestore,
  mangaId: string,
  chapterId: string
) {
  const snap = await db
    .collection("mangas")
    .doc(mangaId)
    .collection("chapters")
    .doc(chapterId)
    .get()
    .catch(() => null);

  if (!snap?.exists) {
    return {
      ok: false,
      valid: false,
      reason: "Capítulo não encontrado.",
    };
  }

  const chapter = snap.data() || {};
  const pages = extractPagesFromChapter(chapter);

  if (pagesLookHealthy(pages)) {
    await snap.ref.set(
      {
        pages,
        pagesCount: pages.length,
        pageCount: pages.length,
        validationStatus: "valid",
        validatedAt: new Date(),
        updatedAt: new Date(),
        lastError: "",
      },
      { merge: true }
    );

    await resolveChapterIncidentsForChapter(db, mangaId, chapterId);

    return {
      ok: true,
      valid: true,
      pagesCount: pages.length,
    };
  }

  await snap.ref.set(
    {
      validationStatus: "invalid",
      validatedAt: new Date(),
      updatedAt: new Date(),
      lastError: "Validação detectou capítulo sem páginas válidas.",
    },
    { merge: true }
  );

  await enqueueOperatorTask(db, {
    type: "recovery-chapter",
    priority: "high",
    mangaId,
    chapterId,
    sourceUrl: normalizeText(
      chapter.sourceUrl || chapter.chapterUrl || chapter.url || ""
    ),
    title: `Recovery do capítulo ${chapterId}`,
    description: "Validação detectou capítulo quebrado após importação/recovery.",
    dedupeKey: `validate-recovery::${mangaId}::${chapterId}`,
    maxAttempts: 5,
  });

  return {
    ok: false,
    valid: false,
    reason: "Capítulo sem páginas válidas.",
  };
}

async function findBrokenChapters(
  db: Firestore,
  limit = 50
): Promise<RecoveryCandidate[]> {
  const mangasSnap = await db.collection("mangas").get().catch(() => null);
  if (!mangasSnap) return [];

  const results: RecoveryCandidate[] = [];

  for (const mangaDoc of mangasSnap.docs) {
    const chaptersSnap = await mangaDoc.ref.collection("chapters").get().catch(() => null);
    if (!chaptersSnap) continue;

    for (const chapterDoc of chaptersSnap.docs) {
      const chapter = chapterDoc.data() || {};

      if (!chapterLooksBroken(chapter)) continue;

      results.push({
        mangaId: mangaDoc.id,
        chapterId: chapterDoc.id,
        title: String(chapter.title || `Capítulo ${chapter.number || chapterDoc.id}`),
        sourceUrl:
          chapter.sourceUrl ||
          chapter.chapterUrl ||
          chapter.url ||
          chapter.originUrl ||
          "",
        pagesCount: safeNumber(chapter.pagesCount ?? chapter.pageCount ?? 0, 0),
        lastError: String(chapter.lastError || ""),
      });

      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}

export async function runBasicRecovery(db: Firestore): Promise<RecoverySummary> {
  const candidates = await findBrokenChapters(db, 50);

  if (candidates.length === 0) {
    await registerAction(
      db,
      "chapter-recovery-scan",
      "success",
      "Nenhum capítulo quebrado precisou de recovery no ciclo atual."
    );

    return {
      ok: true,
      scanned: 0,
      recovered: 0,
      failed: 0,
      skipped: 0,
      items: [],
    };
  }

  const items: RecoveryResultItem[] = [];
  let recovered = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const snap = await db
      .collection("mangas")
      .doc(candidate.mangaId)
      .collection("chapters")
      .doc(candidate.chapterId)
      .get()
      .catch(() => null);

    if (!snap?.exists) {
      skipped += 1;
      items.push({
        mangaId: candidate.mangaId,
        chapterId: candidate.chapterId,
        title: candidate.title,
        ok: false,
        action: "skipped",
        reason: "Capítulo não encontrado no momento do recovery.",
      });
      continue;
    }

    const chapter = snap.data() || {};

    const result = await recoverSingleChapter(
      db,
      candidate.mangaId,
      candidate.chapterId,
      chapter
    );

    items.push(result);

    if (result.ok) recovered += 1;
    else if (result.action === "skipped") skipped += 1;
    else failed += 1;
  }

  await registerAction(
    db,
    "chapter-recovery-scan",
    failed > 0 ? "warning" : "success",
    `Recovery automático concluído. Recuperados: ${recovered}, falhas: ${failed}, ignorados: ${skipped}.`,
    {
      scanned: candidates.length,
      recovered,
      failed,
      skipped,
    }
  );

  return {
    ok: failed === 0,
    scanned: candidates.length,
    recovered,
    failed,
    skipped,
    items,
  };
}

export async function processRecoveryQueueTask(
  db: Firestore,
  task: {
    id: string;
    mangaId?: string;
    chapterId?: string;
    sourceUrl?: string;
  }
) {
  const mangaId = String(task.mangaId || "").trim();
  const chapterId = String(task.chapterId || "").trim();

  if (!mangaId || !chapterId) {
    await finishOperatorTask(db, task.id, {
      status: "error",
      lastError: "Task de recovery sem mangaId/chapterId válidos.",
      resultSummary: "Task inválida.",
    });

    return {
      ok: false,
      message: "Task inválida.",
    };
  }

  const snap = await db
    .collection("mangas")
    .doc(mangaId)
    .collection("chapters")
    .doc(chapterId)
    .get()
    .catch(() => null);

  if (!snap?.exists) {
    await finishOperatorTask(db, task.id, {
      status: "warning",
      resultSummary: "Capítulo não encontrado no momento do processamento.",
    });

    return {
      ok: false,
      message: "Capítulo não encontrado.",
    };
  }

  const chapter = snap.data() || {};
  const result = await recoverSingleChapter(db, mangaId, chapterId, chapter);

  await finishOperatorTask(db, task.id, {
    status: result.ok ? "success" : "warning",
    resultSummary: result.action,
    lastError: result.reason || "",
    metaPatch: {
      mangaId,
      chapterId,
      sourceUrl: task.sourceUrl || "",
    },
  });

  return {
    ok: result.ok,
    result,
  };
}