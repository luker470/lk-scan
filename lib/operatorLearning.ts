import type { Firestore } from "firebase-admin/firestore";
import type { OperatorHealth, OperatorLearningScore } from "@/lib/operatorTypes";

type LearningEventType =
  | "source-success"
  | "source-failure"
  | "recovery-success"
  | "recovery-failure"
  | "import-success"
  | "import-failure"
  | "validation-success"
  | "validation-failure";

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHost(host: unknown) {
  return String(host || "").trim().toLowerCase();
}

function hostFromUrl(url?: string | null) {
  try {
    return new URL(String(url || "").trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function healthByScore(score: number): OperatorHealth {
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function buildScore(params: {
  successCount: number;
  errorCount: number;
  recoverySuccessCount: number;
  recoveryFailureCount: number;
  lastLatencyMs: number;
}) {
  const totalOps = params.successCount + params.errorCount;
  const successRate = totalOps > 0 ? (params.successCount / totalOps) * 100 : 0;
  const errorRate = totalOps > 0 ? (params.errorCount / totalOps) * 100 : 0;

  const recoveryTotal =
    params.recoverySuccessCount + params.recoveryFailureCount;

  const recoveryRate =
    recoveryTotal > 0
      ? (params.recoverySuccessCount / recoveryTotal) * 100
      : 0;

  const latencyPenalty = Math.min(25, safeNumber(params.lastLatencyMs, 0) / 800);

  const score = Math.max(
    0,
    Math.min(100, successRate * 0.65 + recoveryRate * 0.2 - errorRate * 0.2 - latencyPenalty)
  );

  return {
    score: Math.round(score),
    successRate: Math.round(successRate),
    errorRate: Math.round(errorRate),
    recommendedPriority: Math.max(1, Math.min(10, 11 - Math.round(score / 10))),
    health: healthByScore(score),
  };
}

async function upsertSourceHealth(
  db: Firestore,
  host: string,
  patch: Record<string, unknown>
) {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return;

  const ref = db
    .collection("system")
    .doc("sourceHealth")
    .collection("hosts")
    .doc(normalizedHost);

  const snap = await ref.get().catch(() => null);
  const current = snap?.data() || {};

  const successCount = safeNumber(current.successCount, 0);
  const errorCount = safeNumber(current.errorCount, 0);
  const recoverySuccessCount = safeNumber(current.recoverySuccessCount, 0);
  const recoveryFailureCount = safeNumber(current.recoveryFailureCount, 0);
  const lastLatencyMs = safeNumber(
    patch.lastLatencyMs ?? current.lastLatencyMs,
    0
  );

  const computed = buildScore({
    successCount,
    errorCount,
    recoverySuccessCount,
    recoveryFailureCount,
    lastLatencyMs,
  });

  await ref.set(
    {
      host: normalizedHost,
      updatedAt: new Date(),
      ...patch,
      score: computed.score,
      successRate: computed.successRate,
      errorRate: computed.errorRate,
      recommendedPriority: computed.recommendedPriority,
      health: computed.health,
    },
    { merge: true }
  );
}

export async function registerLearningEvent(
  db: Firestore,
  params: {
    host?: string;
    sourceUrl?: string;
    type: LearningEventType;
    mangaId?: string;
    chapterId?: string;
    latencyMs?: number;
    message?: string;
    meta?: Record<string, unknown>;
  }
) {
  const host = normalizeHost(params.host || hostFromUrl(params.sourceUrl || ""));
  if (!host) return;

  const now = new Date();

  await db.collection("system").doc("operatorLearning").collection("events").add({
    host,
    type: params.type,
    mangaId: params.mangaId || "",
    chapterId: params.chapterId || "",
    latencyMs: safeNumber(params.latencyMs, 0),
    message: params.message || "",
    meta: params.meta || {},
    createdAt: now,
  });

  const ref = db
    .collection("system")
    .doc("sourceHealth")
    .collection("hosts")
    .doc(host);

  const snap = await ref.get().catch(() => null);
  const current = snap?.data() || {};

  const nextPatch: Record<string, unknown> = {
    host,
    lastEventType: params.type,
    lastEventAt: now,
    lastMessage: params.message || "",
    lastLatencyMs: safeNumber(params.latencyMs, current.lastLatencyMs || 0),
  };

  if (
    params.type === "source-success" ||
    params.type === "import-success" ||
    params.type === "validation-success"
  ) {
    nextPatch.successCount = safeNumber(current.successCount, 0) + 1;
    nextPatch.lastSuccessAt = now;
    nextPatch.lastErrorMessage = "";
  }

  if (
    params.type === "source-failure" ||
    params.type === "import-failure" ||
    params.type === "validation-failure"
  ) {
    nextPatch.errorCount = safeNumber(current.errorCount, 0) + 1;
    nextPatch.lastErrorAt = now;
    nextPatch.lastErrorMessage = params.message || "Erro operacional";
  }

  if (params.type === "recovery-success") {
    nextPatch.recoverySuccessCount =
      safeNumber(current.recoverySuccessCount, 0) + 1;
    nextPatch.lastSuccessAt = now;
  }

  if (params.type === "recovery-failure") {
    nextPatch.recoveryFailureCount =
      safeNumber(current.recoveryFailureCount, 0) + 1;
    nextPatch.lastErrorAt = now;
    nextPatch.lastErrorMessage = params.message || "Falha em recovery";
  }

  await upsertSourceHealth(db, host, nextPatch);
}

export async function markSourceSuccess(
  db: Firestore,
  params: {
    host?: string;
    sourceUrl?: string;
    mangaId?: string;
    chapterId?: string;
    latencyMs?: number;
    message?: string;
    meta?: Record<string, unknown>;
  }
) {
  await registerLearningEvent(db, {
    ...params,
    type: "source-success",
  });
}

export async function markSourceFailure(
  db: Firestore,
  params: {
    host?: string;
    sourceUrl?: string;
    mangaId?: string;
    chapterId?: string;
    latencyMs?: number;
    message?: string;
    meta?: Record<string, unknown>;
  }
) {
  await registerLearningEvent(db, {
    ...params,
    type: "source-failure",
  });
}

export async function markRecoverySuccess(
  db: Firestore,
  params: {
    host?: string;
    sourceUrl?: string;
    mangaId?: string;
    chapterId?: string;
    message?: string;
    meta?: Record<string, unknown>;
  }
) {
  await registerLearningEvent(db, {
    ...params,
    type: "recovery-success",
  });
}

export async function markRecoveryFailure(
  db: Firestore,
  params: {
    host?: string;
    sourceUrl?: string;
    mangaId?: string;
    chapterId?: string;
    message?: string;
    meta?: Record<string, unknown>;
  }
) {
  await registerLearningEvent(db, {
    ...params,
    type: "recovery-failure",
  });
}

export async function buildOperatorLearning(
  db: Firestore
): Promise<OperatorLearningScore[]> {
  const sourceSnap = await db
    .collection("system")
    .doc("sourceHealth")
    .collection("hosts")
    .get()
    .catch(() => null);

  if (sourceSnap && !sourceSnap.empty) {
    return sourceSnap.docs
      .map((doc) => {
        const data = doc.data() || {};

        const successRate = safeNumber(data.successRate, 0);
        const errorRate = safeNumber(data.errorRate, 0);
        const recommendedPriority = safeNumber(data.recommendedPriority, 10);
        const score = safeNumber(data.score, 0);

        return {
          host: doc.id,
          score,
          successRate,
          errorRate,
          recommendedPriority,
          health:
            (String(data.health || "") as OperatorHealth) ||
            healthByScore(score),
        } satisfies OperatorLearningScore;
      })
      .sort((a, b) => b.score - a.score);
  }

  const mangasSnap = await db.collection("mangas").get().catch(() => null);
  if (!mangasSnap) return [];

  const hostMap = new Map<
    string,
    { total: number; autoSync: number; views: number }
  >();

  for (const mangaDoc of mangasSnap.docs) {
    const data = mangaDoc.data() || {};
    const host = String(data.sourceHost || "").trim().toLowerCase();
    if (!host) continue;

    if (!hostMap.has(host)) {
      hostMap.set(host, { total: 0, autoSync: 0, views: 0 });
    }

    const item = hostMap.get(host)!;
    item.total += 1;
    if (data.autoSync) item.autoSync += 1;
    item.views += safeNumber(data.views, 0);
  }

  return Array.from(hostMap.entries())
    .map(([host, item]) => {
      const autoSyncRate = item.total ? (item.autoSync / item.total) * 100 : 0;
      const popularityBoost = Math.min(20, item.views / 5000);
      const score = Math.max(
        0,
        Math.min(100, autoSyncRate * 0.7 + popularityBoost)
      );

      return {
        host,
        score: Math.round(score),
        successRate: Math.round(autoSyncRate),
        errorRate: Math.max(0, 100 - Math.round(autoSyncRate)),
        recommendedPriority: Math.max(1, Math.min(10, 11 - Math.round(score / 10))),
        health: healthByScore(score),
      } satisfies OperatorLearningScore;
    })
    .sort((a, b) => b.score - a.score);
}