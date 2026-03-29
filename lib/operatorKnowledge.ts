import type { Firestore } from "firebase-admin/firestore";

export type OperatorKnowledgeType =
  | "source-pattern"
  | "recovery-pattern"
  | "comment-pattern"
  | "ux-insight"
  | "catalog-insight"
  | "infra-insight"
  | "approval-pattern"
  | "generic";

export type OperatorKnowledgeItem = {
  id?: string;
  type: OperatorKnowledgeType;
  title: string;
  summary: string;
  confidence: number;
  relevance: number;
  tags: string[];
  source: string;
  meta?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

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

function normalizeTags(tags?: unknown) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => normalizeText(tag).toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

function collectionRef(db: Firestore) {
  return db.collection("system").doc("operatorKnowledge").collection("items");
}

export async function addOperatorKnowledge(
  db: Firestore,
  input: OperatorKnowledgeItem
) {
  const now = nowIso();

  const payload = {
    type: (normalizeText(input.type) || "generic") as OperatorKnowledgeType,
    title: normalizeText(input.title),
    summary: normalizeText(input.summary),
    confidence: Math.max(0, Math.min(100, safeNumber(input.confidence, 50))),
    relevance: Math.max(0, Math.min(100, safeNumber(input.relevance, 50))),
    tags: normalizeTags(input.tags),
    source: normalizeText(input.source) || "lk-ai-operator",
    meta: input.meta || {},
    createdAt: input.createdAt || now,
    updatedAt: now,
  };

  if (!payload.title || !payload.summary) {
    return { ok: false as const, error: "Conhecimento sem título/resumo." };
  }

  const existingSnap = await collectionRef(db)
    .where("title", "==", payload.title)
    .limit(1)
    .get()
    .catch(() => null);

  if (existingSnap && !existingSnap.empty) {
    const doc = existingSnap.docs[0];
    await doc.ref.set(payload, { merge: true });
    return { ok: true as const, created: false as const, id: doc.id };
  }

  const ref = await collectionRef(db).add(payload);
  return { ok: true as const, created: true as const, id: ref.id };
}

export async function listOperatorKnowledge(
  db: Firestore,
  options?: {
    limit?: number;
    type?: OperatorKnowledgeType | "all";
    tag?: string;
    search?: string;
  }
) {
  const limit = Math.max(1, Math.min(100, safeNumber(options?.limit, 20)));
  const snap = await collectionRef(db)
    .orderBy("updatedAt", "desc")
    .limit(200)
    .get()
    .catch(() => null);

  if (!snap) return [];

  let items = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as any),
  })) as OperatorKnowledgeItem[];

  if (options?.type && options.type !== "all") {
    items = items.filter((item) => item.type === options.type);
  }

  const tag = normalizeText(options?.tag).toLowerCase();
  if (tag) {
    items = items.filter((item) => normalizeTags(item.tags).includes(tag));
  }

  const search = normalizeText(options?.search).toLowerCase();
  if (search) {
    items = items.filter((item) =>
      [
        item.title,
        item.summary,
        item.type,
        ...(Array.isArray(item.tags) ? item.tags : []),
        JSON.stringify(item.meta || {}),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }

  return items.slice(0, limit);
}

export async function buildKnowledgeFromOperationalState(
  db: Firestore,
  input: {
    totalBrokenChapters?: number;
    sourcesCritical?: number;
    sourcesWarning?: number;
    last24hImportedChapters?: number;
    unresolvedIncidents?: number;
    queueQueued?: number;
  }
) {
  const createdIds: string[] = [];

  if ((input.totalBrokenChapters || 0) > 0) {
    const result = await addOperatorKnowledge(db, {
      type: "recovery-pattern",
      title: "Capítulos quebrados exigem recovery prioritário",
      summary: `Foram detectados ${input.totalBrokenChapters || 0} capítulo(s) quebrado(s). O sistema deve priorizar validate + recovery + reimport quando necessário.`,
      confidence: 90,
      relevance: 95,
      tags: ["reader", "recovery", "chapter", "priority"],
      source: "operator-decision-engine",
      meta: input,
    });
    if (result.ok) createdIds.push(result.id);
  }

  if ((input.sourcesCritical || 0) > 0) {
    const result = await addOperatorKnowledge(db, {
      type: "source-pattern",
      title: "Fontes críticas devem reduzir prioridade automática",
      summary: `Existem ${input.sourcesCritical || 0} fonte(s) crítica(s). O operador deve usar fallback e reduzir dependência dessas fontes.`,
      confidence: 88,
      relevance: 92,
      tags: ["source", "fallback", "health", "import"],
      source: "operator-decision-engine",
      meta: input,
    });
    if (result.ok) createdIds.push(result.id);
  }

  if (
    (input.last24hImportedChapters || 0) === 0 &&
    ((input.sourcesWarning || 0) > 0 || (input.sourcesCritical || 0) > 0)
  ) {
    const result = await addOperatorKnowledge(db, {
      type: "infra-insight",
      title: "Baixa importação recente combinada com saúde ruim das fontes",
      summary:
        "A falta de importações recentes junto com fontes em alerta sugere gargalo na automação de descoberta/importação.",
      confidence: 85,
      relevance: 89,
      tags: ["automation", "import", "source-health", "diagnostic"],
      source: "operator-decision-engine",
      meta: input,
    });
    if (result.ok) createdIds.push(result.id);
  }

  if ((input.unresolvedIncidents || 0) > 0 && (input.queueQueued || 0) > 0) {
    const result = await addOperatorKnowledge(db, {
      type: "infra-insight",
      title: "Incidentes em aberto e fila acumulada exigem priorização",
      summary:
        "Quando incidentes em aberto e fila acumulada acontecem juntos, a IA deve entrar em modo de estabilização operacional.",
      confidence: 84,
      relevance: 91,
      tags: ["incident", "queue", "stabilization"],
      source: "operator-decision-engine",
      meta: input,
    });
    if (result.ok) createdIds.push(result.id);
  }

  return {
    ok: true,
    createdCount: createdIds.length,
    ids: createdIds,
  };
}
