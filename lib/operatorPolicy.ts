export type OperatorAutoActionType =
  | "sync-manga"
  | "validate-chapter"
  | "validate-manga"
  | "recovery-chapter"
  | "reimport-chapter"
  | "discover-source"
  | "source-health-check"
  | "queue-reprioritization"
  | "incident-resolution"
  | "comment-analysis"
  | "report-generation"
  | "catalog-diagnostics"
  | "operator-maintenance";

export type OperatorApprovalRequiredType =
  | "ui-change"
  | "layout-change"
  | "reader-change"
  | "new-page"
  | "branding-change"
  | "public-text-change"
  | "code-architecture-change"
  | "database-schema-change"
  | "content-strategy-change"
  | "seo-structure-change"
  | "navigation-change";

export const OPERATOR_POLICY = {
  version: 1,
  canAutoExecute: [
    "sync-manga",
    "validate-chapter",
    "validate-manga",
    "recovery-chapter",
    "reimport-chapter",
    "discover-source",
    "source-health-check",
    "queue-reprioritization",
    "incident-resolution",
    "comment-analysis",
    "report-generation",
    "catalog-diagnostics",
    "operator-maintenance",
  ] as OperatorAutoActionType[],

  requiresApproval: [
    "ui-change",
    "layout-change",
    "reader-change",
    "new-page",
    "branding-change",
    "public-text-change",
    "code-architecture-change",
    "database-schema-change",
    "content-strategy-change",
    "seo-structure-change",
    "navigation-change",
  ] as OperatorApprovalRequiredType[],
};

export function canOperatorAutoExecute(action: string) {
  return OPERATOR_POLICY.canAutoExecute.includes(
    action as OperatorAutoActionType
  );
}

export function doesOperatorRequireApproval(action: string) {
  return OPERATOR_POLICY.requiresApproval.includes(
    action as OperatorApprovalRequiredType
  );
}

export function getOperatorPolicySummary() {
  return {
    version: OPERATOR_POLICY.version,
    autoCount: OPERATOR_POLICY.canAutoExecute.length,
    approvalCount: OPERATOR_POLICY.requiresApproval.length,
    autoActions: [...OPERATOR_POLICY.canAutoExecute],
    approvalActions: [...OPERATOR_POLICY.requiresApproval],
  };
}