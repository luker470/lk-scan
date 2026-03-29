import type { Firestore } from "firebase-admin/firestore";

export type OperatorMemoryHealth = "healthy" | "warning" | "critical";
export type OperatorAutonomyMode =
  | "observation"
  | "maintenance"
  | "stabilization"
  | "growth"
  | "sovereign";

export type OperatorRecurringProblem = {
  key: string;
  title: string;
  type:
    | "chapter"
    | "source"
    | "parser"
    | "sync"
    | "comment"
    | "queue"
    | "operator"
    | "generic";
  count: number;
  firstSeenAt?: string;
  lastSeenAt?: string;
  severity?: "info" | "warning" | "high" | "critical";
  meta?: Record<string, unknown>;
};

export type OperatorSourceMemory = {
  host: string;
  successRate: number;
  errorRate: number;
  avgLatencyMs: number;
  totalSuccess: number;
  totalFailure: number;
  recentFailures: number;
  recentSuccesses: number;
  recommendedPriority: number;
  health: OperatorMemoryHealth;
  trustScore: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  updatedAt?: string;
};

export type OperatorApprovalMemory = {
  approved: number;
  rejected: number;
  lastApprovedAt?: string;
  lastRejectedAt?: string;
  lastApprovedTitle?: string;
  lastRejectedTitle?: string;
};

export type OperatorBehaviorMemory = {
  bestRecoveryFlow?: string;
  bestSyncWindow?: string;
  preferredFocus?: string;
  lastGlobalAssessment?: string;
  lastGlobalHealth?: OperatorMemoryHealth;
  lastGlobalAssessmentAt?: string;
  lastPrimaryGoal?: string;
  lastKnownMode?: OperatorAutonomyMode | string;
};

export type OperatorExecutionMemory = {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalRecoveredChapters: number;
  totalFailedRecoveries: number;
  totalQueueProcessed: number;
  avgCycleDurationMs: number;
  lastSuccessfulRunAt?: string;
  lastFailedRunAt?: string;
  lastRunDurationMs?: number;
};

export type OperatorProposalMemory = {
  totalGenerated: number;
  totalApproved: number;
  totalRejected: number;
  totalApplied: number;
  lastGeneratedAt?: string;
  lastAppliedAt?: string;
};

export type OperatorAutonomyMemory = {
  mode: OperatorAutonomyMode | string;
  confidenceScore: number;
  lastDecisionAt?: string;
  lastDecisionSummary?: string;
  canSafelyEscalate: boolean;
};

export type OperatorCountersMemory = {
  totalIncidentsSeen: number;
  totalCommentsProcessed: number;
  totalIdeasGenerated: number;
  totalKnowledgeItemsLearned: number;
  totalSourcesTracked: number;
  totalMemoryEvents: number;
};

export type OperatorMemoryEvent = {
  id?: string;
  type: string;
  success: boolean;
  impactScore: number;
  title?: string;
  summary?: string;
  context?: Record<string, unknown>;
  createdAt?: string;
};

export type OperatorMemorySnapshot = {
  updatedAt: string;
  recurringProblems: OperatorRecurringProblem[];
  sourceMemory: Record<string, OperatorSourceMemory>;
  approvalMemory: OperatorApprovalMemory;
  behaviorMemory: OperatorBehaviorMemory;
  executionMemory: OperatorExecutionMemory;
  proposalMemory: OperatorProposalMemory;
  autonomyMemory: OperatorAutonomyMemory;
  counters: OperatorCountersMemory;
};

type StoreOperatorMemoryInput = {
  type: string;
  success: boolean;
  impactScore?: number;
  title?: string;
  summary?: string;
  context?: Record<string, unknown>;
};

const DEFAULT_MEMORY: OperatorMemorySnapshot = {
  updatedAt: new Date(0).toISOString(),
  recurringProblems: [],
  sourceMemory: {},
  approvalMemory: {
    approved: 0,
    rejected: 0,
  },
  behaviorMemory: {},
  executionMemory: {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    totalRecoveredChapters: 0,
    totalFailedRecoveries: 0,
    totalQueueProcessed: 0,
    avgCycleDurationMs: 0,
  },
  proposalMemory: {
    totalGenerated: 0,
    totalApproved: 0,
    totalRejected: 0,
    totalApplied: 0,
  },
  autonomyMemory: {
    mode: "observation",
    confidenceScore: 0,
    canSafelyEscalate: false,
  },
  counters: {
    totalIncidentsSeen: 0,
    totalCommentsProcessed: 0,
    totalIdeasGenerated: 0,
    totalKnowledgeItemsLearned: 0,
    totalSourcesTracked: 0,
    totalMemoryEvents: 0,
  },
};

const MAX_RECURRING_PROBLEMS = 120;
const MAX_SOURCE_MEMORY_ITEMS = 150;
const MAX_EVENT_LIST_LIMIT = 200;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHealth(value: unknown): OperatorMemoryHealth {
  const v = normalizeText(value).toLowerCase();
  if (v === "critical") return "critical";
  if (v === "warning") return "warning";
  return "healthy";
}

function normalizeSeverity(
  value: unknown
): "info" | "warning" | "high" | "critical" {
  const v = normalizeText(value).toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high") return "high";
  if (v === "warning") return "warning";
  return "info";
}

function normalizeAutonomyMode(value: unknown): OperatorAutonomyMode {
  const v = normalizeText(value).toLowerCase();
  if (
    v === "observation" ||
    v === "maintenance" ||
    v === "stabilization" ||
    v === "growth" ||
    v === "sovereign"
  ) {
    return v;
  }
  return "observation";
}

function normalizeRecurringProblemType(
  value: unknown
): OperatorRecurringProblem["type"] {
  const v = normalizeText(value).toLowerCase();
  if (
    v === "chapter" ||
    v === "source" ||
    v === "parser" ||
    v === "sync" ||
    v === "comment" ||
    v === "queue" ||
    v === "operator" ||
    v === "generic"
  ) {
    return v;
  }
  return "generic";
}

function toIso(value: any, fallback?: string) {
  if (!value) return fallback || undefined;
  if (value instanceof Date) return value.toISOString();

  if (typeof value?.toDate === "function") {
    try {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime())
        ? d.toISOString()
        : fallback || undefined;
    } catch {
      return fallback || undefined;
    }
  }

  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback || undefined : d.toISOString();
  }

  if (typeof value?._seconds === "number") {
    const d = new Date(value._seconds * 1000);
    return Number.isNaN(d.getTime()) ? fallback || undefined : d.toISOString();
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? fallback || undefined : parsed.toISOString();
}

function toDateMs(value: unknown) {
  const iso = toIso(value);
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function ageHours(value: unknown) {
  const ms = toDateMs(value);
  if (!ms) return 999999;
  return Math.max(0, (Date.now() - ms) / 3_600_000);
}

function ageDays(value: unknown) {
  return ageHours(value) / 24;
}

function computeRecencyWeight(value: unknown) {
  const hours = ageHours(value);

  if (hours <= 24) return 1;
  if (hours <= 72) return 0.8;
  if (hours <= 168) return 0.55;
  if (hours <= 720) return 0.3;
  return 0.12;
}

function severityWeight(severity: unknown) {
  const value = normalizeSeverity(severity);
  if (value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "warning") return 2;
  return 1;
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
      if (typeof val === "function") continue;
      out[key] = serializeValue(val);
    }
    return out;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value);
}

function sanitizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return serializeValue(value) as Record<string, unknown>;
}

function memoryDoc(db: Firestore) {
  return db.collection("system").doc("operatorMemory");
}

function memoryEventsCollection(db: Firestore) {
  return memoryDoc(db).collection("events");
}

async function ensureMemoryRoot(db: Firestore) {
  const snap = await memoryDoc(db).get().catch(() => null);

  if (!snap?.exists) {
    await memoryDoc(db).set(
      {
        ...DEFAULT_MEMORY,
        initialized: true,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    return;
  }

  await memoryDoc(db).set(
    {
      initialized: true,
      updatedAt: nowIso(),
    },
    { merge: true }
  );
}

function getTrustScore(input: {
  successRate: number;
  errorRate: number;
  recentFailures: number;
  recommendedPriority: number;
  avgLatencyMs?: number;
  lastSuccessAt?: unknown;
  lastFailureAt?: unknown;
}) {
  const latencyPenalty =
    safeNumber(input.avgLatencyMs, 0) > 3000
      ? 10
      : safeNumber(input.avgLatencyMs, 0) > 1500
      ? 4
      : 0;

  const recentSuccessBonus =
    ageDays(input.lastSuccessAt) <= 3 ? 4 : ageDays(input.lastSuccessAt) <= 7 ? 2 : 0;

  const recentFailurePenalty =
    ageDays(input.lastFailureAt) <= 1
      ? 8
      : ageDays(input.lastFailureAt) <= 3
      ? 5
      : ageDays(input.lastFailureAt) <= 7
      ? 2
      : 0;

  const base =
    safeNumber(input.successRate, 0) -
    safeNumber(input.errorRate, 0) * 0.7 -
    safeNumber(input.recentFailures, 0) * 3 -
    latencyPenalty -
    recentFailurePenalty +
    recentSuccessBonus +
    safeNumber(input.recommendedPriority, 0) * 0.2;

  return clamp(Math.round(base), 0, 100);
}

function recurringProblemRank(item: OperatorRecurringProblem) {
  const count = safeNumber(item.count, 0);
  const sev = severityWeight(item.severity);
  const recency = computeRecencyWeight(item.lastSeenAt);
  return sev * 20 + count * 2 + recency * 10;
}

function pruneRecurringProblems(
  recurringProblems: OperatorRecurringProblem[]
): OperatorRecurringProblem[] {
  return [...recurringProblems]
    .filter((item) => !!normalizeText(item.key) && !!normalizeText(item.title))
    .sort((a, b) => recurringProblemRank(b) - recurringProblemRank(a))
    .slice(0, MAX_RECURRING_PROBLEMS);
}

function sourceMemoryRank(item: OperatorSourceMemory) {
  const trust = safeNumber(item.trustScore, 0);
  const success = safeNumber(item.totalSuccess, 0);
  const failure = safeNumber(item.totalFailure, 0);
  const recentPenalty =
    safeNumber(item.recentFailures, 0) * 4 +
    (ageDays(item.lastFailureAt) <= 3 ? 12 : 0);
  const freshnessBonus = ageDays(item.updatedAt) <= 7 ? 4 : 0;

  return trust + success - failure - recentPenalty + freshnessBonus;
}

function pruneSourceMemory(
  sourceMemory: Record<string, OperatorSourceMemory>
): Record<string, OperatorSourceMemory> {
  const sorted = Object.values(sourceMemory)
    .filter((item) => !!normalizeText(item.host))
    .sort((a, b) => sourceMemoryRank(b) - sourceMemoryRank(a))
    .slice(0, MAX_SOURCE_MEMORY_ITEMS);

  return Object.fromEntries(sorted.map((item) => [item.host, item]));
}

function buildSystemMemoryHealth(memory: OperatorMemorySnapshot): OperatorMemoryHealth {
  const totalRuns = safeNumber(memory.executionMemory.totalRuns, 0);
  const successRate =
    totalRuns > 0
      ? memory.executionMemory.successfulRuns / totalRuns
      : 1;

  const criticalProblems = memory.recurringProblems.filter(
    (item) => item.severity === "critical"
  ).length;
  const highProblems = memory.recurringProblems.filter(
    (item) => item.severity === "high"
  ).length;
  const recentHighProblems = memory.recurringProblems.filter(
    (item) =>
      (item.severity === "high" || item.severity === "critical") &&
      ageDays(item.lastSeenAt) <= 7
  ).length;
  const riskySources = Object.values(memory.sourceMemory).filter(
    (item) => item.health === "critical" || item.recentFailures >= 4
  ).length;
  const warningSources = Object.values(memory.sourceMemory).filter(
    (item) => item.health === "warning"
  ).length;
  const freshRiskySources = Object.values(memory.sourceMemory).filter(
    (item) =>
      (item.health === "critical" || item.recentFailures >= 3) &&
      (ageDays(item.updatedAt) <= 3 || ageDays(item.lastFailureAt) <= 3)
  ).length;

  if (
    criticalProblems > 0 ||
    recentHighProblems >= 4 ||
    successRate < 0.5 ||
    riskySources >= 3 ||
    freshRiskySources >= 2
  ) {
    return "critical";
  }

  if (
    highProblems > 0 ||
    successRate < 0.8 ||
    riskySources > 0 ||
    warningSources >= 3
  ) {
    return "warning";
  }

  return "healthy";
}

function detectRecurringProblemTypeFromEvent(type: string): OperatorRecurringProblem["type"] {
  const t = normalizeText(type).toLowerCase();

  if (t.includes("chapter") || t.includes("recovery") || t.includes("validate-chapter")) {
    return "chapter";
  }
  if (t.includes("source")) return "source";
  if (t.includes("parser")) return "parser";
  if (t.includes("sync")) return "sync";
  if (t.includes("comment")) return "comment";
  if (t.includes("queue")) return "queue";
  if (t.includes("operator") || t.includes("autonomy") || t.includes("report")) {
    return "operator";
  }

  return "generic";
}

function shouldTrackAsRecurringFailure(type: string) {
  const t = normalizeText(type).toLowerCase();

  return (
    t.includes("recovery") ||
    t.includes("reimport") ||
    t.includes("sync") ||
    t.includes("validate") ||
    t.includes("parser") ||
    t.includes("queue") ||
    t.includes("source") ||
    t.includes("operator") ||
    t.includes("chat-error") ||
    t.includes("manual-run") ||
    t.includes("cron-run")
  );
}

export async function readOperatorMemory(
  db: Firestore
): Promise<OperatorMemorySnapshot> {
  await ensureMemoryRoot(db);

  const snap = await memoryDoc(db).get().catch(() => null);
  const data = snap?.data() || {};

  const recurringProblemsRaw = Array.isArray(data.recurringProblems)
    ? data.recurringProblems
    : [];

  const recurringProblems: OperatorRecurringProblem[] = recurringProblemsRaw
    .map((item: any) => ({
      key: normalizeText(item?.key),
      title: normalizeText(item?.title),
      type: normalizeRecurringProblemType(item?.type),
      count: Math.max(0, safeNumber(item?.count, 0)),
      firstSeenAt: toIso(item?.firstSeenAt),
      lastSeenAt: toIso(item?.lastSeenAt),
      severity: normalizeSeverity(item?.severity),
      meta: sanitizeObject(item?.meta),
    }))
    .filter((item) => !!item.key && !!item.title);

  const sourceMemoryRaw =
    data.sourceMemory && typeof data.sourceMemory === "object"
      ? data.sourceMemory
      : {};

  const sourceMemory: Record<string, OperatorSourceMemory> = {};

  for (const [host, value] of Object.entries(sourceMemoryRaw)) {
    const item = value as any;
    const safeHost = normalizeText(host || item?.host).toLowerCase();

    if (!safeHost) continue;

    const successRate = safeNumber(item?.successRate, 0);
    const errorRate = safeNumber(item?.errorRate, 0);
    const recentFailures = safeNumber(item?.recentFailures, 0);
    const recommendedPriority = safeNumber(item?.recommendedPriority, 0);
    const avgLatencyMs = safeNumber(item?.avgLatencyMs, 0);
    const lastSuccessAt = toIso(item?.lastSuccessAt);
    const lastFailureAt = toIso(item?.lastFailureAt);
    const updatedAt = toIso(item?.updatedAt);

    sourceMemory[safeHost] = {
      host: safeHost,
      successRate,
      errorRate,
      avgLatencyMs,
      totalSuccess: safeNumber(item?.totalSuccess, 0),
      totalFailure: safeNumber(item?.totalFailure, 0),
      recentFailures,
      recentSuccesses: safeNumber(item?.recentSuccesses, 0),
      recommendedPriority,
      health: normalizeHealth(item?.health),
      trustScore: safeNumber(
        item?.trustScore,
        getTrustScore({
          successRate,
          errorRate,
          recentFailures,
          recommendedPriority,
          avgLatencyMs,
          lastSuccessAt,
          lastFailureAt,
        })
      ),
      lastSuccessAt,
      lastFailureAt,
      updatedAt,
    };
  }

  const approvalMemoryRaw =
    data.approvalMemory && typeof data.approvalMemory === "object"
      ? data.approvalMemory
      : {};

  const behaviorMemoryRaw =
    data.behaviorMemory && typeof data.behaviorMemory === "object"
      ? data.behaviorMemory
      : {};

  const executionMemoryRaw =
    data.executionMemory && typeof data.executionMemory === "object"
      ? data.executionMemory
      : {};

  const proposalMemoryRaw =
    data.proposalMemory && typeof data.proposalMemory === "object"
      ? data.proposalMemory
      : {};

  const autonomyMemoryRaw =
    data.autonomyMemory && typeof data.autonomyMemory === "object"
      ? data.autonomyMemory
      : {};

  const countersRaw =
    data.counters && typeof data.counters === "object" ? data.counters : {};

  return {
    updatedAt:
      toIso(data.updatedAt, DEFAULT_MEMORY.updatedAt) || DEFAULT_MEMORY.updatedAt,
    recurringProblems: pruneRecurringProblems(recurringProblems),
    sourceMemory: pruneSourceMemory(sourceMemory),
    approvalMemory: {
      approved: safeNumber(approvalMemoryRaw.approved, 0),
      rejected: safeNumber(approvalMemoryRaw.rejected, 0),
      lastApprovedAt: toIso(approvalMemoryRaw.lastApprovedAt),
      lastRejectedAt: toIso(approvalMemoryRaw.lastRejectedAt),
      lastApprovedTitle: normalizeText(approvalMemoryRaw.lastApprovedTitle),
      lastRejectedTitle: normalizeText(approvalMemoryRaw.lastRejectedTitle),
    },
    behaviorMemory: {
      bestRecoveryFlow: normalizeText(behaviorMemoryRaw.bestRecoveryFlow),
      bestSyncWindow: normalizeText(behaviorMemoryRaw.bestSyncWindow),
      preferredFocus: normalizeText(behaviorMemoryRaw.preferredFocus),
      lastGlobalAssessment: normalizeText(behaviorMemoryRaw.lastGlobalAssessment),
      lastGlobalHealth: normalizeHealth(behaviorMemoryRaw.lastGlobalHealth),
      lastGlobalAssessmentAt: toIso(behaviorMemoryRaw.lastGlobalAssessmentAt),
      lastPrimaryGoal: normalizeText(behaviorMemoryRaw.lastPrimaryGoal),
      lastKnownMode:
        normalizeText(behaviorMemoryRaw.lastKnownMode) || "observation",
    },
    executionMemory: {
      totalRuns: safeNumber(executionMemoryRaw.totalRuns, 0),
      successfulRuns: safeNumber(executionMemoryRaw.successfulRuns, 0),
      failedRuns: safeNumber(executionMemoryRaw.failedRuns, 0),
      totalRecoveredChapters: safeNumber(
        executionMemoryRaw.totalRecoveredChapters,
        0
      ),
      totalFailedRecoveries: safeNumber(
        executionMemoryRaw.totalFailedRecoveries,
        0
      ),
      totalQueueProcessed: safeNumber(executionMemoryRaw.totalQueueProcessed, 0),
      avgCycleDurationMs: safeNumber(executionMemoryRaw.avgCycleDurationMs, 0),
      lastSuccessfulRunAt: toIso(executionMemoryRaw.lastSuccessfulRunAt),
      lastFailedRunAt: toIso(executionMemoryRaw.lastFailedRunAt),
      lastRunDurationMs: safeNumber(executionMemoryRaw.lastRunDurationMs, 0),
    },
    proposalMemory: {
      totalGenerated: safeNumber(proposalMemoryRaw.totalGenerated, 0),
      totalApproved: safeNumber(proposalMemoryRaw.totalApproved, 0),
      totalRejected: safeNumber(proposalMemoryRaw.totalRejected, 0),
      totalApplied: safeNumber(proposalMemoryRaw.totalApplied, 0),
      lastGeneratedAt: toIso(proposalMemoryRaw.lastGeneratedAt),
      lastAppliedAt: toIso(proposalMemoryRaw.lastAppliedAt),
    },
    autonomyMemory: {
      mode:
        normalizeText(autonomyMemoryRaw.mode) || DEFAULT_MEMORY.autonomyMemory.mode,
      confidenceScore: clamp(
        safeNumber(autonomyMemoryRaw.confidenceScore, 0),
        0,
        100
      ),
      lastDecisionAt: toIso(autonomyMemoryRaw.lastDecisionAt),
      lastDecisionSummary: normalizeText(autonomyMemoryRaw.lastDecisionSummary),
      canSafelyEscalate: !!autonomyMemoryRaw.canSafelyEscalate,
    },
    counters: {
      totalIncidentsSeen: safeNumber(countersRaw.totalIncidentsSeen, 0),
      totalCommentsProcessed: safeNumber(countersRaw.totalCommentsProcessed, 0),
      totalIdeasGenerated: safeNumber(countersRaw.totalIdeasGenerated, 0),
      totalKnowledgeItemsLearned: safeNumber(
        countersRaw.totalKnowledgeItemsLearned,
        0
      ),
      totalSourcesTracked: safeNumber(countersRaw.totalSourcesTracked, 0),
      totalMemoryEvents: safeNumber(countersRaw.totalMemoryEvents, 0),
    },
  };
}

export async function writeOperatorMemory(
  db: Firestore,
  memory: OperatorMemorySnapshot
) {
  const normalizedSourceMemory = Object.fromEntries(
    Object.entries(memory.sourceMemory || {}).map(([host, item]) => {
      const safeHost = normalizeText(host || item?.host).toLowerCase();
      const normalized: OperatorSourceMemory = {
        host: safeHost,
        successRate: safeNumber(item?.successRate, 0),
        errorRate: safeNumber(item?.errorRate, 0),
        avgLatencyMs: safeNumber(item?.avgLatencyMs, 0),
        totalSuccess: safeNumber(item?.totalSuccess, 0),
        totalFailure: safeNumber(item?.totalFailure, 0),
        recentFailures: safeNumber(item?.recentFailures, 0),
        recentSuccesses: safeNumber(item?.recentSuccesses, 0),
        recommendedPriority: safeNumber(item?.recommendedPriority, 0),
        health: normalizeHealth(item?.health),
        trustScore: 0,
        lastSuccessAt: toIso(item?.lastSuccessAt),
        lastFailureAt: toIso(item?.lastFailureAt),
        updatedAt: toIso(item?.updatedAt) || nowIso(),
      };

      normalized.trustScore = getTrustScore({
        successRate: normalized.successRate,
        errorRate: normalized.errorRate,
        recentFailures: normalized.recentFailures,
        recommendedPriority: normalized.recommendedPriority,
        avgLatencyMs: normalized.avgLatencyMs,
        lastSuccessAt: normalized.lastSuccessAt,
        lastFailureAt: normalized.lastFailureAt,
      });

      return [safeHost, normalized];
    })
  );

  const normalizedMemory: OperatorMemorySnapshot = {
    ...memory,
    updatedAt: nowIso(),
    recurringProblems: pruneRecurringProblems(memory.recurringProblems || []).map(
      (item) => ({
        ...item,
        severity: normalizeSeverity(item.severity),
        type: normalizeRecurringProblemType(item.type),
      })
    ),
    sourceMemory: pruneSourceMemory(normalizedSourceMemory),
    approvalMemory: {
      approved: safeNumber(memory.approvalMemory?.approved, 0),
      rejected: safeNumber(memory.approvalMemory?.rejected, 0),
      lastApprovedAt: toIso(memory.approvalMemory?.lastApprovedAt),
      lastRejectedAt: toIso(memory.approvalMemory?.lastRejectedAt),
      lastApprovedTitle: normalizeText(memory.approvalMemory?.lastApprovedTitle),
      lastRejectedTitle: normalizeText(memory.approvalMemory?.lastRejectedTitle),
    },
    behaviorMemory: {
      bestRecoveryFlow: normalizeText(memory.behaviorMemory?.bestRecoveryFlow),
      bestSyncWindow: normalizeText(memory.behaviorMemory?.bestSyncWindow),
      preferredFocus: normalizeText(memory.behaviorMemory?.preferredFocus),
      lastGlobalAssessment: normalizeText(memory.behaviorMemory?.lastGlobalAssessment),
      lastGlobalHealth: normalizeHealth(memory.behaviorMemory?.lastGlobalHealth),
      lastGlobalAssessmentAt: toIso(memory.behaviorMemory?.lastGlobalAssessmentAt),
      lastPrimaryGoal: normalizeText(memory.behaviorMemory?.lastPrimaryGoal),
      lastKnownMode:
        normalizeText(memory.behaviorMemory?.lastKnownMode) || "observation",
    },
    executionMemory: {
      totalRuns: safeNumber(memory.executionMemory?.totalRuns, 0),
      successfulRuns: safeNumber(memory.executionMemory?.successfulRuns, 0),
      failedRuns: safeNumber(memory.executionMemory?.failedRuns, 0),
      totalRecoveredChapters: safeNumber(
        memory.executionMemory?.totalRecoveredChapters,
        0
      ),
      totalFailedRecoveries: safeNumber(
        memory.executionMemory?.totalFailedRecoveries,
        0
      ),
      totalQueueProcessed: safeNumber(memory.executionMemory?.totalQueueProcessed, 0),
      avgCycleDurationMs: safeNumber(memory.executionMemory?.avgCycleDurationMs, 0),
      lastSuccessfulRunAt: toIso(memory.executionMemory?.lastSuccessfulRunAt),
      lastFailedRunAt: toIso(memory.executionMemory?.lastFailedRunAt),
      lastRunDurationMs: safeNumber(memory.executionMemory?.lastRunDurationMs, 0),
    },
    proposalMemory: {
      totalGenerated: safeNumber(memory.proposalMemory?.totalGenerated, 0),
      totalApproved: safeNumber(memory.proposalMemory?.totalApproved, 0),
      totalRejected: safeNumber(memory.proposalMemory?.totalRejected, 0),
      totalApplied: safeNumber(memory.proposalMemory?.totalApplied, 0),
      lastGeneratedAt: toIso(memory.proposalMemory?.lastGeneratedAt),
      lastAppliedAt: toIso(memory.proposalMemory?.lastAppliedAt),
    },
    autonomyMemory: {
      ...memory.autonomyMemory,
      mode: normalizeAutonomyMode(memory.autonomyMemory.mode),
      confidenceScore: clamp(
        safeNumber(memory.autonomyMemory.confidenceScore, 0),
        0,
        100
      ),
      canSafelyEscalate: !!memory.autonomyMemory.canSafelyEscalate,
      lastDecisionAt: toIso(memory.autonomyMemory.lastDecisionAt),
      lastDecisionSummary: normalizeText(memory.autonomyMemory.lastDecisionSummary),
    },
    counters: {
      totalIncidentsSeen: safeNumber(memory.counters?.totalIncidentsSeen, 0),
      totalCommentsProcessed: safeNumber(memory.counters?.totalCommentsProcessed, 0),
      totalIdeasGenerated: safeNumber(memory.counters?.totalIdeasGenerated, 0),
      totalKnowledgeItemsLearned: safeNumber(
        memory.counters?.totalKnowledgeItemsLearned,
        0
      ),
      totalSourcesTracked: safeNumber(memory.counters?.totalSourcesTracked, 0),
      totalMemoryEvents: safeNumber(memory.counters?.totalMemoryEvents, 0),
    },
  };

  normalizedMemory.counters.totalSourcesTracked = Object.keys(
    normalizedMemory.sourceMemory
  ).length;

  await memoryDoc(db).set(normalizedMemory, { merge: true });
}

export async function appendOperatorMemoryEvent(
  db: Firestore,
  event: Omit<OperatorMemoryEvent, "id" | "createdAt">
) {
  await ensureMemoryRoot(db);

  const payload: OperatorMemoryEvent = {
    type: normalizeText(event.type) || "generic",
    success: !!event.success,
    impactScore: clamp(safeNumber(event.impactScore, 0), -100, 100),
    title: normalizeText(event.title),
    summary: normalizeText(event.summary),
    context: sanitizeObject(event.context),
    createdAt: nowIso(),
  };

  const ref = await memoryEventsCollection(db).add(payload);
  return { ok: true as const, id: ref.id };
}

export async function listOperatorMemoryEvents(
  db: Firestore,
  limit = 50
) {
  await ensureMemoryRoot(db);

  const snap = await memoryEventsCollection(db)
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(MAX_EVENT_LIST_LIMIT, limit)))
    .get()
    .catch(() => null);

  return (
    snap?.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as any),
    })) || []
  );
}

export async function storeOperatorMemory(
  db: Firestore,
  input: StoreOperatorMemoryInput
) {
  const memory = await readOperatorMemory(db);

  await appendOperatorMemoryEvent(db, {
    type: input.type,
    success: input.success,
    impactScore: safeNumber(input.impactScore, input.success ? 5 : -5),
    title: normalizeText(input.title),
    summary: normalizeText(input.summary),
    context: sanitizeObject(input.context),
  });

  memory.counters.totalMemoryEvents += 1;

  const normalizedType = normalizeText(input.type);

  if (!input.success && shouldTrackAsRecurringFailure(normalizedType)) {
    const key = `failure::${normalizedType}`;
    const existing = memory.recurringProblems.find((item) => item.key === key);

    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = nowIso();
      existing.severity =
        existing.count >= 10
          ? "critical"
          : existing.count >= 5
          ? "high"
          : "warning";
      existing.meta = {
        ...(existing.meta || {}),
        latestContext: sanitizeObject(input.context),
        latestSummary: normalizeText(input.summary),
      };
    } else {
      memory.recurringProblems.push({
        key,
        title: `Falhas recorrentes em ${normalizedType}`,
        type: detectRecurringProblemTypeFromEvent(normalizedType),
        count: 1,
        firstSeenAt: nowIso(),
        lastSeenAt: nowIso(),
        severity: "warning",
        meta: {
          latestContext: sanitizeObject(input.context),
          latestSummary: normalizeText(input.summary),
        },
      });
    }
  }

  memory.recurringProblems = pruneRecurringProblems(memory.recurringProblems);

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerExecutionMemory(
  db: Firestore,
  input: {
    success: boolean;
    durationMs?: number;
    recoveredChapters?: number;
    failedRecoveries?: number;
    queueProcessed?: number;
    summary?: string;
  }
) {
  const memory = await readOperatorMemory(db);
  const now = nowIso();

  memory.executionMemory.totalRuns += 1;
  memory.executionMemory.lastRunDurationMs = safeNumber(input.durationMs, 0);
  memory.executionMemory.totalRecoveredChapters += safeNumber(
    input.recoveredChapters,
    0
  );
  memory.executionMemory.totalFailedRecoveries += safeNumber(
    input.failedRecoveries,
    0
  );
  memory.executionMemory.totalQueueProcessed += safeNumber(
    input.queueProcessed,
    0
  );

  const totalRuns = Math.max(1, memory.executionMemory.totalRuns);
  const currentAvg = safeNumber(memory.executionMemory.avgCycleDurationMs, 0);
  const currentDuration = safeNumber(input.durationMs, 0);

  memory.executionMemory.avgCycleDurationMs =
    totalRuns > 1
      ? Math.round((currentAvg * (totalRuns - 1) + currentDuration) / totalRuns)
      : currentDuration;

  if (input.success) {
    memory.executionMemory.successfulRuns += 1;
    memory.executionMemory.lastSuccessfulRunAt = now;
  } else {
    memory.executionMemory.failedRuns += 1;
    memory.executionMemory.lastFailedRunAt = now;
  }

  await appendOperatorMemoryEvent(db, {
    type: "operator-cycle",
    success: input.success,
    impactScore: input.success ? 12 : -20,
    title: input.success
      ? "Ciclo do operador bem-sucedido"
      : "Ciclo do operador falhou",
    summary: normalizeText(input.summary),
    context: {
      durationMs: safeNumber(input.durationMs, 0),
      recoveredChapters: safeNumber(input.recoveredChapters, 0),
      failedRecoveries: safeNumber(input.failedRecoveries, 0),
      queueProcessed: safeNumber(input.queueProcessed, 0),
    },
  });

  memory.counters.totalMemoryEvents += 1;

  if (!input.success) {
    const key = "execution::failed-cycle";
    const existing = memory.recurringProblems.find((item) => item.key === key);

    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = now;
      existing.severity =
        existing.count >= 8 ? "critical" : existing.count >= 4 ? "high" : "warning";
      existing.meta = {
        ...(existing.meta || {}),
        latestSummary: normalizeText(input.summary),
        durationMs: safeNumber(input.durationMs, 0),
      };
    } else {
      memory.recurringProblems.push({
        key,
        title: "Falhas recorrentes no ciclo principal do operador",
        type: "operator",
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        severity: "warning",
        meta: {
          latestSummary: normalizeText(input.summary),
          durationMs: safeNumber(input.durationMs, 0),
        },
      });
    }
  }

  memory.recurringProblems = pruneRecurringProblems(memory.recurringProblems);

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerSourceOutcome(
  db: Firestore,
  input: {
    host: string;
    success: boolean;
    latencyMs?: number;
    recommendedPriority?: number;
  }
) {
  const memory = await readOperatorMemory(db);
  const host = normalizeText(input.host).toLowerCase();

  if (!host) return memory;

  const current = memory.sourceMemory[host] || {
    host,
    successRate: 0,
    errorRate: 0,
    avgLatencyMs: 0,
    totalSuccess: 0,
    totalFailure: 0,
    recentFailures: 0,
    recentSuccesses: 0,
    recommendedPriority: 0,
    health: "healthy" as OperatorMemoryHealth,
    trustScore: 0,
  };

  const totalSuccess = current.totalSuccess + (input.success ? 1 : 0);
  const totalFailure = current.totalFailure + (input.success ? 0 : 1);
  const total = totalSuccess + totalFailure;
  const successRate = total > 0 ? Math.round((totalSuccess / total) * 100) : 0;
  const errorRate = total > 0 ? Math.round((totalFailure / total) * 100) : 0;

  const recentFailures = input.success
    ? Math.max(0, current.recentFailures - 1)
    : current.recentFailures + 1;

  const recentSuccesses = input.success
    ? current.recentSuccesses + 1
    : Math.max(0, current.recentSuccesses - 1);

  const previousAttempts =
    safeNumber(current.totalSuccess, 0) + safeNumber(current.totalFailure, 0);

  const avgLatencyMs =
    typeof input.latencyMs === "number" && input.latencyMs > 0
      ? current.avgLatencyMs > 0 && previousAttempts > 0
        ? Math.round(
            (current.avgLatencyMs * previousAttempts + input.latencyMs) /
              (previousAttempts + 1)
          )
        : input.latencyMs
      : current.avgLatencyMs;

  const health: OperatorMemoryHealth =
    recentFailures >= 4 || errorRate >= 50
      ? "critical"
      : recentFailures >= 2 || errorRate >= 25 || avgLatencyMs > 2500
      ? "warning"
      : "healthy";

  const recommendedPriority =
    typeof input.recommendedPriority === "number"
      ? input.recommendedPriority
      : current.recommendedPriority;

  const updatedAt = nowIso();
  const lastSuccessAt = input.success ? updatedAt : current.lastSuccessAt;
  const lastFailureAt = input.success ? current.lastFailureAt : updatedAt;

  memory.sourceMemory[host] = {
    host,
    successRate,
    errorRate,
    avgLatencyMs,
    totalSuccess,
    totalFailure,
    recentFailures,
    recentSuccesses,
    recommendedPriority,
    health,
    trustScore: getTrustScore({
      successRate,
      errorRate,
      recentFailures,
      recommendedPriority,
      avgLatencyMs,
      lastSuccessAt,
      lastFailureAt,
    }),
    lastSuccessAt,
    lastFailureAt,
    updatedAt,
  };

  memory.counters.totalSourcesTracked = Object.keys(memory.sourceMemory).length;
  memory.counters.totalMemoryEvents += 1;

  await appendOperatorMemoryEvent(db, {
    type: "source-outcome",
    success: input.success,
    impactScore: input.success ? 8 : -12,
    title: `${host} ${input.success ? "funcionou" : "falhou"}`,
    summary: `Atualização de memória da fonte ${host}.`,
    context: {
      host,
      latencyMs: safeNumber(input.latencyMs, 0),
      health,
      successRate,
      errorRate,
      recommendedPriority,
    },
  });

  if (!input.success) {
    const key = `source::failure::${host}`;
    const existing = memory.recurringProblems.find((item) => item.key === key);

    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = nowIso();
      existing.severity =
        existing.count >= 8 ? "critical" : existing.count >= 4 ? "high" : "warning";
      existing.meta = {
        ...(existing.meta || {}),
        host,
        errorRate,
        recentFailures,
      };
    } else {
      memory.recurringProblems.push({
        key,
        title: `Falhas recorrentes na fonte ${host}`,
        type: "source",
        count: 1,
        firstSeenAt: nowIso(),
        lastSeenAt: nowIso(),
        severity: "warning",
        meta: {
          host,
          errorRate,
          recentFailures,
        },
      });
    }
  }

  memory.recurringProblems = pruneRecurringProblems(memory.recurringProblems);

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerIncidentsSeen(
  db: Firestore,
  amount = 1
) {
  const memory = await readOperatorMemory(db);
  memory.counters.totalIncidentsSeen += Math.max(0, safeNumber(amount, 0));
  await writeOperatorMemory(db, memory);
  return memory;
}

export async function updateBehaviorMemory(
  db: Firestore,
  input: Partial<OperatorBehaviorMemory>
) {
  const memory = await readOperatorMemory(db);

  memory.behaviorMemory = {
    ...memory.behaviorMemory,
    ...Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined)
    ),
  };

  if (input.preferredFocus) {
    const normalizedMode = normalizeAutonomyMode(input.preferredFocus);
    memory.autonomyMemory.mode = normalizedMode;
    memory.behaviorMemory.lastKnownMode = normalizedMode;
  }

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerApprovalMemory(
  db: Firestore,
  input: {
    approved: boolean;
    title: string;
  }
) {
  const memory = await readOperatorMemory(db);
  const now = nowIso();

  if (input.approved) {
    memory.approvalMemory.approved += 1;
    memory.approvalMemory.lastApprovedAt = now;
    memory.approvalMemory.lastApprovedTitle = normalizeText(input.title);
    memory.proposalMemory.totalApproved += 1;
  } else {
    memory.approvalMemory.rejected += 1;
    memory.approvalMemory.lastRejectedAt = now;
    memory.approvalMemory.lastRejectedTitle = normalizeText(input.title);
    memory.proposalMemory.totalRejected += 1;
  }

  memory.counters.totalMemoryEvents += 1;

  await appendOperatorMemoryEvent(db, {
    type: input.approved ? "proposal-approved" : "proposal-rejected",
    success: input.approved,
    impactScore: input.approved ? 9 : -4,
    title: normalizeText(input.title),
    summary: input.approved
      ? "Proposta aprovada pelo usuário."
      : "Proposta rejeitada pelo usuário.",
  });

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerProposalGenerated(
  db: Firestore,
  input: {
    title: string;
    summary?: string;
    decision?: "generated" | "approved" | "rejected" | "applied";
  }
) {
  const memory = await readOperatorMemory(db);
  const now = nowIso();
  const decision = normalizeText(input.decision || "generated").toLowerCase();

  if (decision === "generated") {
    memory.proposalMemory.totalGenerated += 1;
    memory.proposalMemory.lastGeneratedAt = now;
    memory.counters.totalIdeasGenerated += 1;
  }

  if (decision === "approved") {
    memory.proposalMemory.totalApproved += 1;
    memory.approvalMemory.approved += 1;
    memory.approvalMemory.lastApprovedAt = now;
    memory.approvalMemory.lastApprovedTitle = normalizeText(input.title);
  }

  if (decision === "rejected") {
    memory.proposalMemory.totalRejected += 1;
    memory.approvalMemory.rejected += 1;
    memory.approvalMemory.lastRejectedAt = now;
    memory.approvalMemory.lastRejectedTitle = normalizeText(input.title);
  }

  if (decision === "applied") {
    memory.proposalMemory.totalApplied += 1;
    memory.proposalMemory.lastAppliedAt = now;
  }

  memory.counters.totalMemoryEvents += 1;

  await appendOperatorMemoryEvent(db, {
    type: `proposal-${decision}`,
    success: decision !== "rejected",
    impactScore:
      decision === "applied"
        ? 10
        : decision === "approved"
        ? 8
        : decision === "rejected"
        ? -3
        : 6,
    title: input.title,
    summary:
      normalizeText(input.summary) ||
      (decision === "generated"
        ? "Nova proposta gerada pela IA."
        : decision === "approved"
        ? "Proposta aprovada."
        : decision === "rejected"
        ? "Proposta rejeitada."
        : "Proposta aplicada."),
  });

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerProposalApplied(
  db: Firestore,
  input: {
    title: string;
  }
) {
  const memory = await readOperatorMemory(db);
  memory.proposalMemory.totalApplied += 1;
  memory.proposalMemory.lastAppliedAt = nowIso();
  memory.counters.totalMemoryEvents += 1;

  await appendOperatorMemoryEvent(db, {
    type: "proposal-applied",
    success: true,
    impactScore: 10,
    title: input.title,
    summary: "Proposta aplicada com sucesso.",
  });

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerCommentsProcessed(
  db: Firestore,
  amount = 1
) {
  const memory = await readOperatorMemory(db);
  memory.counters.totalCommentsProcessed += Math.max(1, safeNumber(amount, 1));
  await writeOperatorMemory(db, memory);
  return memory;
}

export async function registerKnowledgeLearned(
  db: Firestore,
  input: {
    title: string;
    success?: boolean;
  }
) {
  const memory = await readOperatorMemory(db);
  memory.counters.totalKnowledgeItemsLearned += 1;
  memory.counters.totalMemoryEvents += 1;

  await appendOperatorMemoryEvent(db, {
    type: "knowledge-learned",
    success: input.success ?? true,
    impactScore: input.success === false ? -2 : 5,
    title: input.title,
    summary: "Novo aprendizado registrado pela IA.",
  });

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function updateAutonomyMemory(
  db: Firestore,
  input: {
    mode?: OperatorAutonomyMode | string;
    confidenceScore?: number;
    lastDecisionSummary?: string;
    canSafelyEscalate?: boolean;
  }
) {
  const memory = await readOperatorMemory(db);

  memory.autonomyMemory = {
    ...memory.autonomyMemory,
    mode:
      input.mode !== undefined
        ? normalizeAutonomyMode(input.mode)
        : normalizeAutonomyMode(memory.autonomyMemory.mode),
    confidenceScore:
      input.confidenceScore !== undefined
        ? clamp(input.confidenceScore, 0, 100)
        : memory.autonomyMemory.confidenceScore,
    lastDecisionAt: nowIso(),
    lastDecisionSummary:
      input.lastDecisionSummary !== undefined
        ? normalizeText(input.lastDecisionSummary)
        : memory.autonomyMemory.lastDecisionSummary,
    canSafelyEscalate:
      input.canSafelyEscalate !== undefined
        ? input.canSafelyEscalate
        : memory.autonomyMemory.canSafelyEscalate,
  };

  memory.behaviorMemory.lastKnownMode = normalizeAutonomyMode(
    memory.autonomyMemory.mode
  );

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function upsertRecurringProblem(
  db: Firestore,
  input: {
    key: string;
    title: string;
    type: OperatorRecurringProblem["type"];
    severity?: "info" | "warning" | "high" | "critical";
    incrementBy?: number;
    meta?: Record<string, unknown>;
  }
) {
  const memory = await readOperatorMemory(db);
  const now = nowIso();
  const key = normalizeText(input.key);
  const title = normalizeText(input.title);

  if (!key || !title) return memory;

  const existing = memory.recurringProblems.find((item) => item.key === key);

  if (existing) {
    existing.count += Math.max(1, safeNumber(input.incrementBy, 1));
    existing.lastSeenAt = now;
    existing.severity = input.severity || existing.severity || "warning";
    existing.meta = {
      ...(existing.meta || {}),
      ...sanitizeObject(input.meta),
    };
  } else {
    memory.recurringProblems.push({
      key,
      title,
      type: normalizeRecurringProblemType(input.type),
      count: Math.max(1, safeNumber(input.incrementBy, 1)),
      firstSeenAt: now,
      lastSeenAt: now,
      severity: input.severity || "warning",
      meta: sanitizeObject(input.meta),
    });
  }

  memory.recurringProblems = pruneRecurringProblems(memory.recurringProblems);

  await writeOperatorMemory(db, memory);
  return memory;
}

export async function buildOperatorMemoryInsights(db: Firestore) {
  const [memory, latestEvents] = await Promise.all([
    readOperatorMemory(db),
    listOperatorMemoryEvents(db, 20).catch(() => []),
  ]);

  const recurringTop = memory.recurringProblems.slice(0, 5);

  const sourceTop = Object.values(memory.sourceMemory)
    .sort((a, b) => b.trustScore - a.trustScore)
    .slice(0, 5);

  const riskySources = Object.values(memory.sourceMemory)
    .sort((a, b) => {
      const aRisk =
        safeNumber(a.errorRate, 0) +
        safeNumber(a.recentFailures, 0) * 5 -
        safeNumber(a.successRate, 0) * 0.5 +
        (ageDays(a.lastFailureAt) <= 3 ? 10 : 0);
      const bRisk =
        safeNumber(b.errorRate, 0) +
        safeNumber(b.recentFailures, 0) * 5 -
        safeNumber(b.successRate, 0) * 0.5 +
        (ageDays(b.lastFailureAt) <= 3 ? 10 : 0);
      return bRisk - aRisk;
    })
    .slice(0, 5);

  const successRate =
    memory.executionMemory.totalRuns > 0
      ? Math.round(
          (memory.executionMemory.successfulRuns /
            memory.executionMemory.totalRuns) *
            100
        )
      : 0;

  const recentFailures = latestEvents.filter((item: any) => !item?.success);
  const recentSuccesses = latestEvents.filter((item: any) => !!item?.success);

  const recentFailurePressure = recentFailures.reduce((acc: number, item: any) => {
    const impact = Math.abs(safeNumber(item?.impactScore, 0));
    return acc + impact * computeRecencyWeight(item?.createdAt);
  }, 0);

  const recentSuccessPressure = recentSuccesses.reduce((acc: number, item: any) => {
    const impact = safeNumber(item?.impactScore, 0);
    return acc + impact * computeRecencyWeight(item?.createdAt);
  }, 0);

  const recurringPressureScore = memory.recurringProblems
    .slice(0, 12)
    .reduce((acc, item) => {
      return acc + recurringProblemRank(item);
    }, 0);

  const sourceTrustAverage =
    Object.values(memory.sourceMemory).length > 0
      ? Math.round(
          Object.values(memory.sourceMemory).reduce(
            (acc, item) => acc + safeNumber(item.trustScore, 0),
            0
          ) / Object.values(memory.sourceMemory).length
        )
      : 0;

  return {
    updatedAt: memory.updatedAt,
    systemMemoryHealth: buildSystemMemoryHealth(memory),
    autonomyMode: memory.autonomyMemory.mode,
    autonomyConfidence: memory.autonomyMemory.confidenceScore,
    executionSuccessRate: successRate,
    recentFailurePressure: Math.round(recentFailurePressure),
    recentSuccessPressure: Math.round(recentSuccessPressure),
    recurringPressureScore: Math.round(recurringPressureScore),
    sourceTrustAverage,
    topRecurringProblems: recurringTop,
    topTrustedSources: sourceTop,
    topRiskSources: riskySources,
    latestEvents,
    proposalMemory: memory.proposalMemory,
    approvalMemory: memory.approvalMemory,
    executionMemory: memory.executionMemory,
    counters: memory.counters,
  };
}