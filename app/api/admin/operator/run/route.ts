import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { runOperatorCycle } from "@/lib/operatorCore";
import { runBasicRecovery } from "@/lib/operatorRecovery";
import { getOperatorQueueStats } from "@/lib/operatorQueue";
import {
  storeOperatorMemory,
  upsertRecurringProblem,
} from "@/lib/operatorMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANUAL_LOCK_TTL_MS = 1000 * 60 * 8;

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

function automationNot100(metrics?: {
  autoSyncActive?: number;
  last24hImportedChapters?: number;
  sourcesCritical?: number;
  sourcesWarning?: number;
  totalBrokenChapters?: number;
}) {
  if (!metrics) return true;

  return (
    ((metrics.autoSyncActive ?? 0) > 0 &&
      (metrics.last24hImportedChapters ?? 0) === 0) ||
    (metrics.sourcesCritical ?? 0) > 0 ||
    (metrics.sourcesWarning ?? 0) > 1 ||
    (metrics.totalBrokenChapters ?? 0) > 0
  );
}

function buildQueueFallback() {
  return {
    total: 0,
    queued: 0,
    running: 0,
    success: 0,
    warning: 0,
    error: 0,
    critical: 0,
    high: 0,
  };
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function toDate(value: any, fallback: Date | null = null) {
  if (!value) return fallback;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") {
    try {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : fallback;
    } catch {
      return fallback;
    }
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

function serializeValue(value: any): any {
  if (value == null) return value;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value?.toDate === "function") {
    try {
      const d = value.toDate();
      if (d instanceof Date && !Number.isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {}
  }

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

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    },
  });
}

async function createAction(
  db: FirebaseFirestore.Firestore,
  status: "success" | "warning" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await db.collection("system").doc("actions").collection("items").add({
    type: "operator-run-manual",
    status,
    message,
    meta: meta || {},
    createdAt: new Date(),
  });
}

async function createIncident(
  db: FirebaseFirestore.Firestore,
  title: string,
  severity: "warning" | "high" | "critical",
  meta?: Record<string, unknown>,
  type = "operator"
) {
  const existing = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .where("title", "==", title)
    .where("type", "==", type)
    .where("resolved", "==", false)
    .limit(1)
    .get()
    .catch(() => null);

  if (existing && !existing.empty) {
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

async function acquireManualRunLock(
  db: FirebaseFirestore.Firestore,
  startedAt: Date,
  runId: string
) {
  const ref = db.collection("system").doc("operatorManualRunLock");
  const snap = await ref.get().catch(() => null);
  const data = snap?.data() || {};

  const isRunning = data.running === true;
  const lockedAt = toDate(data.lockedAt, null);
  const currentRunId = normalizeText(data.runId);

  if (
    isRunning &&
    lockedAt &&
    startedAt.getTime() - lockedAt.getTime() < MANUAL_LOCK_TTL_MS
  ) {
    return {
      ok: false as const,
      reason: "Já existe uma execução manual do operador em andamento.",
      lockedAt,
      runId: currentRunId,
    };
  }

  await ref.set(
    {
      running: true,
      lockedAt: startedAt,
      runId,
      updatedAt: startedAt,
    },
    { merge: true }
  );

  return { ok: true as const };
}

async function releaseManualRunLock(
  db: FirebaseFirestore.Firestore,
  finishedAt: Date,
  runId: string
) {
  await db.collection("system").doc("operatorManualRunLock").set(
    {
      running: false,
      unlockedAt: finishedAt,
      runId: "",
      lastRunId: runId,
      updatedAt: finishedAt,
    },
    { merge: true }
  );
}

function buildHealthSummary(params: {
  operatorOk: boolean;
  recoveryOk: boolean;
  queueHasError: boolean;
  automationWarning: boolean;
}) {
  if (!params.operatorOk) return "critical";
  if (!params.recoveryOk) return "warning";
  if (params.queueHasError) return "warning";
  if (params.automationWarning) return "warning";
  return "healthy";
}

function buildSummaryMessage(params: {
  finalOk: boolean;
  operatorOk: boolean;
  recoveryOk: boolean;
  queueHasError: boolean;
  automationWarning: boolean;
}) {
  if (!params.operatorOk) {
    return "O LK AI Operator falhou na execução principal e precisa de atenção imediata.";
  }

  if (params.operatorOk && !params.recoveryOk) {
    return "O operador executou, mas o recovery retornou falhas e exige revisão.";
  }

  if (params.finalOk && params.automationWarning) {
    return "Operador executado com sucesso, mas a automação discovery/importação ainda não está 100% confiável.";
  }

  if (params.finalOk && params.queueHasError) {
    return "Operador executado com sucesso, mas ainda existem tarefas críticas/erro na fila.";
  }

  if (params.finalOk) {
    return "Operador executado com sucesso e automação estável no momento.";
  }

  return "O operador executou com falhas e precisa de atenção.";
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return noStoreJson(
      { ok: false, error: "Unauthorized" },
      401
    );
  }

  const startedAtDate = new Date();
  const runId = `manual-run-${startedAtDate.getTime()}`;

  try {
    const db = getAdminDb();

    if (!db) {
      return noStoreJson(
        { ok: false, error: "Firebase Admin não configurado." },
        500
      );
    }

    const lock = await acquireManualRunLock(db, startedAtDate, runId);

    if (!lock.ok) {
      return noStoreJson(
        {
          ok: false,
          skipped: true,
          reason: lock.reason,
          lockedAt: lock.lockedAt?.toISOString?.() || null,
          runId: lock.runId || "",
        },
        409
      );
    }

    await db.collection("system").doc("operator").set(
      {
        manualRunStatus: "running",
        manualRunStartedAt: startedAtDate,
        manualRunLastError: "",
        manualRunCurrentId: runId,
        updatedAt: startedAtDate,
      },
      { merge: true }
    );

    await createAction(
      db,
      "success",
      "Execução manual do operador iniciada.",
      { runId }
    );

    const operatorResult = await runOperatorCycle(db);
    const recoveryResult = await runBasicRecovery(db);
    const queueStats = await getOperatorQueueStats(db).catch(() =>
      buildQueueFallback()
    );

    const finishedAtDate = new Date();
    const durationMs = finishedAtDate.getTime() - startedAtDate.getTime();

    const metrics = operatorResult.ok ? operatorResult.status?.metrics : null;
    const automationWarning = automationNot100(metrics || undefined);

    const operatorOk = !!operatorResult.ok;
    const recoveryOk = !!recoveryResult.ok;
    const queueHasError =
      safeNumber(queueStats.error, 0) > 0 || safeNumber(queueStats.critical, 0) > 0;

    const finalOk = operatorOk && recoveryOk;
    const finalHealth = buildHealthSummary({
      operatorOk,
      recoveryOk,
      queueHasError,
      automationWarning,
    });

    const summaryMessage = buildSummaryMessage({
      finalOk,
      operatorOk,
      recoveryOk,
      queueHasError,
      automationWarning,
    });

    const responsePayload = {
      ok: finalOk,
      startedAt: startedAtDate.toISOString(),
      finishedAt: finishedAtDate.toISOString(),
      durationMs,
      runId,

      operator: operatorResult,
      recovery: recoveryResult,
      queue: queueStats,

      summary: {
        operatorOk,
        recoveryOk,
        queueHasError,
        recoveredChapters: recoveryResult.recovered ?? 0,
        failedRecoveries: recoveryResult.failed ?? 0,
        skippedRecoveries: recoveryResult.skipped ?? 0,
        scannedRecoveries: recoveryResult.scanned ?? 0,
        automationNot100: automationWarning,
        queueQueued: queueStats.queued ?? 0,
        queueRunning: queueStats.running ?? 0,
        queueError: queueStats.error ?? 0,
        queueCritical: queueStats.critical ?? 0,
        reportId: operatorResult.ok ? operatorResult.reportId || "" : "",
        health: operatorResult.ok ? operatorResult.status?.health || finalHealth : "critical",
        finalHealth,
        currentJobStatus: operatorResult.ok
          ? operatorResult.status?.currentJobStatus || ""
          : "error",
        message: summaryMessage,
      },
    };

    await db.collection("system").doc("operator").set(
      {
        manualRunStatus: finalOk ? "success" : "warning",
        manualRunFinishedAt: finishedAtDate,
        manualRunLastDurationMs: durationMs,
        manualRunLastError: finalOk ? "" : normalizeText(operatorResult?.error),
        manualRunLastSummary: summaryMessage,
        manualRunLastId: runId,
        manualRunCurrentId: "",
        updatedAt: finishedAtDate,
      },
      { merge: true }
    );

    await db.collection("system").doc("manualRuns").collection("items").add({
      runId,
      startedAt: startedAtDate,
      finishedAt: finishedAtDate,
      durationMs,
      ok: finalOk,
      operatorOk,
      recoveryOk,
      queueHasError,
      automationNot100: automationWarning,
      summary: responsePayload.summary,
      operatorReportId: operatorResult.ok ? operatorResult.reportId || "" : "",
      createdAt: finishedAtDate,
    });

    await storeOperatorMemory(db, {
      type: "manual-run",
      success: finalOk,
      impactScore: finalOk ? (automationWarning ? 5 : 10) : -10,
      title: finalOk
        ? "Execução manual do operador concluída"
        : "Execução manual do operador com falha",
      summary: summaryMessage,
      context: {
        runId,
        durationMs,
        operatorOk,
        recoveryOk,
        queueHasError,
        automationNot100: automationWarning,
        queue: serializeValue(queueStats),
        operatorReportId: operatorResult.ok ? operatorResult.reportId || "" : "",
      },
    }).catch(() => null);

    if (!operatorOk) {
      await createIncident(
        db,
        "Falha em execução manual do LK AI Operator",
        "high",
        {
          runId,
          durationMs,
          operatorResult: serializeValue(operatorResult),
        },
        "operator"
      );

      await upsertRecurringProblem(db, {
        key: "manual-run::operator-failure",
        title: "Falhas em execução manual do operador",
        type: "operator",
        severity: "high",
        meta: {
          runId,
          durationMs,
        },
      }).catch(() => null);

      await createAction(
        db,
        "error",
        "Execução manual do operador falhou no núcleo principal.",
        {
          runId,
          durationMs,
          operatorResult: serializeValue(operatorResult),
        }
      );
    } else if (!recoveryOk) {
      await createAction(
        db,
        "warning",
        "Execução manual do operador concluída, mas recovery retornou falhas.",
        {
          runId,
          durationMs,
          recoveryResult: serializeValue(recoveryResult),
        }
      );
    } else if (queueHasError || automationWarning) {
      await createAction(
        db,
        "warning",
        "Execução manual do operador concluída com alertas operacionais.",
        {
          runId,
          durationMs,
          queue: serializeValue(queueStats),
          automationNot100: automationWarning,
        }
      );
    } else {
      await createAction(
        db,
        "success",
        "Execução manual do operador concluída com sucesso.",
        {
          runId,
          durationMs,
          reportId: operatorResult.ok ? operatorResult.reportId || "" : "",
        }
      );
    }

    await releaseManualRunLock(db, finishedAtDate, runId);

    return noStoreJson(responsePayload, 200);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    const finishedAtDate = new Date();

    try {
      const db = getAdminDb();

      if (db) {
        await db.collection("system").doc("operator").set(
          {
            manualRunStatus: "error",
            manualRunFinishedAt: finishedAtDate,
            manualRunLastDurationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
            manualRunLastError: message,
            manualRunLastId: runId,
            manualRunCurrentId: "",
            updatedAt: finishedAtDate,
          },
          { merge: true }
        );

        await db.collection("system").doc("manualRuns").collection("items").add({
          runId,
          startedAt: startedAtDate,
          finishedAt: finishedAtDate,
          durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
          ok: false,
          operatorOk: false,
          recoveryOk: false,
          queueHasError: false,
          automationNot100: true,
          summary: {
            health: "critical",
            currentJobStatus: "error",
            message,
          },
          createdAt: finishedAtDate,
        });

        await storeOperatorMemory(db, {
          type: "manual-run",
          success: false,
          impactScore: -12,
          title: "Execução manual do operador falhou",
          summary: message,
          context: {
            runId,
          },
        }).catch(() => null);

        await upsertRecurringProblem(db, {
          key: "manual-run::fatal-error",
          title: "Falha fatal em execução manual do operador",
          type: "operator",
          severity: "high",
          meta: {
            runId,
            message,
          },
        }).catch(() => null);

        await createIncident(
          db,
          "Falha fatal em execução manual do LK AI Operator",
          "high",
          {
            runId,
            message,
          },
          "operator"
        );

        await createAction(
          db,
          "error",
          "Execução manual do operador terminou com erro fatal.",
          {
            runId,
            message,
          }
        );

        await releaseManualRunLock(db, finishedAtDate, runId);
      }
    } catch (nestedError) {
      console.error("Erro ao registrar falha do manual run:", nestedError);
    }

    return noStoreJson(
      {
        ok: false,
        error: message,
        startedAt: startedAtDate.toISOString(),
        finishedAt: finishedAtDate.toISOString(),
        durationMs: finishedAtDate.getTime() - startedAtDate.getTime(),
        runId,
        operator: null,
        recovery: null,
        queue: buildQueueFallback(),
        summary: {
          operatorOk: false,
          recoveryOk: false,
          queueHasError: false,
          recoveredChapters: 0,
          failedRecoveries: 0,
          skippedRecoveries: 0,
          scannedRecoveries: 0,
          automationNot100: true,
          queueQueued: 0,
          queueRunning: 0,
          queueError: 0,
          queueCritical: 0,
          reportId: "",
          health: "critical",
          finalHealth: "critical",
          currentJobStatus: "error",
          message,
        },
      },
      500
    );
  }
}