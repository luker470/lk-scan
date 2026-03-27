import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { runScheduledOperator } from "@/lib/operatorScheduler";
import { analyzeComment } from "@/lib/ai/commentBrain";
import { enqueueOperatorTask } from "@/lib/operatorQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "operator-cron";
const LOCK_TTL_MS = 1000 * 60 * 10;

const MAX_MANGAS_SCAN = 250;
const MAX_ROOT_COMMENTS_PER_MANGA = 30;
const MAX_CHAPTERS_PER_MANGA = 80;
const MAX_CHAPTER_COMMENTS = 20;
const DEFAULT_COMMENT_LIMIT = 12;

function buildJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function toDate(value: any, fallback: Date | null = null) {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : fallback;
  }
  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  if (typeof value?._seconds === "number") {
    const d = new Date(value._seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function compactText(value: unknown, max = 180) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function buildTargetKey(params: { mangaId: string; chapterId?: string }) {
  return params.chapterId
    ? `${params.mangaId}::${params.chapterId}`
    : `${params.mangaId}::root`;
}

function buildAiResponse(params: {
  text: string;
  classification: string;
  suggestedResponse: string;
  bugWeight?: number;
}) {
  const text = normalizeText(params.text);
  const classification = lower(params.classification);
  const bugWeight = safeNumber(params.bugWeight, 1);

  if (classification === "bug") {
    if (bugWeight >= 3) {
      return "Recebemos múltiplos relatos parecidos. O LK AI Operator elevou a prioridade da correção e já colocou esse problema na trilha automática de revisão.";
    }

    return "Obrigado por avisar. O LK AI Operator já registrou esse problema para revisão automática e priorização de correção.";
  }

  if (classification === "question") {
    return "Recebemos sua dúvida. O sistema vai tentar responder com base no status atual da obra e do site.";
  }

  if (classification === "request") {
    return "Pedido registrado. O LK AI Operator vai considerar essa solicitação nas prioridades de catálogo, descoberta e atualização.";
  }

  if (classification === "spoiler") {
    return "Seu comentário foi marcado para revisão por possível spoiler antes de permanecer visível.";
  }

  if (classification === "toxic") {
    return "Seu comentário foi sinalizado para revisão por linguagem inadequada.";
  }

  if (classification === "praise") {
    return "Obrigado pelo apoio. Ficamos felizes que você esteja curtindo o conteúdo do LK-SCAN.";
  }

  if (text.length <= 6) {
    return "Obrigado pelo comentário.";
  }

  return params.suggestedResponse || "Obrigado pelo comentário.";
}

async function createAction(
  db: FirebaseFirestore.Firestore,
  status: "success" | "warning" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await db.collection("system").doc("actions").collection("items").add({
    type: JOB_NAME,
    status,
    message,
    meta: meta || {},
    createdAt: new Date(),
  });
}

async function hasOpenIncident(
  db: FirebaseFirestore.Firestore,
  title: string,
  type: string
) {
  const snap = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .where("title", "==", title)
    .where("type", "==", type)
    .where("resolved", "==", false)
    .limit(1)
    .get()
    .catch(() => null);

  return !!snap && !snap.empty;
}

async function createIncident(
  db: FirebaseFirestore.Firestore,
  title: string,
  severity: "warning" | "high" | "critical",
  meta?: Record<string, unknown>,
  type = "operator"
) {
  const exists = await hasOpenIncident(db, title, type);
  if (exists) {
    return { ok: true as const, created: false as const };
  }

  const ref = await db.collection("system").doc("incidents").collection("items").add({
    title,
    type,
    severity,
    resolved: false,
    meta: meta || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { ok: true as const, created: true as const, id: ref.id };
}

async function acquireLock(
  db: FirebaseFirestore.Firestore,
  startedAt: Date,
  runId: string
) {
  const lockRef = db.collection("system").doc("operatorLocks");
  const snap = await lockRef.get().catch(() => null);
  const data = snap?.data() || {};

  const lockedAt = toDate(data.lockedAt);
  const isRunning = data.operatorCronRunning === true;

  if (
    isRunning &&
    lockedAt &&
    startedAt.getTime() - lockedAt.getTime() < LOCK_TTL_MS
  ) {
    return {
      ok: false as const,
      reason: "Cron já está em execução.",
      lockedAt,
      currentRunId: normalizeText(data.currentRunId),
    };
  }

  await lockRef.set(
    {
      operatorCronRunning: true,
      lockedAt: startedAt,
      currentRunId: runId,
      updatedAt: startedAt,
    },
    { merge: true }
  );

  return { ok: true as const };
}

async function refreshHeartbeat(
  db: FirebaseFirestore.Firestore,
  now: Date,
  runId: string
) {
  await db.collection("system").doc("operator").set(
    {
      heartbeatAt: now,
      cronCurrentRunId: runId,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection("system").doc("operatorLocks").set(
    {
      heartbeatAt: now,
      currentRunId: runId,
      updatedAt: now,
    },
    { merge: true }
  );
}

async function releaseLock(
  db: FirebaseFirestore.Firestore,
  finishedAt: Date,
  runId: string
) {
  await db.collection("system").doc("operatorLocks").set(
    {
      operatorCronRunning: false,
      unlockedAt: finishedAt,
      updatedAt: finishedAt,
      lastRunId: runId,
      currentRunId: "",
    },
    { merge: true }
  );
}

async function listPendingComments(
  db: FirebaseFirestore.Firestore,
  limit = 20
) {
  const mangasSnap = await db
    .collection("mangas")
    .limit(MAX_MANGAS_SCAN)
    .get()
    .catch(() => null);

  if (!mangasSnap) return [];

  const items: Array<{
    path: string;
    text: string;
    mangaId: string;
    chapterId?: string;
    createdAt?: any;
    authorName?: string;
  }> = [];

  for (const mangaDoc of mangasSnap.docs) {
    const mangaId = mangaDoc.id;

    const commentsSnap = await mangaDoc.ref
      .collection("comments")
      .limit(MAX_ROOT_COMMENTS_PER_MANGA)
      .get()
      .catch(() => null);

    if (commentsSnap && !commentsSnap.empty) {
      for (const commentDoc of commentsSnap.docs) {
        const data = commentDoc.data() || {};
        if (!data.aiResponded) {
          items.push({
            path: commentDoc.ref.path,
            text: normalizeText(data.text),
            mangaId,
            createdAt: data.createdAt,
            authorName: normalizeText(data.authorName || data.userName || ""),
          });
        }
      }
    }

    const chaptersSnap = await mangaDoc.ref
      .collection("chapters")
      .limit(MAX_CHAPTERS_PER_MANGA)
      .get()
      .catch(() => null);

    if (!chaptersSnap) continue;

    for (const chapterDoc of chaptersSnap.docs) {
      const chapterCommentsSnap = await chapterDoc.ref
        .collection("comments")
        .limit(MAX_CHAPTER_COMMENTS)
        .get()
        .catch(() => null);

      if (!chapterCommentsSnap || chapterCommentsSnap.empty) continue;

      for (const commentDoc of chapterCommentsSnap.docs) {
        const data = commentDoc.data() || {};
        if (!data.aiResponded) {
          items.push({
            path: commentDoc.ref.path,
            text: normalizeText(data.text),
            mangaId,
            chapterId: chapterDoc.id,
            createdAt: data.createdAt,
            authorName: normalizeText(data.authorName || data.userName || ""),
          });
        }
      }
    }
  }

  return items
    .filter((item) => !!item.text)
    .sort((a, b) => {
      const ad = toDate(a.createdAt)?.getTime() || 0;
      const bd = toDate(b.createdAt)?.getTime() || 0;
      return ad - bd;
    })
    .slice(0, limit);
}

function buildCommentCorrelationMap(
  items: Array<{
    mangaId: string;
    chapterId?: string;
    text: string;
  }>
) {
  const map = new Map<string, number>();

  for (const item of items) {
    const key = buildTargetKey({
      mangaId: item.mangaId,
      chapterId: item.chapterId,
    });
    map.set(key, (map.get(key) || 0) + 1);
  }

  return map;
}

async function processPendingComments(
  db: FirebaseFirestore.Firestore,
  limit = DEFAULT_COMMENT_LIMIT
) {
  const pending = await listPendingComments(db, limit);

  if (pending.length === 0) {
    return {
      ok: true,
      scanned: 0,
      analyzed: 0,
      bugs: 0,
      reviews: 0,
      queuedTasks: 0,
      requests: 0,
      skipped: 0,
      groupedBugTargets: 0,
    };
  }

  const groupedTargets = buildCommentCorrelationMap(pending);

  let analyzed = 0;
  let bugs = 0;
  let reviews = 0;
  let queuedTasks = 0;
  let requests = 0;
  let skipped = 0;
  const bugTargets = new Set<string>();

  for (const item of pending) {
    const ref = db.doc(item.path);
    const snap = await ref.get().catch(() => null);
    if (!snap?.exists) {
      skipped += 1;
      continue;
    }

    const data = snap.data() || {};
    if (data.aiResponded) {
      skipped += 1;
      continue;
    }

    const text = normalizeText(data.text);
    if (!text) {
      skipped += 1;
      continue;
    }

    const targetKey = buildTargetKey({
      mangaId: item.mangaId,
      chapterId: item.chapterId,
    });

    const bugWeight = safeNumber(groupedTargets.get(targetKey), 1);
    const analysis = analyzeComment(text);

    const boostedPriority =
      analysis.classification === "bug" && bugWeight >= 3
        ? Math.max(analysis.priority, 95)
        : analysis.priority;

    const aiResponse = buildAiResponse({
      text,
      classification: analysis.classification,
      suggestedResponse: analysis.suggestedResponse,
      bugWeight,
    });

    const now = new Date();

    await ref.set(
      {
        aiResponded: true,
        aiResponse,
        aiClassification: analysis.classification,
        aiPriority: boostedPriority,
        aiSentiment: analysis.sentiment,
        needsReview: analysis.needsReview,
        moderationStatus: analysis.needsReview ? "pending-review" : "approved",
        aiAnalyzedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    analyzed += 1;

    const meta = {
      path: item.path,
      mangaId: item.mangaId,
      chapterId: item.chapterId || "",
      classification: analysis.classification,
      priority: boostedPriority,
      bugWeight,
      authorName: item.authorName || "",
      previewText: compactText(text, 180),
    };

    if (analysis.needsReview) {
      reviews += 1;
    }

    if (analysis.classification === "bug") {
      bugs += 1;
      bugTargets.add(targetKey);

      const incidentTitle =
        bugWeight >= 3
          ? `Múltiplos comentários reportando bug em ${item.chapterId || item.mangaId}.`
          : `Comentário reportando bug em ${item.chapterId || item.mangaId}.`;

      await createIncident(
        db,
        incidentTitle,
        boostedPriority >= 95 ? "high" : "warning",
        {
          ...meta,
          text,
        },
        "comment"
      );

      const taskResult = await enqueueOperatorTask(db, {
        type: item.chapterId ? "validate-chapter" : "validate-manga",
        priority: boostedPriority >= 95 ? "high" : "normal",
        title: item.chapterId
          ? "Validar capítulo por comentário de bug"
          : "Validar mangá por comentário de bug",
        description:
          bugWeight >= 3
            ? "Múltiplos comentários do usuário indicaram bug recorrente no conteúdo/leitura."
            : "Comentário do usuário indicou bug no conteúdo/leitura.",
        mangaId: item.mangaId,
        chapterId: item.chapterId || "",
        dedupeKey: item.chapterId
          ? `cron-comment-bug::${item.mangaId}::${item.chapterId}`
          : `cron-comment-bug::${item.mangaId}`,
        maxAttempts: 3,
        meta: {
          source: JOB_NAME,
          commentPath: item.path,
          text,
          bugWeight,
        },
      });

      if (taskResult.created) queuedTasks += 1;
    }

    if (analysis.classification === "request") {
      requests += 1;

      const taskResult = await enqueueOperatorTask(db, {
        type: "discover-source",
        priority: "normal",
        title: "Analisar pedido vindo de comentário",
        description:
          "Comentário do usuário pediu obra/conteúdo e deve influenciar discovery/catalogação.",
        mangaId: item.mangaId,
        dedupeKey: `cron-comment-request::${item.mangaId}::${snap.id}`,
        maxAttempts: 2,
        meta: {
          source: JOB_NAME,
          commentPath: item.path,
          text,
        },
      });

      if (taskResult.created) queuedTasks += 1;
    }

    await db.collection("system").doc("actions").collection("items").add({
      type: "operator-comments-auto",
      status: analysis.needsReview ? "warning" : "success",
      message: "Comentário analisado automaticamente pelo cron do operador.",
      meta,
      createdAt: now,
    });
  }

  return {
    ok: true,
    scanned: pending.length,
    analyzed,
    bugs,
    reviews,
    requests,
    queuedTasks,
    skipped,
    groupedBugTargets: bugTargets.size,
  };
}

export async function GET() {
  const startedAt = new Date();
  const runId = `operator-cron-${startedAt.getTime()}`;

  try {
    const db = getAdminDb();

    if (!db) {
      return buildJson(500, {
        ok: false,
        error: "Firebase Admin não configurado.",
        job: JOB_NAME,
      });
    }

    const lock = await acquireLock(db, startedAt, runId);

    if (!lock.ok) {
      await db.collection("system").doc("operator").set(
        {
          cronLastTriggeredAt: startedAt,
          cronStatus: "skipped",
          cronLastSkipReason: lock.reason,
          cronLockedAt: lock.lockedAt || null,
          cronCurrentRunId: lock.currentRunId || "",
          heartbeatAt: startedAt,
          updatedAt: startedAt,
        },
        { merge: true }
      );

      await createAction(
        db,
        "warning",
        "Cron ignorado: já existia execução ativa.",
        {
          lockedAt: lock.lockedAt?.toISOString?.() || null,
          currentRunId: lock.currentRunId || "",
        }
      );

      return buildJson(409, {
        ok: false,
        skipped: true,
        job: JOB_NAME,
        reason: lock.reason,
        lockedAt: lock.lockedAt?.toISOString?.() || null,
        currentRunId: lock.currentRunId || "",
      });
    }

    await db.collection("system").doc("operator").set(
      {
        cronLastTriggeredAt: startedAt,
        cronStatus: "running",
        cronLastError: "",
        cronCurrentRunId: runId,
        heartbeatAt: startedAt,
        updatedAt: startedAt,
      },
      { merge: true }
    );

    await refreshHeartbeat(db, startedAt, runId);

    const commentsPromise = processPendingComments(db, DEFAULT_COMMENT_LIMIT);
    const schedulerPromise = runScheduledOperator(db);

    const [result, commentsResult] = await Promise.all([
      schedulerPromise,
      commentsPromise,
    ]);

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    const operatorOk = !!result?.operator?.ok;
    const recoveryOk = !!result?.recovery?.ok;
    const schedulerOk = !!result?.ok;

    const summary = result?.summary || {};
    const automationNot100 = Boolean(
      (summary as any)?.automationNot100 ??
        result?.operator?.status?.center?.summary?.automationNot100 ??
        false
    );

    await db.collection("system").doc("operator").set(
      {
        cronLastFinishedAt: finishedAt,
        cronStatus: schedulerOk
          ? automationNot100
            ? "warning"
            : "success"
          : "error",
        cronLastDurationMs: durationMs,
        cronLastError:
          schedulerOk ? "" : result?.error || result?.operator?.error || "",
        cronLastResult: {
          ok: schedulerOk,
          operatorOk,
          recoveryOk,
          recoveredCount: result?.recovery?.recovered ?? 0,
          failedRecoveries: result?.recovery?.failed ?? 0,
          scannedRecoveries: result?.recovery?.scanned ?? 0,
          automationNot100,
          summary:
            (summary as any)?.message ||
            (schedulerOk
              ? "Cron executado com sucesso."
              : "Cron executado com falha."),
        },
        cronLastReportId: result?.operator?.reportId || "",
        cronLastHealth: result?.operator?.status?.health || "",
        cronLastJobStatus: result?.operator?.status?.currentJobStatus || "",
        cronAutomationNot100: automationNot100,
        cronLastComments: commentsResult,
        cronCurrentRunId: runId,
        heartbeatAt: finishedAt,
        updatedAt: finishedAt,
      },
      { merge: true }
    );

    await db.collection("system").doc("cronHistory").collection("items").add({
      job: JOB_NAME,
      runId,
      ok: schedulerOk,
      operatorOk,
      recoveryOk,
      startedAt,
      finishedAt,
      durationMs,
      automationNot100,
      reportId: result?.operator?.reportId || "",
      summary:
        (summary as any)?.message ||
        (schedulerOk
          ? "Cron executado com sucesso."
          : "Cron executado com falha."),
      result,
      commentsResult,
      createdAt: finishedAt,
    });

    if (!schedulerOk) {
      await createIncident(
        db,
        "Falha no cron do operador",
        "high",
        {
          durationMs,
          runId,
          result,
          commentsResult,
        },
        "operator"
      );
    } else if (automationNot100) {
      await createAction(
        db,
        "warning",
        "Cron executado, mas a automação de descoberta/importação ainda não está 100%.",
        {
          durationMs,
          runId,
          reportId: result?.operator?.reportId || "",
          commentsResult,
        }
      );
    } else {
      await createAction(
        db,
        "success",
        "Cron do operador executado com sucesso.",
        {
          durationMs,
          runId,
          reportId: result?.operator?.reportId || "",
          commentsResult,
        }
      );
    }

    await releaseLock(db, finishedAt, runId);

    return buildJson(200, {
      ok: true,
      job: JOB_NAME,
      runId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs,
      automationNot100,
      commentsResult,
      result,
    });
  } catch (error: unknown) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "Internal error";

    try {
      const db = getAdminDb();

      if (db) {
        await db.collection("system").doc("operator").set(
          {
            cronLastFinishedAt: finishedAt,
            cronStatus: "error",
            cronLastError: message,
            heartbeatAt: finishedAt,
            updatedAt: finishedAt,
          },
          { merge: true }
        );

        await db.collection("system").doc("cronHistory").collection("items").add({
          job: JOB_NAME,
          runId,
          ok: false,
          startedAt,
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          summary: message,
          createdAt: finishedAt,
        });

        await createIncident(
          db,
          "Falha no cron do operador",
          "high",
          {
            error: message,
            runId,
          },
          "operator"
        );

        await createAction(
          db,
          "error",
          "Cron do operador executado com falha.",
          {
            error: message,
            runId,
          }
        );

        await releaseLock(db, finishedAt, runId);
      }
    } catch (nestedError) {
      console.error("Erro ao registrar falha do cron:", nestedError);
    }

    return buildJson(500, {
      ok: false,
      job: JOB_NAME,
      error: message,
    });
  }
}