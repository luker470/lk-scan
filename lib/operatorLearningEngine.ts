import type { Firestore } from "firebase-admin/firestore";
import { readOperatorMemory, listOperatorMemoryEvents } from "./operatorMemory";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function buildLearningInsights(db: Firestore) {
  const [memory, recentEvents] = await Promise.all([
    readOperatorMemory(db),
    listOperatorMemoryEvents(db, 100).catch(() => []),
  ]);

  const successRate =
    memory.executionMemory.totalRuns > 0
      ? Math.round(
          (memory.executionMemory.successfulRuns /
            memory.executionMemory.totalRuns) *
            100
        )
      : 0;

  const recurringProblems = [...memory.recurringProblems]
    .sort((a, b) => safeNumber(b.count, 0) - safeNumber(a.count, 0))
    .slice(0, 10);

  const topSources = Object.values(memory.sourceMemory)
    .sort((a, b) => safeNumber(b.trustScore, 0) - safeNumber(a.trustScore, 0))
    .slice(0, 10);

  const weakSources = Object.values(memory.sourceMemory)
    .sort((a, b) => {
      const aScore =
        safeNumber(a.errorRate, 0) +
        safeNumber(a.recentFailures, 0) * 5 -
        safeNumber(a.successRate, 0) * 0.3;
      const bScore =
        safeNumber(b.errorRate, 0) +
        safeNumber(b.recentFailures, 0) * 5 -
        safeNumber(b.successRate, 0) * 0.3;
      return bScore - aScore;
    })
    .slice(0, 10);

  const failedEvents = recentEvents.filter((item: any) => !item?.success);
  const successfulEvents = recentEvents.filter((item: any) => !!item?.success);

  const mostCommonRecentFailures = failedEvents.reduce<Record<string, number>>(
    (acc, item: any) => {
      const key = normalizeText(item?.type) || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {}
  );

  const commonFailures = Object.entries(mostCommonRecentFailures)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    updatedAt: new Date().toISOString(),
    successRate,
    totalRuns: memory.executionMemory.totalRuns,
    successfulRuns: memory.executionMemory.successfulRuns,
    failedRuns: memory.executionMemory.failedRuns,
    avgCycleDurationMs: memory.executionMemory.avgCycleDurationMs,
    recurringProblems,
    topSources,
    weakSources,
    commonFailures,
    recentEvents: recentEvents.slice(0, 20),
    recentSuccessCount: successfulEvents.length,
    recentFailureCount: failedEvents.length,
    autonomyMode: memory.autonomyMemory.mode,
    autonomyConfidence: memory.autonomyMemory.confidenceScore,
    counters: memory.counters,
  };
}