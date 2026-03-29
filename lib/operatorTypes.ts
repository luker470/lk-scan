export type OperatorHealth = "healthy" | "warning" | "critical";

export type OperatorJobStatus = "idle" | "running" | "success" | "error";

export type OperatorIncidentSeverity = "info" | "warning" | "high" | "critical";

export type OperatorIncidentType =
  | "site"
  | "api"
  | "source"
  | "parser"
  | "chapter"
  | "sync"
  | "queue"
  | "backup"
  | "comment"
  | "operator"
  | "unknown";

export type OperatorMetrics = {
  totalMangas: number;
  totalChapters: number;
  totalViews: number;

  dayViews: number;
  weekViews: number;
  monthViews: number;

  totalUsers: number;
  totalFavorites: number;
  totalFollowing: number;
  totalHistoryEntries: number;

  totalBrokenChapters: number;
  autoSyncActive: number;

  sourcesHealthy: number;
  sourcesWarning: number;
  sourcesCritical: number;

  last24hImportedChapters: number;
  last24hIncidents: number;
};

export type OperatorLearningScore = {
  host: string;
  score: number;
  successRate: number;
  errorRate: number;
  recommendedPriority: number;
  health: OperatorHealth;
};

export type OperatorReportMeta = {
  health?: OperatorHealth;
  automationNot100?: boolean;
  topHosts?: Array<{
    host: string;
    score: number;
    successRate: number;
    errorRate: number;
    health: OperatorHealth;
    recommendedPriority: number;
  }>;
  riskyHosts?: Array<{
    host: string;
    score: number;
    successRate: number;
    errorRate: number;
    health: OperatorHealth;
    recommendedPriority: number;
  }>;
  executiveSummary?: string;
  generatedBy?: string;
  queue?: {
    total?: number;
    queued?: number;
    running?: number;
    success?: number;
    warning?: number;
    error?: number;
    critical?: number;
    high?: number;
  };
  [key: string]: unknown;
};

export type OperatorReport = {
  generatedAt: Date | string;
  summary: string;
  highlights: string[];
  warnings: string[];
  actions: string[];
  recommendations: string[];
  metrics: OperatorMetrics;
  learning: OperatorLearningScore[];
  meta?: OperatorReportMeta;
};

export type CommentClassification =
  | "praise"
  | "bug"
  | "question"
  | "request"
  | "toxic"
  | "spoiler"
  | "generic";

export type CommentAnalysis = {
  classification: CommentClassification;
  priority: number;
  sentiment: "positive" | "neutral" | "negative";
  toxicityScore: number;
  needsReview: boolean;
  suggestedResponse: string;
};

export type OperatorChatAnswer = {
  answer: string;
  highlights: string[];
  warnings: string[];
  recommendations: string[];
};