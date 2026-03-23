import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { acquireAutomationLock, releaseAutomationLock } from "@/lib/automationLock";
import {
  createAutomationLog,
  finishAutomationLog,
  type AutomationTaskType,
} from "@/lib/automationLogger";
import { runSourceHealthCheck } from "@/lib/sourceHealth";

export type QueueStatus = "queued" | "processing" | "done" | "failed";

export type AutomationConfig = {
  enabled: boolean;
  autoDiscovery: boolean;
  autoSync: boolean;
  autoCleanup: boolean;
  autoSourceHealth: boolean;
  discoveryEveryMinutes: number;
  syncEveryMinutes: number;
  cleanupEveryMinutes: number;
  sourceHealthEveryMinutes: number;
  processBatchSize: number;
  syncBatchSize: number;
  cleanupBatchSize: number;
  maxRetryAttempts: number;
  retryDelayMinutes: number;
  lastRuns: {
    discovery: number;
    sync: number;
    cleanup: number;
    sourceHealth: number;
  };
};

export type QueueItem = {
  id: string;
  type: AutomationTaskType;
  status: QueueStatus;
  priority: number;
  attempts: number;
  runAfterMs: number;
  payload?: any;
  lockedBy?: string | null;
  lastError?: string | null;
  retryAtMs?: number | null;
  finishedAtMs?: number | null;
  startedAtMs?: number | null;
};

const DEFAULT_CONFIG: AutomationConfig = {
  enabled: true,
  autoDiscovery: true,
  autoSync: true,
  autoCleanup: true,
  autoSourceHealth: true,
  discoveryEveryMinutes: 360,
  syncEveryMinutes: 120,
  cleanupEveryMinutes: 720,
  sourceHealthEveryMinutes: 180,
  processBatchSize: 2,
  syncBatchSize: 20,
  cleanupBatchSize: 50,
  maxRetryAttempts: 4,
  retryDelayMinutes: 5,
  lastRuns: {
    discovery: 0,
    sync: 0,
    cleanup: 0,
    sourceHealth: 0,
  },
};

export async function ensureAutomationConfig() {
  const db = getAdminDb();
  if (!db) return DEFAULT_CONFIG;

  const ref = db.collection("system_config").doc("automation");
  const snap = await ref.get();

  if (!snap.exists) {
    await ref.set({
      ...DEFAULT_CONFIG,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return DEFAULT_CONFIG;
  }

  const current = snap.data() || {};

  const config: AutomationConfig = {
    ...DEFAULT_CONFIG,
    ...current,
    lastRuns: {
      ...DEFAULT_CONFIG.lastRuns,
      ...(current.lastRuns || {}),
    },
  };

  await ref.set(
    {
      ...config,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return config;
}

export async function getAutomationConfig() {
  return ensureAutomationConfig();
}

export async function updateAutomationConfig(partial: Partial<AutomationConfig>) {
  const db = getAdminDb();
  if (!db) return null;

  const current = await ensureAutomationConfig();

  const next: AutomationConfig = {
    ...current,
    ...partial,
    lastRuns: {
      ...current.lastRuns,
      ...(partial.lastRuns || {}),
    },
  };

  await db.collection("system_config").doc("automation").set(
    {
      ...next,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return next;
}

export async function enqueueAutomationTask(params: {
  type: AutomationTaskType;
  priority?: number;
  payload?: any;
  runAfterMs?: number;
}) {
  const db = getAdminDb();
  if (!db) return null;

  const ref = db.collection("automation_queue").doc();

  await ref.set({
    type: params.type,
    status: "queued",
    priority: Number(params.priority ?? 100),
    payload: params.payload || null,
    attempts: 0,
    runAfterMs: Number(params.runAfterMs ?? Date.now()),
    retryAtMs: null,
    lockedBy: null,
    lastError: null,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

export async function listAutomationQueue(limitCount = 30) {
  const db = getAdminDb();
  if (!db) return [];

  const snap = await db
    .collection("automation_queue")
    .orderBy("createdAtMs", "desc")
    .limit(limitCount)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));
}

export async function listFailedAutomationQueue(limitCount = 30) {
  const db = getAdminDb();
  if (!db) return [];

  const snap = await db
    .collection("automation_queue")
    .where("status", "==", "failed")
    .orderBy("finishedAtMs", "desc")
    .limit(limitCount)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));
}

export async function retryAutomationTask(taskId: string) {
  const db = getAdminDb();
  if (!db) {
    return { ok: false, error: "Firestore Admin indisponível." };
  }

  const ref = db.collection("automation_queue").doc(taskId);
  const snap = await ref.get();

  if (!snap.exists) {
    return { ok: false, error: "Tarefa não encontrada." };
  }

  await ref.set(
    {
      status: "queued",
      priority: 1,
      runAfterMs: Date.now(),
      retryAtMs: Date.now(),
      lockedBy: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true, taskId };
}

export async function retryAllFailedAutomationTasks(limitCount = 20) {
  const db = getAdminDb();
  if (!db) {
    return { ok: false, retried: 0, error: "Firestore Admin indisponível." };
  }

  const failed = await listFailedAutomationQueue(limitCount);

  for (const item of failed) {
    await db.collection("automation_queue").doc(item.id).set(
      {
        status: "queued",
        priority: 1,
        runAfterMs: Date.now(),
        retryAtMs: Date.now(),
        lockedBy: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    ok: true,
    retried: failed.length,
    taskIds: failed.map((item) => item.id),
  };
}

async function leaseNextTask(ownerId: string) {
  const db = getAdminDb();
  if (!db) return null;

  const snap = await db
    .collection("automation_queue")
    .where("status", "==", "queued")
    .orderBy("priority", "asc")
    .orderBy("createdAtMs", "asc")
    .limit(20)
    .get();

  const now = Date.now();

  for (const doc of snap.docs) {
    const data = doc.data() as any;
    const runAfterMs = Number(data.runAfterMs || 0);
    const retryAtMs = Number(data.retryAtMs || 0);

    if (runAfterMs > now) continue;
    if (retryAtMs && retryAtMs > now) continue;

    const ref = doc.ref;

    try {
      const locked = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(ref);
        if (!fresh.exists) return false;

        const current = fresh.data() || {};
        if (current.status !== "queued") return false;
        if (Number(current.runAfterMs || 0) > Date.now()) return false;
        if (Number(current.retryAtMs || 0) > Date.now()) return false;

        tx.set(
          ref,
          {
            status: "processing",
            lockedBy: ownerId,
            attempts: Number(current.attempts || 0) + 1,
            startedAtMs: Date.now(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return true;
      });

      if (locked) {
        return {
          id: doc.id,
          ...(data as any),
          status: "processing",
          lockedBy: ownerId,
          attempts: Number(data.attempts || 0) + 1,
        } as QueueItem;
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function finishTaskSuccess(taskId: string, details?: any) {
  const db = getAdminDb();
  if (!db) return;

  await db.collection("automation_queue").doc(taskId).set(
    {
      status: "done",
      finishedAtMs: Date.now(),
      lockedBy: null,
      result: details || null,
      lastError: null,
      retryAtMs: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function finishTaskError(taskId: string, errorMessage: string) {
  const db = getAdminDb();
  if (!db) return;

  const config = await ensureAutomationConfig();
  const ref = db.collection("automation_queue").doc(taskId);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;

  const attempts = Number(data?.attempts || 0);
  const maxAttempts = Number(config.maxRetryAttempts || 4);
  const baseDelayMinutes = Number(config.retryDelayMinutes || 5);

  if (attempts < maxAttempts) {
    const retryDelayMs = Math.min(
      baseDelayMinutes * 60 * 1000 * Math.pow(2, attempts),
      1000 * 60 * 60
    );

    await ref.set(
      {
        status: "queued",
        priority: 1,
        lockedBy: null,
        lastError: errorMessage,
        retryAtMs: Date.now() + retryDelayMs,
        runAfterMs: Date.now() + retryDelayMs,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return;
  }

  console.warn("🚨 Task falhou definitivo:", taskId);

  await ref.set(
    {
      status: "failed",
      finishedAtMs: Date.now(),
      lockedBy: null,
      lastError: errorMessage,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function getBaseUrl(origin?: string) {
  if (origin) return origin;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

async function postInternal(path: string, origin?: string, body?: any) {
  const token = process.env.ADMIN_SYNC_TOKEN || "";
  const baseUrl = getBaseUrl(origin);

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify(body || {}),
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(json?.error || json?.message || `Falha em ${path}`);
  }

  return json;
}

async function updateLastRun(type: AutomationTaskType) {
  const db = getAdminDb();
  if (!db) return;

  const key = type === "source-health" ? "sourceHealth" : type;

  await db.collection("system_config").doc("automation").set(
    {
      [`lastRuns.${key}`]: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function processAutomationTask(task: QueueItem, origin?: string) {
  const db = getAdminDb();

  const logId = await createAutomationLog({
    type: task.type,
    status: "running",
    source: "queue",
    taskId: task.id,
    message: `Iniciando tarefa ${task.type}`,
    details: task.payload || null,
  });

  try {
    let result: any = null;

    if (task.type === "discovery") {
      result = await postInternal("/api/admin/discovery/auto-import", origin, {
        limit: task.payload?.limit ?? 30,
      });
    } else if (task.type === "sync") {
      result = await postInternal("/api/admin/sync", origin, {
        limit: task.payload?.limit ?? 20,
        mode: "incremental",
      });
    } else if (task.type === "cleanup") {
      result = await postInternal("/api/admin/cleanup-titles", origin, {
        limit: task.payload?.limit ?? 50,
      });
    } else if (task.type === "source-health") {
      if (!db) {
        throw new Error("Firestore Admin indisponível para source-health.");
      }
      result = await runSourceHealthCheck(db);
    } else {
      throw new Error(`Tipo de tarefa não suportado: ${task.type}`);
    }

    await finishTaskSuccess(task.id, result);
    await updateLastRun(task.type);

    await finishAutomationLog({
      logId,
      status: "success",
      message: `Tarefa ${task.type} concluída com sucesso.`,
      details: result,
    });

    return {
      ok: true,
      taskId: task.id,
      type: task.type,
      result,
    };
  } catch (error: any) {
    const message = error?.message || "Falha desconhecida";

    await finishTaskError(task.id, message);

    await finishAutomationLog({
      logId,
      status: "error",
      message,
      details: { error: message },
    });

    return {
      ok: false,
      taskId: task.id,
      type: task.type,
      error: message,
    };
  }
}

export async function scheduleDueAutomationTasks() {
  const config = await ensureAutomationConfig();

  if (!config.enabled) {
    return { ok: true, scheduled: 0, reason: "Automação desativada." };
  }

  const now = Date.now();
  const scheduled: string[] = [];

  const dueRules = [
    {
      enabled: config.autoDiscovery,
      type: "discovery" as AutomationTaskType,
      everyMinutes: config.discoveryEveryMinutes,
      lastRun: Number(config.lastRuns.discovery || 0),
      priority: 10,
      payload: { limit: 30 },
    },
    {
      enabled: config.autoSync,
      type: "sync" as AutomationTaskType,
      everyMinutes: config.syncEveryMinutes,
      lastRun: Number(config.lastRuns.sync || 0),
      priority: 20,
      payload: { limit: config.syncBatchSize || 20 },
    },
    {
      enabled: config.autoCleanup,
      type: "cleanup" as AutomationTaskType,
      everyMinutes: config.cleanupEveryMinutes,
      lastRun: Number(config.lastRuns.cleanup || 0),
      priority: 30,
      payload: { limit: config.cleanupBatchSize || 50 },
    },
    {
      enabled: config.autoSourceHealth,
      type: "source-health" as AutomationTaskType,
      everyMinutes: config.sourceHealthEveryMinutes,
      lastRun: Number(config.lastRuns.sourceHealth || 0),
      priority: 5,
      payload: {},
    },
  ];

  for (const rule of dueRules) {
    if (!rule.enabled) continue;

    const intervalMs = rule.everyMinutes * 60 * 1000;
    const due = !rule.lastRun || now - rule.lastRun >= intervalMs;

    if (due) {
      const id = await enqueueAutomationTask({
        type: rule.type,
        priority: rule.priority,
        payload: rule.payload,
      });

      if (id) scheduled.push(id);
    }
  }

  return {
    ok: true,
    scheduled: scheduled.length,
    taskIds: scheduled,
  };
}

export async function processAutomationQueue(params?: {
  limit?: number;
  origin?: string;
}) {
  const config = await ensureAutomationConfig();

  if (!config.enabled) {
    return { ok: true, processed: 0, reason: "Automação desativada." };
  }

  const lock = await acquireAutomationLock("automation-queue", 1000 * 60 * 15);

  if (!lock.ok) {
    return {
      ok: false,
      locked: true,
      processed: 0,
      reason: lock.reason || "Fila já está em execução.",
    };
  }

  const limit = Math.max(
    1,
    Math.min(Number(params?.limit ?? config.processBatchSize ?? 1), 5)
  );

  const results: any[] = [];
  let processed = 0;

  try {
    while (processed < limit) {
      const task = await leaseNextTask(lock.ownerId);
      if (!task) break;

      const result = await processAutomationTask(task, params?.origin);
      results.push(result);
      processed += 1;
    }

    return {
      ok: true,
      processed,
      results,
    };
  } finally {
    await releaseAutomationLock("automation-queue", lock.ownerId);
  }
}

export async function getAutomationStatus() {
  const db = getAdminDb();
  const config = await ensureAutomationConfig();

  if (!db) {
    return {
      ok: false,
      config,
      queue: {
        queued: 0,
        processing: 0,
        done: 0,
        failed: 0,
      },
      recentLogs: [],
      sources: [],
      locks: [],
      failedQueue: [],
    };
  }

  const [queueSnap, logSnap, sourceSnap, lockSnap, failedSnap] = await Promise.all([
    db.collection("automation_queue").orderBy("createdAtMs", "desc").limit(100).get(),
    db.collection("automation_logs").orderBy("startedAtMs", "desc").limit(12).get(),
    db.collection("mangas").where("autoSync", "==", true).limit(10).get(),
    db.collection("automation_locks").get(),
    db.collection("automation_queue")
      .where("status", "==", "failed")
      .orderBy("finishedAtMs", "desc")
      .limit(20)
      .get(),
  ]);

  const queueItems = queueSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));

  const recentLogs = logSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));

  const sources = sourceSnap.docs.map((doc) => {
    const data = doc.data() as any;
    return {
      id: doc.id,
      title: data?.title || doc.id,
      sourceHealth: data?.sourceHealth || "unknown",
      primarySourceUrl: data?.primarySourceUrl || data?.sourceUrl || "",
      primarySourceHost: data?.primarySourceHost || data?.sourceHost || "",
      sourceFailCount: Number(data?.sourceFailCount || 0),
      lastErrorMessage: data?.lastErrorMessage || "",
      lastSuccessSource: data?.lastSuccessSource || "",
    };
  });

  const locks = lockSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  }));

  const failedQueue = failedSnap.docs.map((doc) => {
    const item = doc.data() as any;
    return {
      id: doc.id,
      ...item,
      nextRetryAt: item.retryAtMs || null,
    };
  });

  return {
    ok: true,
    config,
    queue: {
      queued: queueItems.filter((item) => item.status === "queued").length,
      processing: queueItems.filter((item) => item.status === "processing").length,
      done: queueItems.filter((item) => item.status === "done").length,
      failed: queueItems.filter((item) => item.status === "failed").length,
    },
    recentLogs,
    sources,
    locks,
    failedQueue,
  };
}