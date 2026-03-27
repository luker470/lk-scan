import type { Firestore } from "firebase-admin/firestore";

export type OperatorQueueTaskType =
  | "recovery-chapter"
  | "reimport-chapter"
  | "sync-manga"
  | "discover-source"
  | "source-health-check"
  | "validate-manga"
  | "validate-chapter"
  | "operator-maintenance";

export type OperatorQueueTaskStatus =
  | "queued"
  | "running"
  | "success"
  | "warning"
  | "error"
  | "canceled";

export type OperatorQueuePriority =
  | "low"
  | "normal"
  | "high"
  | "critical";

export type OperatorQueueItem = {
  id?: string;
  type: OperatorQueueTaskType;
  status: OperatorQueueTaskStatus;
  priority: OperatorQueuePriority;
  dedupeKey: string;
  title: string;
  description?: string;

  mangaId?: string;
  chapterId?: string;
  source?: string;
  sourceUrl?: string;

  attempts: number;
  maxAttempts: number;

  scheduledAt: Date;
  startedAt?: Date | null;
  finishedAt?: Date | null;

  lockedBy?: string;
  lockExpiresAt?: Date | null;

  resultSummary?: string;
  lastError?: string;

  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

type QueueListFilters = {
  status?: OperatorQueueTaskStatus | "all";
  type?: OperatorQueueTaskType | "all";
  priority?: OperatorQueuePriority | "all";
  limit?: number;
};

function nowDate() {
  return new Date();
}

function priorityWeight(priority: OperatorQueuePriority) {
  if (priority === "critical") return 400;
  if (priority === "high") return 300;
  if (priority === "normal") return 200;
  return 100;
}

function buildTaskSortScore(priority: OperatorQueuePriority, createdAt: Date) {
  return priorityWeight(priority) * 1_000_000_000_000 - createdAt.getTime();
}

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanMeta(meta?: Record<string, unknown>) {
  return meta && typeof meta === "object" ? meta : {};
}

function toDate(value: any, fallback?: Date | null) {
  if (!value) return fallback || null;
  if (value instanceof Date) return value;

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime())
      ? d
      : fallback || null;
  }

  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback || null : d;
  }

  if (typeof value?._seconds === "number") {
    const d = new Date(value._seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback || null : d;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback || null : parsed;
}

function serializeValue(value: any): any {
  if (value == null) return value;

  const d = toDate(value, null);
  if (d) return d.toISOString();

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = serializeValue(val);
    }
    return out;
  }

  return value;
}

function queueCollection(db: Firestore) {
  return db.collection("system").doc("operatorQueue").collection("items");
}

async function registerQueueAction(
  db: Firestore,
  status: "success" | "warning" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await db.collection("system").doc("actions").collection("items").add({
    type: "operator-queue",
    status,
    message,
    meta: meta || {},
    createdAt: nowDate(),
  });
}

function buildDefaultTitle(
  type: OperatorQueueTaskType,
  payload: Partial<OperatorQueueItem>
) {
  if (type === "recovery-chapter") {
    return `Recovery do capítulo ${payload.chapterId || ""}`.trim();
  }

  if (type === "reimport-chapter") {
    return `Reimportação do capítulo ${payload.chapterId || ""}`.trim();
  }

  if (type === "sync-manga") {
    return `Sync do mangá ${payload.mangaId || ""}`.trim();
  }

  if (type === "discover-source") {
    return `Descoberta automática da fonte ${payload.source || ""}`.trim();
  }

  if (type === "source-health-check") {
    return "Verificação de saúde das fontes";
  }

  if (type === "validate-manga") {
    return `Validação do mangá ${payload.mangaId || ""}`.trim();
  }

  if (type === "validate-chapter") {
    return `Validação do capítulo ${payload.chapterId || ""}`.trim();
  }

  return "Manutenção automática do operador";
}

export function buildOperatorQueueDedupeKey(params: {
  type: OperatorQueueTaskType;
  mangaId?: string;
  chapterId?: string;
  source?: string;
  sourceUrl?: string;
  extra?: string;
}) {
  return [
    params.type,
    normalizeString(params.mangaId),
    normalizeString(params.chapterId),
    normalizeString(params.source),
    normalizeString(params.sourceUrl),
    normalizeString(params.extra),
  ]
    .filter(Boolean)
    .join("::");
}

export async function enqueueOperatorTask(
  db: Firestore,
  payload: {
    type: OperatorQueueTaskType;
    priority?: OperatorQueuePriority;
    title?: string;
    description?: string;
    dedupeKey?: string;
    mangaId?: string;
    chapterId?: string;
    source?: string;
    sourceUrl?: string;
    scheduledAt?: Date;
    maxAttempts?: number;
    meta?: Record<string, unknown>;
  }
) {
  const createdAt = nowDate();
  const scheduledAt = payload.scheduledAt || createdAt;
  const priority = payload.priority || "normal";

  const dedupeKey =
    payload.dedupeKey ||
    buildOperatorQueueDedupeKey({
      type: payload.type,
      mangaId: payload.mangaId,
      chapterId: payload.chapterId,
      source: payload.source,
      sourceUrl: payload.sourceUrl,
    });

  const existingSnap = await queueCollection(db)
    .where("dedupeKey", "==", dedupeKey)
    .where("status", "in", ["queued", "running"])
    .limit(1)
    .get()
    .catch(() => null);

  if (existingSnap && !existingSnap.empty) {
    const existing = existingSnap.docs[0];
    return {
      ok: true as const,
      created: false as const,
      id: existing.id,
      reason: "Task já existente na fila.",
    };
  }

  const doc = await queueCollection(db).add({
    type: payload.type,
    status: "queued",
    priority,
    dedupeKey,
    title: payload.title || buildDefaultTitle(payload.type, payload),
    description: payload.description || "",
    mangaId: normalizeString(payload.mangaId),
    chapterId: normalizeString(payload.chapterId),
    source: normalizeString(payload.source),
    sourceUrl: normalizeString(payload.sourceUrl),
    attempts: 0,
    maxAttempts: Math.max(1, Number(payload.maxAttempts || 3)),
    scheduledAt,
    startedAt: null,
    finishedAt: null,
    lockedBy: "",
    lockExpiresAt: null,
    resultSummary: "",
    lastError: "",
    meta: cleanMeta(payload.meta),
    sortScore: buildTaskSortScore(priority, createdAt),
    createdAt,
    updatedAt: createdAt,
  });

  await registerQueueAction(
    db,
    "success",
    "Nova task adicionada à fila do operador.",
    {
      queueTaskId: doc.id,
      type: payload.type,
      priority,
      dedupeKey,
    }
  );

  return {
    ok: true as const,
    created: true as const,
    id: doc.id,
  };
}

export async function getOperatorQueueStats(db: Firestore) {
  const snap = await queueCollection(db).limit(1000).get().catch(() => null);

  const items =
    snap?.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })) || [];

  return {
    total: items.length,
    queued: items.filter((item) => item.status === "queued").length,
    running: items.filter((item) => item.status === "running").length,
    success: items.filter((item) => item.status === "success").length,
    warning: items.filter((item) => item.status === "warning").length,
    error: items.filter((item) => item.status === "error").length,
    critical: items.filter((item) => item.priority === "critical").length,
    high: items.filter((item) => item.priority === "high").length,
  };
}

export async function listOperatorQueueItems(
  db: Firestore,
  filters?: QueueListFilters
) {
  const snap = await queueCollection(db)
    .orderBy("updatedAt", "desc")
    .limit(Math.max(1, Math.min(200, Number(filters?.limit || 50))))
    .get()
    .catch(() => null);

  if (!snap) return [];

  let items = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));

  if (filters?.status && filters.status !== "all") {
    items = items.filter((item) => item.status === filters.status);
  }

  if (filters?.type && filters.type !== "all") {
    items = items.filter((item) => item.type === filters.type);
  }

  if (filters?.priority && filters.priority !== "all") {
    items = items.filter((item) => item.priority === filters.priority);
  }

  return items.map((item) => serializeValue(item));
}

export async function reclaimStaleOperatorTasks(
  db: Firestore,
  workerId = "operator-core-reclaimer"
) {
  const snap = await queueCollection(db)
    .where("status", "==", "running")
    .limit(100)
    .get()
    .catch(() => null);

  if (!snap || snap.empty) {
    return {
      ok: true,
      reclaimed: 0,
      ids: [] as string[],
    };
  }

  const now = nowDate();
  const ids: string[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const lockExpiresAt = toDate(data.lockExpiresAt, null);

    if (!lockExpiresAt || lockExpiresAt.getTime() > now.getTime()) {
      continue;
    }

    await doc.ref.set(
      {
        status: "queued",
        lockedBy: "",
        lockExpiresAt: null,
        startedAt: null,
        updatedAt: now,
        lastError: `Task recuperada por stale lock via ${workerId}.`,
        sortScore: buildTaskSortScore(
          (data.priority as OperatorQueuePriority) || "normal",
          now
        ),
      },
      { merge: true }
    );

    ids.push(doc.id);
  }

  if (ids.length > 0) {
    await registerQueueAction(
      db,
      "warning",
      "Tasks travadas foram devolvidas para a fila.",
      {
        reclaimedCount: ids.length,
        ids,
        workerId,
      }
    );
  }

  return {
    ok: true,
    reclaimed: ids.length,
    ids,
  };
}

export async function pullNextOperatorTask(
  db: Firestore,
  workerId = "operator-core",
  lockMinutes = 10
): Promise<OperatorQueueItem | null> {
  await reclaimStaleOperatorTasks(db, `${workerId}-prepull`).catch(() => null);

  const now = nowDate();
  const lockExpiresAt = new Date(now.getTime() + lockMinutes * 60 * 1000);

  const snap = await queueCollection(db)
    .where("status", "==", "queued")
    .orderBy("sortScore", "desc")
    .orderBy("scheduledAt", "asc")
    .limit(25)
    .get()
    .catch(() => null);

  if (!snap || snap.empty) return null;

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, any>;
    const scheduledAt = toDate(data.scheduledAt, now) || now;

    if (scheduledAt.getTime() > now.getTime()) {
      continue;
    }

    await doc.ref.set(
      {
        status: "running",
        lockedBy: workerId,
        lockExpiresAt,
        startedAt: now,
        updatedAt: now,
        attempts: Number(data.attempts || 0) + 1,
      },
      { merge: true }
    );

    return {
      id: doc.id,
      ...(data as any),
      status: "running",
      lockedBy: workerId,
      lockExpiresAt,
      startedAt: now,
      updatedAt: now,
      attempts: Number(data.attempts || 0) + 1,
    } as OperatorQueueItem;
  }

  return null;
}

export async function finishOperatorTask(
  db: Firestore,
  taskId: string,
  payload: {
    status: "success" | "warning" | "error" | "canceled";
    resultSummary?: string;
    lastError?: string;
    metaPatch?: Record<string, unknown>;
  }
) {
  const finishedAt = nowDate();
  const ref = queueCollection(db).doc(taskId);
  const snap = await ref.get().catch(() => null);
  const currentMeta =
    snap?.exists && typeof snap.data()?.meta === "object" && snap.data()?.meta
      ? snap.data()?.meta
      : {};

  await ref.set(
    {
      status: payload.status,
      finishedAt,
      updatedAt: finishedAt,
      lockedBy: "",
      lockExpiresAt: null,
      resultSummary: normalizeString(payload.resultSummary),
      lastError: normalizeString(payload.lastError),
      meta: {
        ...currentMeta,
        ...(payload.metaPatch || {}),
      },
    },
    { merge: true }
  );

  await registerQueueAction(
    db,
    payload.status === "success"
      ? "success"
      : payload.status === "warning"
      ? "warning"
      : "error",
    `Task da fila finalizada com status ${payload.status}.`,
    {
      queueTaskId: taskId,
      resultSummary: payload.resultSummary || "",
      lastError: payload.lastError || "",
    }
  );
}

export async function requeueOperatorTask(
  db: Firestore,
  taskId: string,
  payload?: {
    delayMinutes?: number;
    priority?: OperatorQueuePriority;
    reason?: string;
  }
) {
  const now = nowDate();
  const delayMinutes = Math.max(1, Number(payload?.delayMinutes || 5));
  const scheduledAt = new Date(now.getTime() + delayMinutes * 60 * 1000);

  const ref = queueCollection(db).doc(taskId);
  const snap = await ref.get().catch(() => null);

  if (!snap?.exists) {
    return { ok: false as const, error: "Task não encontrada." };
  }

  const data = snap.data() || {};
  const priority =
    (payload?.priority as OperatorQueuePriority) ||
    (data.priority as OperatorQueuePriority) ||
    "normal";

  await ref.set(
    {
      status: "queued",
      priority,
      scheduledAt,
      updatedAt: now,
      finishedAt: null,
      lockedBy: "",
      lockExpiresAt: null,
      resultSummary: "",
      lastError: normalizeString(payload?.reason),
      sortScore: buildTaskSortScore(priority, now),
    },
    { merge: true }
  );

  await registerQueueAction(
    db,
    "warning",
    "Task devolvida para a fila.",
    {
      queueTaskId: taskId,
      delayMinutes,
      priority,
      reason: payload?.reason || "",
    }
  );

  return {
    ok: true as const,
    taskId,
    scheduledAt,
  };
}

export async function seedOperatorQueueFromMetrics(
  db: Firestore,
  metrics: {
    totalBrokenChapters?: number;
    sourcesCritical?: number;
    sourcesWarning?: number;
    autoSyncActive?: number;
    last24hImportedChapters?: number;
  }
) {
  const created: string[] = [];

  if ((metrics.totalBrokenChapters || 0) > 0) {
    const result = await enqueueOperatorTask(db, {
      type: "operator-maintenance",
      priority:
        (metrics.totalBrokenChapters || 0) > 20 ? "critical" : "high",
      dedupeKey: "seed::operator-maintenance::broken-chapters",
      title: "Manutenção automática por capítulos quebrados",
      description:
        "Métricas indicaram capítulos quebrados e exigem ciclo de recovery/manutenção.",
      maxAttempts: 3,
      meta: {
        totalBrokenChapters: metrics.totalBrokenChapters || 0,
      },
    });

    if (result.created) created.push(result.id);
  }

  if ((metrics.sourcesCritical || 0) > 0) {
    const result = await enqueueOperatorTask(db, {
      type: "source-health-check",
      priority: "critical",
      dedupeKey: "seed::source-health-check::critical",
      title: "Revisão automática de fontes críticas",
      description:
        "Métricas indicaram fontes críticas e exigem recalcular saúde/aprendizado.",
      maxAttempts: 3,
      meta: {
        sourcesCritical: metrics.sourcesCritical || 0,
        sourcesWarning: metrics.sourcesWarning || 0,
      },
    });

    if (result.created) created.push(result.id);
  }

  if (
    (metrics.autoSyncActive || 0) > 0 &&
    (metrics.last24hImportedChapters || 0) === 0
  ) {
    const result = await enqueueOperatorTask(db, {
      type: "operator-maintenance",
      priority: "high",
      dedupeKey: "seed::operator-maintenance::stalled-import",
      title: "Investigar automação sem progresso",
      description:
        "Auto sync ativo sem importações recentes nas últimas 24h.",
      maxAttempts: 3,
      meta: {
        autoSyncActive: metrics.autoSyncActive || 0,
        last24hImportedChapters: metrics.last24hImportedChapters || 0,
      },
    });

    if (result.created) created.push(result.id);
  }

  return {
    ok: true,
    createdCount: created.length,
    ids: created,
  };
}