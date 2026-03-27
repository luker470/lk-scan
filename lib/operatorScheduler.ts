import type { Firestore } from "firebase-admin/firestore";
import { runOperatorCycle } from "@/lib/operatorCore";
import { runBasicRecovery } from "@/lib/operatorRecovery";
import { getOperatorQueueStats } from "@/lib/operatorQueue";

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

export async function runScheduledOperator(db: Firestore) {
  const startedAt = Date.now();
  const startedAtDate = new Date();

  await db.collection("system").doc("scheduler").set(
    {
      status: "running",
      lastRunStartedAt: startedAtDate,
      lastError: "",
      updatedAt: startedAtDate,
    },
    { merge: true }
  );

  try {
    const operator = await runOperatorCycle(db);
    const recovery = await runBasicRecovery(db);
    const queue = await getOperatorQueueStats(db).catch(() =>
      buildQueueFallback()
    );

    const durationMs = Date.now() - startedAt;
    const finishedAt = new Date();

    const metrics = operator.ok ? operator.status?.metrics : null;
    const automationWarning = automationNot100(metrics || undefined);

    const operatorOk = !!operator.ok;
    const recoveryOk = !!recovery.ok;
    const finalOk = operatorOk && recoveryOk;

    const summary = {
      operatorOk,
      recoveryOk,
      recoveredCount: recovery.recovered ?? 0,
      failedRecoveries: recovery.failed ?? 0,
      skippedRecoveries: recovery.skipped ?? 0,
      scannedRecoveries: recovery.scanned ?? 0,
      automationNot100: automationWarning,
      queue,
      message: operatorOk
        ? automationWarning
          ? "Ciclo executado com sucesso, mas a descoberta/importação automática ainda não está 100% confiável."
          : "Ciclo executado com sucesso e automação estável no momento."
        : "Ciclo executado com falhas e precisa de atenção.",
    };

    await db.collection("system").doc("scheduler").set(
      {
        status: operatorOk ? (automationWarning ? "warning" : "success") : "error",
        lastRunAt: finishedAt,
        lastRunFinishedAt: finishedAt,
        updatedAt: finishedAt,
        durationMs,

        operatorOk,
        recoveryOk,

        recoveredCount: recovery.recovered ?? 0,
        failedRecoveries: recovery.failed ?? 0,
        skippedRecoveries: recovery.skipped ?? 0,
        scannedRecoveries: recovery.scanned ?? 0,

        automationNot100: automationWarning,
        operatorSummary: operatorOk
          ? operator.report?.summary || summary.message
          : operator.error || "Ciclo concluído com falhas.",
        lastReportId: operatorOk ? operator.reportId || "" : "",
        lastHealth: operatorOk ? operator.status?.health || "" : "critical",
        lastJobStatus: operatorOk
          ? operator.status?.currentJobStatus || ""
          : "error",
        lastError: operatorOk ? "" : operator.error || "",
        summary,
      },
      { merge: true }
    );

    await db.collection("system").doc("actions").collection("items").add({
      type: "scheduler-cycle",
      status: operatorOk ? (automationWarning ? "warning" : "success") : "error",
      message: summary.message,
      meta: {
        durationMs,
        operatorOk,
        recoveryOk,
        recoveredCount: recovery.recovered ?? 0,
        failedRecoveries: recovery.failed ?? 0,
        skippedRecoveries: recovery.skipped ?? 0,
        scannedRecoveries: recovery.scanned ?? 0,
        automationNot100: automationWarning,
        queue,
        reportId: operatorOk ? operator.reportId || "" : "",
        health: operatorOk ? operator.status?.health || "" : "critical",
      },
      createdAt: finishedAt,
    });

    return {
      ok: finalOk,
      durationMs,
      startedAt: startedAtDate.toISOString(),
      finishedAt: finishedAt.toISOString(),
      operator,
      recovery,
      queue,
      summary,
    };
  } catch (error: unknown) {
    const finishedAt = new Date();
    const durationMs = Date.now() - startedAt;
    const message =
      error instanceof Error ? error.message : "Erro ao executar scheduler.";

    await db.collection("system").doc("scheduler").set(
      {
        status: "error",
        lastRunAt: finishedAt,
        lastRunFinishedAt: finishedAt,
        updatedAt: finishedAt,
        durationMs,
        operatorOk: false,
        recoveryOk: false,
        recoveredCount: 0,
        failedRecoveries: 0,
        skippedRecoveries: 0,
        scannedRecoveries: 0,
        automationNot100: true,
        lastError: message,
        summary: {
          operatorOk: false,
          recoveryOk: false,
          recoveredCount: 0,
          failedRecoveries: 0,
          skippedRecoveries: 0,
          scannedRecoveries: 0,
          automationNot100: true,
          queue: buildQueueFallback(),
          message,
        },
      },
      { merge: true }
    );

    await db.collection("system").doc("actions").collection("items").add({
      type: "scheduler-cycle",
      status: "error",
      message,
      meta: {
        durationMs,
      },
      createdAt: finishedAt,
    });

    return {
      ok: false,
      durationMs,
      startedAt: startedAtDate.toISOString(),
      finishedAt: finishedAt.toISOString(),
      error: message,
      queue: buildQueueFallback(),
    };
  }
}