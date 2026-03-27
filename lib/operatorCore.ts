import type { Firestore } from "firebase-admin/firestore";
import { collectOperatorMetrics } from "@/lib/operatorMetrics";
import { buildOperatorLearning } from "@/lib/operatorLearning";
import {
  createOperatorReport,
  persistOperatorReport,
} from "@/lib/operatorReports";
import { createOperatorAlert } from "@/lib/operatorAlerts";
import {
  enqueueOperatorTask,
  getOperatorQueueStats,
  pullNextOperatorTask,
  finishOperatorTask,
  requeueOperatorTask,
  seedOperatorQueueFromMetrics,
  reclaimStaleOperatorTasks,
  listOperatorQueueItems,
} from "@/lib/operatorQueue";
import {
  runBasicRecovery,
  processRecoveryQueueTask,
  validateSingleChapter,
} from "@/lib/operatorRecovery";
import { syncSingleManga } from "@/lib/autoSync";
import { discoverAndAutoImportFromSource } from "@/lib/discoveryAutoImport";
import type { DiscoverySourceKey } from "@/lib/discovery";
import type {
  OperatorHealth,
  OperatorIncidentSeverity,
  OperatorIncidentType,
  OperatorJobStatus,
  OperatorLearningScore,
  OperatorMetrics,
} from "@/lib/operatorTypes";

type QueueProcessResult = {
  ok: boolean;
  processed: boolean;
  taskId?: string;
  taskType?: string;
  message?: string;
  result?: unknown;
};

function overallHealth(
  warningCount: number,
  criticalCount: number,
  brokenChapters: number
): OperatorHealth {
  if (criticalCount > 0 || brokenChapters > 30) return "critical";
  if (warningCount > 0 || brokenChapters > 0) return "warning";
  return "healthy";
}

function emptyMetrics(): OperatorMetrics {
  return {
    totalMangas: 0,
    totalChapters: 0,
    totalViews: 0,
    dayViews: 0,
    weekViews: 0,
    monthViews: 0,
    totalUsers: 0,
    totalFavorites: 0,
    totalFollowing: 0,
    totalHistoryEntries: 0,
    totalBrokenChapters: 0,
    autoSyncActive: 0,
    sourcesHealthy: 0,
    sourcesWarning: 0,
    sourcesCritical: 0,
    last24hImportedChapters: 0,
    last24hIncidents: 0,
  };
}

function safeLearning(
  learning: OperatorLearningScore[] | null | undefined
): OperatorLearningScore[] {
  return Array.isArray(learning) ? learning : [];
}

function autoImportNotHealthy(metrics: OperatorMetrics) {
  return (
    ((metrics.autoSyncActive ?? 0) > 0 &&
      (metrics.last24hImportedChapters ?? 0) === 0) ||
    (metrics.sourcesCritical ?? 0) > 0 ||
    (metrics.sourcesWarning ?? 0) > 1 ||
    (metrics.totalBrokenChapters ?? 0) > 0
  );
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
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

async function hasRecentOpenIncident(
  db: Firestore,
  title: string,
  type: OperatorIncidentType
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
  db: Firestore,
  title: string,
  type: OperatorIncidentType,
  severity: OperatorIncidentSeverity,
  meta?: Record<string, unknown>
) {
  const alreadyExists = await hasRecentOpenIncident(db, title, type);

  if (alreadyExists) {
    return { created: false as const };
  }

  const ref = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .add({
      title,
      type,
      severity,
      meta: meta || {},
      resolved: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  await createOperatorAlert(db, title, severity, meta);

  return {
    created: true as const,
    id: ref.id,
  };
}

async function resolveOpenIncidents(
  db: Firestore,
  filters: {
    type?: OperatorIncidentType;
    title?: string;
  },
  resolutionNote: string
) {
  let query = db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .where("resolved", "==", false);

  if (filters.type) query = query.where("type", "==", filters.type);
  if (filters.title) query = query.where("title", "==", filters.title);

  const snap = await query.get().catch(() => null);

  if (!snap || snap.empty) return 0;

  const batch = db.batch();
  const now = new Date();

  for (const doc of snap.docs) {
    batch.set(
      doc.ref,
      {
        resolved: true,
        resolvedAt: now,
        resolutionNote,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
  return snap.size;
}

async function createAction(
  db: Firestore,
  type: string,
  status: string,
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

async function scanBrokenChapters(db: Firestore) {
  const mangasSnap = await db.collection("mangas").get().catch(() => null);
  if (!mangasSnap) return [];

  const broken: Array<{
    mangaId: string;
    chapterId: string;
    title: string;
    pagesCount: number;
    sourceUrl?: string;
  }> = [];

  for (const mangaDoc of mangasSnap.docs) {
    const chaptersSnap = await mangaDoc.ref
      .collection("chapters")
      .get()
      .catch(() => null);

    if (!chaptersSnap) continue;

    for (const chapterDoc of chaptersSnap.docs) {
      const chapter = chapterDoc.data() || {};
      const pagesCount = Number(chapter.pagesCount ?? chapter.pageCount ?? 0);

      if (!Number.isFinite(pagesCount) || pagesCount <= 0) {
        broken.push({
          mangaId: mangaDoc.id,
          chapterId: chapterDoc.id,
          title: String(
            chapter.title || `Capítulo ${chapter.number || chapterDoc.id}`
          ),
          pagesCount: 0,
          sourceUrl: String(
            chapter.sourceUrl ||
              chapter.chapterUrl ||
              chapter.url ||
              chapter.originUrl ||
              ""
          ),
        });
      }
    }
  }

  return broken;
}

async function readOperatorState(db: Firestore) {
  const operatorDoc = await db
    .collection("system")
    .doc("operator")
    .get()
    .catch(() => null);

  return operatorDoc?.data() || {};
}

async function readLatestReports(db: Firestore, limit = 5) {
  const snap = await db
    .collection("system")
    .doc("reports")
    .collection("items")
    .orderBy("generatedAt", "desc")
    .limit(limit)
    .get()
    .catch(() => null);

  return (
    snap?.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    })) || []
  );
}

async function readLatestIncidents(db: Firestore, limit = 8) {
  const snap = await db
    .collection("system")
    .doc("incidents")
    .collection("items")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get()
    .catch(() => null);

  return (
    snap?.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    })) || []
  );
}

async function readLatestActions(db: Firestore, limit = 8) {
  const snap = await db
    .collection("system")
    .doc("actions")
    .collection("items")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get()
    .catch(() => null);

  return (
    snap?.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    })) || []
  );
}

async function evaluateAutomationPipelines(
  db: Firestore,
  metrics: OperatorMetrics
) {
  const importTitle =
    "Importação automática sem novos capítulos nas últimas 24 horas.";
  const sourceTitle =
    "Fontes críticas estão afetando a descoberta/importação automática.";
  const parserTitle =
    "O parser/identificação automática ainda não está 100% confiável.";

  if (metrics.autoSyncActive > 0 && metrics.last24hImportedChapters === 0) {
    await createIncident(db, importTitle, "sync", "high", {
      autoSyncActive: metrics.autoSyncActive,
      last24hImportedChapters: metrics.last24hImportedChapters,
    });

    await createAction(
      db,
      "automation-import-health",
      "warning",
      "A automação de importação está ativa, mas não trouxe capítulos nas últimas 24 horas.",
      {
        autoSyncActive: metrics.autoSyncActive,
      }
    );

    await enqueueOperatorTask(db, {
      type: "operator-maintenance",
      priority: "high",
      title: "Investigar automação sem progresso",
      description:
        "Auto sync ativo sem novos capítulos importados nas últimas 24h.",
      dedupeKey: "automation::stalled-import",
      maxAttempts: 3,
      meta: {
        autoSyncActive: metrics.autoSyncActive,
        last24hImportedChapters: metrics.last24hImportedChapters,
      },
    });
  } else {
    await resolveOpenIncidents(
      db,
      { type: "sync", title: importTitle },
      "Resolvido automaticamente: a importação automática voltou a produzir capítulos."
    );
  }

  if (metrics.sourcesCritical > 0) {
    await createIncident(db, sourceTitle, "source", "high", {
      sourcesCritical: metrics.sourcesCritical,
      sourcesWarning: metrics.sourcesWarning,
    });

    await enqueueOperatorTask(db, {
      type: "source-health-check",
      priority: "critical",
      title: "Revalidar fontes críticas",
      description:
        "Executar revisão automática das fontes com estado crítico.",
      dedupeKey: "source::critical-health-check",
      maxAttempts: 3,
      meta: {
        sourcesCritical: metrics.sourcesCritical,
        sourcesWarning: metrics.sourcesWarning,
      },
    });
  } else {
    await resolveOpenIncidents(
      db,
      { type: "source", title: sourceTitle },
      "Resolvido automaticamente: não há mais fontes críticas afetando a automação."
    );
  }

  if (autoImportNotHealthy(metrics)) {
    await createIncident(db, parserTitle, "parser", "warning", {
      totalBrokenChapters: metrics.totalBrokenChapters,
      sourcesCritical: metrics.sourcesCritical,
      sourcesWarning: metrics.sourcesWarning,
      autoSyncActive: metrics.autoSyncActive,
      last24hImportedChapters: metrics.last24hImportedChapters,
    });
  } else {
    await resolveOpenIncidents(
      db,
      { type: "parser", title: parserTitle },
      "Resolvido automaticamente: o pipeline de identificação/importação voltou a um estado estável."
    );
  }
}

async function enqueueBrokenChapterTasks(
  db: Firestore,
  brokenChapters: Array<{
    mangaId: string;
    chapterId: string;
    title: string;
    pagesCount: number;
    sourceUrl?: string;
  }>
) {
  let createdCount = 0;

  for (const chapter of brokenChapters.slice(0, 50)) {
    const result = await enqueueOperatorTask(db, {
      type: "recovery-chapter",
      priority: "high",
      title: `Recovery do capítulo ${chapter.title}`,
      description:
        "Capítulo identificado com páginas zeradas ou suspeitas.",
      mangaId: chapter.mangaId,
      chapterId: chapter.chapterId,
      sourceUrl: chapter.sourceUrl || "",
      maxAttempts: 5,
      meta: {
        pagesCount: chapter.pagesCount,
      },
    });

    if (result.created) createdCount += 1;
  }

  return createdCount;
}

async function processDiscoverSourceTask(db: Firestore, task: any) {
  const source = normalizeText(task?.source) as DiscoverySourceKey;

  if (!source) {
    await finishOperatorTask(db, task.id, {
      status: "error",
      lastError: "Task discover-source sem source válido.",
      resultSummary: "Task inválida.",
    });

    return {
      ok: false,
      message: "Task discover-source inválida.",
    };
  }

  const result = await discoverAndAutoImportFromSource(db, source, {
    maxChapters: 20,
    overwrite: false,
  });

  await finishOperatorTask(db, task.id, {
    status: result.ok ? "success" : "warning",
    resultSummary: result.ok
      ? "Descoberta/importação automática executada com sucesso."
      : "Descoberta/importação executada com alertas.",
    lastError: result.ok ? "" : `${result.errorCount || 0} item(ns) com falha.`,
    metaPatch: {
      result: serializeValue(result),
    },
  });

  return {
    ok: result.ok,
    result,
    message: result.ok
      ? "Descoberta/importação concluída."
      : "Descoberta/importação com alertas.",
  };
}

async function processSyncMangaTask(db: Firestore, task: any) {
  const mangaId = normalizeText(task?.mangaId);

  if (!mangaId) {
    await finishOperatorTask(db, task.id, {
      status: "error",
      lastError: "Task sync-manga sem mangaId.",
      resultSummary: "Task inválida.",
    });

    return {
      ok: false,
      message: "Task sync-manga inválida.",
    };
  }

  const result = await syncSingleManga(db, mangaId, {
    maxChapters: 30,
    overwrite: false,
  });

  await finishOperatorTask(db, task.id, {
    status: result.ok ? "success" : "warning",
    resultSummary: result.ok
      ? "Sync automático concluído."
      : "Sync executado com falha.",
    lastError: result.error || "",
    metaPatch: {
      result: serializeValue(result),
    },
  });

  return {
    ok: result.ok,
    result,
    message: result.ok ? "Sync concluído." : result.error || "Sync com alerta.",
  };
}

async function processValidateMangaTask(db: Firestore, task: any) {
  const mangaId = normalizeText(task?.mangaId);

  if (!mangaId) {
    await finishOperatorTask(db, task.id, {
      status: "error",
      lastError: "Task validate-manga sem mangaId.",
      resultSummary: "Task inválida.",
    });

    return {
      ok: false,
      message: "Task validate-manga inválida.",
    };
  }

  const result = await syncSingleManga(db, mangaId, {
    maxChapters: 15,
    overwrite: true,
  });

  await finishOperatorTask(db, task.id, {
    status: result.ok ? "success" : "warning",
    resultSummary: result.ok
      ? "Validação do mangá concluída."
      : "Validação executada com alertas.",
    lastError: result.error || "",
    metaPatch: {
      result: serializeValue(result),
      validated: true,
    },
  });

  return {
    ok: result.ok,
    result,
    message: result.ok
      ? "Validação do mangá concluída."
      : result.error || "Validação com alerta.",
  };
}

async function processValidateChapterTask(db: Firestore, task: any) {
  const mangaId = normalizeText(task?.mangaId);
  const chapterId = normalizeText(task?.chapterId);

  if (!mangaId || !chapterId) {
    await finishOperatorTask(db, task.id, {
      status: "error",
      lastError: "Task validate-chapter sem mangaId/chapterId.",
      resultSummary: "Task inválida.",
    });

    return {
      ok: false,
      message: "Task validate-chapter inválida.",
    };
  }

  const result = await validateSingleChapter(db, mangaId, chapterId);

  await finishOperatorTask(db, task.id, {
    status: result.ok ? "success" : "warning",
    resultSummary: result.ok
      ? "Validação do capítulo concluída."
      : "Validação do capítulo encontrou problema.",
    lastError: result.reason || "",
    metaPatch: {
      result: serializeValue(result),
      mangaId,
      chapterId,
    },
  });

  return {
    ok: result.ok,
    result,
    message: result.ok
      ? "Capítulo validado."
      : result.reason || "Capítulo inválido.",
  };
}

async function processReimportChapterTask(db: Firestore, task: any) {
  const mangaId = normalizeText(task?.mangaId);
  const chapterId = normalizeText(task?.chapterId);

  if (!mangaId) {
    await finishOperatorTask(db, task.id, {
      status: "error",
      lastError: "Task reimport-chapter sem mangaId.",
      resultSummary: "Task inválida.",
    });

    return {
      ok: false,
      message: "Task reimport-chapter inválida.",
    };
  }

  const result = await syncSingleManga(db, mangaId, {
    maxChapters: 10,
    overwrite: true,
  });

  if (chapterId) {
    await enqueueOperatorTask(db, {
      type: "validate-chapter",
      priority: "normal",
      mangaId,
      chapterId,
      sourceUrl: normalizeText(task?.sourceUrl),
      title: `Validar capítulo ${chapterId} após reimportação`,
      dedupeKey: `post-reimport-validate::${mangaId}::${chapterId}`,
      maxAttempts: 3,
      meta: {
        fromTaskId: task.id,
      },
    });
  }

  await finishOperatorTask(db, task.id, {
    status: result.ok ? "success" : "warning",
    resultSummary: result.ok
      ? "Reimportação indireta via sync do mangá concluída."
      : "Reimportação indireta executada com alerta.",
    lastError: result.error || "",
    metaPatch: {
      result: serializeValue(result),
      chapterId,
    },
  });

  return {
    ok: result.ok,
    result,
    message: result.ok
      ? "Reimportação concluída."
      : result.error || "Reimportação com alerta.",
  };
}

async function processSourceHealthTask(db: Firestore, task: any) {
  const result = await buildOperatorLearning(db);

  await finishOperatorTask(db, task.id, {
    status: "success",
    resultSummary: "Saúde das fontes recalculada com sucesso.",
    metaPatch: {
      topHosts: result.slice(0, 5).map((item) => ({
        host: item.host,
        score: item.score,
        health: item.health,
      })),
    },
  });

  return {
    ok: true,
    result,
    message: "Saúde das fontes recalculada.",
  };
}

async function processMaintenanceTask(db: Firestore, task: any) {
  const recovery = await runBasicRecovery(db);

  await finishOperatorTask(db, task.id, {
    status: recovery.ok ? "success" : "warning",
    resultSummary: recovery.ok
      ? "Manutenção automática concluída."
      : "Manutenção executada com alertas.",
    lastError:
      recovery.failed > 0
        ? `${recovery.failed} recovery(s) falharam.`
        : "",
    metaPatch: {
      recovery: serializeValue(recovery),
    },
  });

  return {
    ok: recovery.ok,
    result: recovery,
    message: recovery.ok ? "Manutenção concluída." : "Manutenção com alertas.",
  };
}

async function processSingleQueueTask(
  db: Firestore
): Promise<QueueProcessResult> {
  const task = await pullNextOperatorTask(db, "operator-core", 10);

  if (!task) {
    return {
      ok: true,
      processed: false,
      message: "Nenhuma task pendente na fila.",
    };
  }

  try {
    if (task.type === "recovery-chapter") {
      const result = await processRecoveryQueueTask(db, {
        id: task.id!,
        mangaId: task.mangaId,
        chapterId: task.chapterId,
        sourceUrl: task.sourceUrl,
      });

      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    if (task.type === "reimport-chapter") {
      const result = await processReimportChapterTask(db, task);
      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    if (task.type === "sync-manga") {
      const result = await processSyncMangaTask(db, task);
      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    if (task.type === "discover-source") {
      const result = await processDiscoverSourceTask(db, task);
      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    if (task.type === "validate-manga") {
      const result = await processValidateMangaTask(db, task);
      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    if (task.type === "validate-chapter") {
      const result = await processValidateChapterTask(db, task);
      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    if (task.type === "source-health-check") {
      const result = await processSourceHealthTask(db, task);
      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    if (task.type === "operator-maintenance") {
      const result = await processMaintenanceTask(db, task);
      return {
        ok: !!result?.ok,
        processed: true,
        taskId: task.id,
        taskType: task.type,
        message: result?.message || "",
        result,
      };
    }

    await finishOperatorTask(db, task.id!, {
      status: "canceled",
      resultSummary: "Tipo de task ainda não suportado pelo núcleo atual.",
    });

    return {
      ok: false,
      processed: true,
      taskId: task.id,
      taskType: task.type,
      message: "Task cancelada: tipo não suportado.",
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao processar task da fila.";

    if ((task.attempts || 1) < (task.maxAttempts || 3)) {
      await requeueOperatorTask(db, task.id!, {
        delayMinutes: 10,
        priority: task.priority,
        reason: message,
      });
    } else {
      await finishOperatorTask(db, task.id!, {
        status: "error",
        lastError: message,
        resultSummary: "Task falhou após atingir o limite de tentativas.",
      });
    }

    return {
      ok: false,
      processed: true,
      taskId: task.id,
      taskType: task.type,
      message,
    };
  }
}

async function processQueueBatch(
  db: Firestore,
  maxTasks = 3
): Promise<QueueProcessResult[]> {
  const results: QueueProcessResult[] = [];

  for (let i = 0; i < Math.max(1, maxTasks); i += 1) {
    const result = await processSingleQueueTask(db);
    results.push(result);

    if (!result.processed) {
      break;
    }
  }

  return results;
}

export async function buildOperatorStatus(db: Firestore) {
  try {
    const [
      metricsResult,
      learningResult,
      operatorState,
      latestIncidents,
      latestActions,
      latestReports,
      queueStats,
      queuePreview,
    ] = await Promise.all([
      collectOperatorMetrics(db).catch(() => emptyMetrics()),
      buildOperatorLearning(db).catch(() => []),
      readOperatorState(db),
      readLatestIncidents(db, 8),
      readLatestActions(db, 8),
      readLatestReports(db, 5),
      getOperatorQueueStats(db).catch(() => ({
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        warning: 0,
        error: 0,
        critical: 0,
        high: 0,
      })),
      listOperatorQueueItems(db, { status: "queued", limit: 8 }).catch(
        () => []
      ),
    ]);

    const metrics = metricsResult || emptyMetrics();
    const learning = safeLearning(learningResult);

    const health = overallHealth(
      metrics.sourcesWarning,
      metrics.sourcesCritical,
      metrics.totalBrokenChapters
    );

    const unresolvedIncidents = latestIncidents.filter(
      (item) => !item.resolved
    ).length;

    return {
      ok: true as const,
      generatedAt: new Date().toISOString(),
      health,
      currentJobStatus: (operatorState.currentJobStatus ||
        "idle") as OperatorJobStatus,
      metrics,
      learning,
      latestIncidents: serializeValue(latestIncidents),
      latestActions: serializeValue(latestActions),
      latestReports: serializeValue(latestReports),
      queue: queueStats,
      queuePreview: serializeValue(queuePreview),
      center: {
        summary: {
          totalMangas: metrics.totalMangas,
          totalChapters: metrics.totalChapters,
          totalViews: metrics.totalViews,
          dayViews: metrics.dayViews,
          weekViews: metrics.weekViews,
          monthViews: metrics.monthViews,
          totalBrokenChapters: metrics.totalBrokenChapters,
          totalUsers: metrics.totalUsers,
          totalFavorites: metrics.totalFavorites,
          totalFollowing: metrics.totalFollowing,
          totalHistoryEntries: metrics.totalHistoryEntries,
          autoSyncActive: metrics.autoSyncActive,
          last24hImportedChapters: metrics.last24hImportedChapters,
          last24hIncidents: metrics.last24hIncidents,
          unresolvedIncidents,
          automationNot100: autoImportNotHealthy(metrics),
        },
        operator: {
          health,
          currentJobStatus: operatorState.currentJobStatus || "idle",
          lastRunStartedAt: serializeValue(operatorState.lastRunStartedAt || null),
          lastRunFinishedAt: serializeValue(
            operatorState.lastRunFinishedAt || null
          ),
          lastRunError: operatorState.lastRunError || "",
          lastRunReportSummary: operatorState.lastRunReportSummary || "",
          lastBrokenChaptersCount: operatorState.lastBrokenChaptersCount || 0,
          lastReportId: operatorState.lastReportId || "",
        },
      },
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro ao montar status do operador.";

    const metrics = emptyMetrics();

    return {
      ok: false as const,
      generatedAt: new Date().toISOString(),
      health: "critical" as OperatorHealth,
      currentJobStatus: "error" as OperatorJobStatus,
      error: message,
      metrics,
      learning: [] as OperatorLearningScore[],
      latestIncidents: [],
      latestActions: [],
      latestReports: [],
      queue: {
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        warning: 0,
        error: 0,
        critical: 0,
        high: 0,
      },
      queuePreview: [],
      center: {
        summary: {
          totalMangas: metrics.totalMangas,
          totalChapters: metrics.totalChapters,
          totalViews: metrics.totalViews,
          dayViews: metrics.dayViews,
          weekViews: metrics.weekViews,
          monthViews: metrics.monthViews,
          totalBrokenChapters: metrics.totalBrokenChapters,
          totalUsers: metrics.totalUsers,
          totalFavorites: metrics.totalFavorites,
          totalFollowing: metrics.totalFollowing,
          totalHistoryEntries: metrics.totalHistoryEntries,
          autoSyncActive: metrics.autoSyncActive,
          last24hImportedChapters: metrics.last24hImportedChapters,
          last24hIncidents: metrics.last24hIncidents,
          unresolvedIncidents: 0,
          automationNot100: autoImportNotHealthy(metrics),
        },
        operator: {
          health: "critical",
          currentJobStatus: "error",
          lastRunStartedAt: null,
          lastRunFinishedAt: null,
          lastRunError: message,
          lastRunReportSummary: "",
          lastBrokenChaptersCount: 0,
          lastReportId: "",
        },
      },
    };
  }
}

export async function runOperatorCycle(db: Firestore) {
  try {
    const startedAt = new Date();

    await db.collection("system").doc("operator").set(
      {
        currentJobStatus: "running",
        lastRunStartedAt: startedAt,
        lastRunError: "",
        updatedAt: startedAt,
      },
      { merge: true }
    );

    const reclaimed = await reclaimStaleOperatorTasks(db).catch(() => ({
      ok: false,
      reclaimed: 0,
      ids: [],
    }));

    const brokenChapters = await scanBrokenChapters(db);
    const createdTasks = await enqueueBrokenChapterTasks(db, brokenChapters);

    if (brokenChapters.length > 0) {
      await createIncident(
        db,
        `${brokenChapters.length} capítulos problemáticos foram detectados pelo operador.`,
        "chapter",
        brokenChapters.length > 20 ? "high" : "warning",
        {
          count: brokenChapters.length,
          queuedRecoveries: createdTasks,
        }
      );
    } else {
      await resolveOpenIncidents(
        db,
        { type: "chapter" },
        "Resolvido automaticamente: o ciclo atual não encontrou capítulos quebrados."
      );

      await createAction(
        db,
        "chapter-quality-scan",
        "success",
        "Nenhum capítulo quebrado foi detectado no ciclo atual."
      );
    }

    const metricsBeforeQueue = await collectOperatorMetrics(db).catch(() =>
      emptyMetrics()
    );

    await evaluateAutomationPipelines(db, metricsBeforeQueue);
    await seedOperatorQueueFromMetrics(db, metricsBeforeQueue);

    const queueRun = await processQueueBatch(db, 3);

    const refreshedStatus = await buildOperatorStatus(db);

    const report = createOperatorReport(
      refreshedStatus.metrics,
      refreshedStatus.learning
    );
    const persistedReport = await persistOperatorReport(db, report);

    await db.collection("system").doc("operator").set(
      {
        currentJobStatus: "success",
        health: refreshedStatus.health,
        lastRunFinishedAt: new Date(),
        lastRunReportSummary: report.summary,
        lastBrokenChaptersCount: brokenChapters.length,
        lastReportId: persistedReport.id,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await createAction(
      db,
      "operator-cycle",
      "success",
      "Ciclo principal do LK AI Operator executado com sucesso.",
      {
        health: refreshedStatus.health,
        totalMangas: refreshedStatus.metrics.totalMangas,
        totalBrokenChapters: refreshedStatus.metrics.totalBrokenChapters,
        totalUsers: refreshedStatus.metrics.totalUsers,
        totalViews: refreshedStatus.metrics.totalViews,
        reportId: persistedReport.id,
        automationNot100: autoImportNotHealthy(refreshedStatus.metrics),
        queueRun: serializeValue(queueRun),
        queueStats: serializeValue(refreshedStatus.queue),
        reclaimedLocks: reclaimed.reclaimed || 0,
      }
    );

    return {
      ok: true,
      status: refreshedStatus,
      report,
      reportId: persistedReport.id,
      queueRun,
      reclaimed,
    };
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro no ciclo do operador.";

    await db.collection("system").doc("operator").set(
      {
        currentJobStatus: "error",
        lastRunFinishedAt: new Date(),
        lastRunError: message,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await createIncident(db, message, "operator", "high");
    await createAction(db, "operator-cycle", "error", message);

    return {
      ok: false,
      error: message,
    };
  }
}