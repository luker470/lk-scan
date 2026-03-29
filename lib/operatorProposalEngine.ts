import type { Firestore } from "firebase-admin/firestore";
import { registerApprovalMemory } from "@/lib/operatorMemory";
import { doesOperatorRequireApproval } from "@/lib/operatorPolicy";

export type OperatorProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applied"
  | "archived";

export type OperatorProposalType =
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

export type OperatorProposal = {
  id?: string;
  type: OperatorProposalType;
  title: string;
  description: string;
  rationale: string;
  impact: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  status: OperatorProposalStatus;
  proposedBy: "lk-ai-operator";
  requiresExplicitUserApproval: boolean;
  relatedFiles: string[];
  generatedText?: string;
  generatedImagePrompt?: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  appliedAt?: string;
  rejectedReason?: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeText(item)).filter(Boolean).slice(0, 50);
}

function collectionRef(db: Firestore) {
  return db.collection("system").doc("operatorApprovals").collection("items");
}

function normalizeProposalType(value: unknown): OperatorProposalType {
  const v = normalizeText(value).toLowerCase();
  switch (v) {
    case "ui-change":
    case "layout-change":
    case "reader-change":
    case "new-page":
    case "branding-change":
    case "public-text-change":
    case "code-architecture-change":
    case "database-schema-change":
    case "content-strategy-change":
    case "seo-structure-change":
    case "navigation-change":
      return v;
    default:
      return "ui-change";
  }
}

function normalizeProposalStatus(value: unknown): OperatorProposalStatus {
  const v = normalizeText(value).toLowerCase();
  switch (v) {
    case "pending":
    case "approved":
    case "rejected":
    case "applied":
    case "archived":
      return v;
    default:
      return "pending";
  }
}

export async function createOperatorProposal(
  db: Firestore,
  input: Omit<
    OperatorProposal,
    | "id"
    | "status"
    | "proposedBy"
    | "requiresExplicitUserApproval"
    | "createdAt"
    | "updatedAt"
  > & {
    status?: OperatorProposalStatus;
  }
) {
  const now = nowIso();

  const type = normalizeProposalType(input.type);
  const title = normalizeText(input.title);
  const description = normalizeText(input.description);
  const rationale = normalizeText(input.rationale);

  if (!title || !description || !rationale) {
    return {
      ok: false as const,
      error: "Proposta inválida: faltam título, descrição ou rationale.",
    };
  }

  const requiresExplicitUserApproval = doesOperatorRequireApproval(type);

  const payload: OperatorProposal = {
    type,
    title,
    description,
    rationale,
    impact: input.impact || "medium",
    risk: input.risk || "medium",
    status: normalizeProposalStatus(input.status || "pending"),
    proposedBy: "lk-ai-operator",
    requiresExplicitUserApproval,
    relatedFiles: normalizeList(input.relatedFiles),
    generatedText: normalizeText(input.generatedText),
    generatedImagePrompt: normalizeText(input.generatedImagePrompt),
    meta: input.meta || {},
    createdAt: now,
    updatedAt: now,
  };

  const existingSnap = await collectionRef(db)
    .where("title", "==", payload.title)
    .where("status", "==", "pending")
    .limit(1)
    .get()
    .catch(() => null);

  if (existingSnap && !existingSnap.empty) {
    const doc = existingSnap.docs[0];
    await doc.ref.set(
      {
        ...payload,
        updatedAt: now,
      },
      { merge: true }
    );

    return {
      ok: true as const,
      created: false as const,
      id: doc.id,
      proposal: {
        id: doc.id,
        ...payload,
      },
    };
  }

  const ref = await collectionRef(db).add(payload);

  await db.collection("system").doc("actions").collection("items").add({
    type: "operator-proposal",
    status: "warning",
    message: `Nova proposta criada pela IA: ${payload.title}`,
    meta: {
      proposalId: ref.id,
      proposalType: payload.type,
      impact: payload.impact,
      risk: payload.risk,
      requiresExplicitUserApproval,
    },
    createdAt: new Date(),
  });

  return {
    ok: true as const,
    created: true as const,
    id: ref.id,
    proposal: {
      id: ref.id,
      ...payload,
    },
  };
}

export async function listOperatorProposals(
  db: Firestore,
  options?: {
    limit?: number;
    status?: OperatorProposalStatus | "all";
    type?: OperatorProposalType | "all";
    search?: string;
  }
) {
  const limit = Math.max(1, Math.min(100, Number(options?.limit || 30)));

  const snap = await collectionRef(db)
    .orderBy("updatedAt", "desc")
    .limit(300)
    .get()
    .catch(() => null);

  if (!snap) return [];

  let items = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  })) as OperatorProposal[];

  if (options?.status && options.status !== "all") {
    items = items.filter((item) => item.status === options.status);
  }

  if (options?.type && options.type !== "all") {
    items = items.filter((item) => item.type === options.type);
  }

  const search = normalizeText(options?.search).toLowerCase();
  if (search) {
    items = items.filter((item) =>
      [
        item.title,
        item.description,
        item.rationale,
        item.type,
        item.generatedText,
        item.generatedImagePrompt,
        ...(Array.isArray(item.relatedFiles) ? item.relatedFiles : []),
        JSON.stringify(item.meta || {}),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }

  return items.slice(0, limit);
}

export async function updateOperatorProposalStatus(
  db: Firestore,
  input: {
    id: string;
    status: OperatorProposalStatus;
    rejectedReason?: string;
  }
) {
  const id = normalizeText(input.id);
  if (!id) {
    return { ok: false as const, error: "ID da proposta não informado." };
  }

  const status = normalizeProposalStatus(input.status);
  const ref = collectionRef(db).doc(id);
  const snap = await ref.get().catch(() => null);

  if (!snap?.exists) {
    return { ok: false as const, error: "Proposta não encontrada." };
  }

  const current = snap.data() as OperatorProposal;
  const now = nowIso();

  const patch: Record<string, unknown> = {
    status,
    updatedAt: now,
  };

  if (status === "approved") patch.approvedAt = now;
  if (status === "rejected") {
    patch.rejectedAt = now;
    patch.rejectedReason = normalizeText(input.rejectedReason);
  }
  if (status === "applied") patch.appliedAt = now;

  await ref.set(patch, { merge: true });

  const title = normalizeText(current?.title || "Proposta sem título");

  if (status === "approved") {
    await registerApprovalMemory(db, {
      approved: true,
      title,
    });
  }

  if (status === "rejected") {
    await registerApprovalMemory(db, {
      approved: false,
      title,
    });
  }

  await db.collection("system").doc("actions").collection("items").add({
    type: "operator-proposal",
    status:
      status === "approved"
        ? "success"
        : status === "rejected"
        ? "warning"
        : status === "applied"
        ? "success"
        : "info",
    message: `Proposta "${title}" atualizada para ${status}.`,
    meta: {
      proposalId: id,
      status,
      rejectedReason: normalizeText(input.rejectedReason),
    },
    createdAt: new Date(),
  });

  return {
    ok: true as const,
    id,
    status,
  };
}