import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { runOperatorCycle } from "@/lib/operatorCore";
import { runBasicRecovery } from "@/lib/operatorRecovery";
import { getOperatorQueueStats } from "@/lib/operatorQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const startedAtDate = new Date();

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

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
      (queueStats.error ?? 0) > 0 || (queueStats.critical ?? 0) > 0;

    const finalOk = operatorOk && recoveryOk;

    let summaryMessage = "O operador executou com falhas e precisa de atenção.";

    if (finalOk && automationWarning) {
      summaryMessage =
        "Operador executado com sucesso, mas a automação de descoberta/importação ainda não está 100% confiável.";
    } else if (finalOk && queueHasError) {
      summaryMessage =
        "Operador executado com sucesso, mas ainda existem tarefas críticas/erro na fila.";
    } else if (finalOk) {
      summaryMessage =
        "Operador executado com sucesso e automação estável no momento.";
    }

    return NextResponse.json({
      ok: finalOk,
      startedAt: startedAtDate.toISOString(),
      finishedAt: finishedAtDate.toISOString(),
      durationMs,

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
        health: operatorResult.ok ? operatorResult.status?.health || "" : "critical",
        currentJobStatus: operatorResult.ok
          ? operatorResult.status?.currentJobStatus || ""
          : "error",
        message: summaryMessage,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
        startedAt: startedAtDate.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAtDate.getTime(),
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
          currentJobStatus: "error",
          message,
        },
      },
      { status: 500 }
    );
  }
}