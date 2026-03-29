import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { buildOperatorStatus, runOperatorCycle } from "@/lib/operatorCore";
import { answerOperatorQuestion } from "@/lib/ai/supportBrain";
import { getOperatorQueueStats } from "@/lib/operatorQueue";
import { runBasicRecovery } from "@/lib/operatorRecovery";
import {
  createOperatorReport,
  persistOperatorReport,
} from "@/lib/operatorReports";
import {
  storeOperatorMemory,
  upsertRecurringProblem,
} from "@/lib/operatorMemory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_COLLECTION = "system";
const CHAT_DOC_ID = "operatorChat";
const CHAT_MESSAGES_SUBCOLLECTION = "messages";
const ACTIONS_DOC_ID = "actions";
const ACTIONS_ITEMS_SUBCOLLECTION = "items";

const DEFAULT_GET_LIMIT = 50;
const MAX_GET_LIMIT = 100;
const DEFAULT_RETURN_LIMIT = 50;
const MAX_MESSAGE_CONTENT = 4000;

type ChatRole = "user" | "assistant" | "system";

type SaveMessageInput = {
  role: ChatRole;
  content: string;
  meta?: Record<string, unknown>;
};

type ChatActionResult = {
  ok: boolean;
  action: string;
  message: string;
  result?: unknown;
  status?: "success" | "warning" | "error";
};

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
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

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function compactText(value: unknown, max = 220) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function safeNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toDate(value: any) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  }

  if (typeof value?.seconds === "number") {
    const d = new Date(value.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value?._seconds === "number") {
    const d = new Date(value._seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function serializeValue(value: any): any {
  if (value == null) return value;

  const d = toDate(value);
  if (d) return d.toISOString();

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

function sanitizeMeta(meta?: Record<string, unknown>) {
  return serializeValue(meta || {}) as Record<string, unknown>;
}

function buildChatDocRef(db: FirebaseFirestore.Firestore) {
  return db.collection(SYSTEM_COLLECTION).doc(CHAT_DOC_ID);
}

function buildMessagesRef(db: FirebaseFirestore.Firestore) {
  return buildChatDocRef(db).collection(CHAT_MESSAGES_SUBCOLLECTION);
}

async function ensureChatRoot(db: FirebaseFirestore.Firestore) {
  await buildChatDocRef(db).set(
    {
      enabled: true,
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

async function saveMessage(
  db: FirebaseFirestore.Firestore,
  payload: SaveMessageInput
) {
  await ensureChatRoot(db);

  const now = new Date();
  const cleanContent = compactText(payload.content, MAX_MESSAGE_CONTENT);

  const ref = await buildMessagesRef(db).add({
    role: payload.role,
    content: cleanContent,
    meta: sanitizeMeta(payload.meta),
    createdAt: now,
    updatedAt: now,
  });

  await buildChatDocRef(db).set(
    {
      updatedAt: now,
      lastRole: payload.role,
      preview: cleanContent.slice(0, 220),
      lastMessageId: ref.id,
      totalMessages: FirebaseFirestore.FieldValue.increment(1),
    },
    { merge: true }
  );

  return ref.id;
}

async function listMessages(
  db: FirebaseFirestore.Firestore,
  limit = DEFAULT_GET_LIMIT
) {
  const finalLimit = clamp(limit, 1, MAX_GET_LIMIT);

  const snap = await buildMessagesRef(db)
    .orderBy("createdAt", "desc")
    .limit(finalLimit)
    .get()
    .catch(() => null);

  if (!snap) return [];

  return snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        role: (data.role || "system") as ChatRole,
        content: String(data.content || ""),
        createdAt: serializeValue(data.createdAt),
        updatedAt: serializeValue(data.updatedAt),
        meta: serializeValue(data.meta || {}),
      };
    })
    .reverse();
}

async function clearMessages(db: FirebaseFirestore.Firestore) {
  const messagesRef = buildMessagesRef(db);
  let totalRemoved = 0;

  while (true) {
    const snap = await messagesRef.limit(400).get().catch(() => null);

    if (!snap || snap.empty) break;

    const batch = db.batch();
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    totalRemoved += snap.size;

    if (snap.size < 400) break;
  }

  await buildChatDocRef(db).set(
    {
      updatedAt: new Date(),
      preview: "",
      lastRole: "system",
      totalMessages: 0,
      lastMessageId: null,
    },
    { merge: true }
  );

  return totalRemoved;
}

async function registerAction(
  db: FirebaseFirestore.Firestore,
  status: "success" | "warning" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await db
    .collection(SYSTEM_COLLECTION)
    .doc(ACTIONS_DOC_ID)
    .collection(ACTIONS_ITEMS_SUBCOLLECTION)
    .add({
      type: "operator-chat",
      status,
      message,
      meta: sanitizeMeta(meta),
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
    .collection(SYSTEM_COLLECTION)
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

  const ref = await db
    .collection(SYSTEM_COLLECTION)
    .doc("incidents")
    .collection("items")
    .add({
      title,
      type,
      severity,
      resolved: false,
      meta: sanitizeMeta(meta),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  return { ok: true as const, created: true as const, id: ref.id };
}

async function runChatAction(
  db: FirebaseFirestore.Firestore,
  action: string
): Promise<ChatActionResult | null> {
  if (action === "run-operator") {
    const result = await runOperatorCycle(db);

    return {
      ok: !!result?.ok,
      action,
      result,
      status: result?.ok ? "success" : "warning",
      message: result?.ok
        ? "Ciclo principal do LK AI Operator executado com sucesso."
        : "O ciclo principal do LK AI Operator foi executado com alertas.",
    };
  }

  if (action === "run-recovery") {
    const result = await runBasicRecovery(db);

    return {
      ok: !!result?.ok,
      action,
      result,
      status: result?.ok ? "success" : "warning",
      message: result?.ok
        ? "Recovery automático executado com sucesso."
        : "Recovery automático executado com alertas.",
    };
  }

  if (action === "refresh-queue") {
    const result = await getOperatorQueueStats(db).catch(() => null);

    return {
      ok: true,
      action,
      result,
      status: "success",
      message: "Fila operacional atualizada com sucesso.",
    };
  }

  if (action === "generate-report") {
    const status = await buildOperatorStatus(db);
    const report = createOperatorReport(status.metrics, status.learning || []);
    const persisted = await persistOperatorReport(db, report);

    return {
      ok: true,
      action,
      result: {
        report,
        id: persisted.id,
      },
      status: "success",
      message: `Relatório operacional gerado com sucesso (${persisted.id}).`,
    };
  }

  return null;
}

function normalizeQuestion(body: any) {
  return normalizeText(body?.message || body?.question);
}

function buildGetPayload(status: any, messages: any[]) {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    messages,
    status,
    center: status.center || null,
    queue: status.queue || null,
    queuePreview: status.queuePreview || [],
    commentsAi: (status as any).commentsAi || null,
    incidents: status.latestIncidents || [],
    reports: status.latestReports || [],
    actions: status.latestActions || [],
    memoryInsights: status.memoryInsights || null,
    recommendations: status.recommendations || [],
  };
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return noStoreJson(
      { ok: false, error: "Unauthorized" },
      401
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return noStoreJson(
        { ok: false, error: "Firebase Admin não configurado." },
        500
      );
    }

    const { searchParams } = new URL(req.url);
    const limit = safeNumber(searchParams.get("limit"), DEFAULT_GET_LIMIT);

    const [messages, status] = await Promise.all([
      listMessages(db, limit),
      buildOperatorStatus(db),
    ]);

    return noStoreJson(buildGetPayload(status, messages), 200);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal error";

    return noStoreJson(
      { ok: false, error: message },
      500
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return noStoreJson(
      { ok: false, error: "Unauthorized" },
      401
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return noStoreJson(
        { ok: false, error: "Firebase Admin não configurado." },
        500
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = normalizeText(body?.action).toLowerCase();

    if (action === "clear") {
      const removed = await clearMessages(db);

      await saveMessage(db, {
        role: "system",
        content: "Histórico do chat do operador reiniciado.",
        meta: { removed, action: "clear" },
      });

      await registerAction(
        db,
        "success",
        "Histórico do Operator Chat foi limpo.",
        { removed }
      );

      const status = await buildOperatorStatus(db);

      return noStoreJson({
        ok: true,
        cleared: true,
        removed,
        messages: await listMessages(db, DEFAULT_RETURN_LIMIT),
        status,
      });
    }

    if (action) {
      const result = await runChatAction(db, action);

      if (result) {
        await saveMessage(db, {
          role: "system",
          content: result.message,
          meta: {
            action,
            ok: result.ok,
            status: result.status || "success",
            result: serializeValue(result.result),
          },
        });

        await registerAction(
          db,
          result.status || (result.ok ? "success" : "warning"),
          result.message,
          {
            action,
            result: serializeValue(result.result),
          }
        );

        await storeOperatorMemory(db, {
          type: "operator-chat-action",
          success: result.ok,
          impactScore: result.ok ? 6 : -6,
          title: `Ação executada no chat: ${action}`,
          summary: result.message,
          context: {
            action,
            result: serializeValue(result.result),
          },
        }).catch(() => null);

        if (!result.ok) {
          await createIncident(
            db,
            `Operator Chat action falhou: ${action}`,
            "warning",
            {
              action,
              result: serializeValue(result.result),
            },
            "operator"
          );

          await upsertRecurringProblem(db, {
            key: `chat-action::failure::${action}`,
            title: `Falhas recorrentes na ação do chat: ${action}`,
            type: "operator",
            severity: "warning",
            meta: {
              action,
            },
          }).catch(() => null);
        }

        const status = await buildOperatorStatus(db);

        return noStoreJson({
          ok: true,
          executedAction: action,
          actionResult: result,
          messages: await listMessages(db, DEFAULT_RETURN_LIMIT),
          status,
        });
      }
    }

    const question = normalizeQuestion(body);

    if (!question) {
      return noStoreJson(
        { ok: false, error: "Mensagem vazia." },
        400
      );
    }

    const status = await buildOperatorStatus(db);

    const answer = answerOperatorQuestion({
      question,
      metrics: status.metrics,
      learning: status.learning || [],
      queue: status.queue || undefined,
      commentsAi: (status as any).commentsAi || undefined,
      incidents: status.latestIncidents || [],
      reports: status.latestReports || [],
      actions: status.latestActions || [],
      center: status.center || undefined,
    });

    await saveMessage(db, {
      role: "user",
      content: question,
      meta: {
        source: "admin-operator-chat",
        healthAtQuestionTime: status.health || "warning",
        generatedAt: status.generatedAt || new Date().toISOString(),
      },
    });

    await saveMessage(db, {
      role: "assistant",
      content: answer.answer,
      meta: {
        highlights: answer.highlights || [],
        warnings: answer.warnings || [],
        recommendations: answer.recommendations || [],
        generatedFromStatusAt:
          status.generatedAt || new Date().toISOString(),
        health: status.health || "warning",
        queue: serializeValue(status.queue || {}),
        center: serializeValue(status.center || {}),
        queuePreview: serializeValue(status.queuePreview || []),
        commentsAi: serializeValue((status as any).commentsAi || {}),
        latestIncidents: serializeValue(status.latestIncidents || []),
        latestReports: serializeValue(status.latestReports || []),
        latestActions: serializeValue(status.latestActions || []),
      },
    });

    await registerAction(
      db,
      "success",
      "Pergunta respondida pelo Operator Chat.",
      {
        question: compactText(question, 300),
        health: status.health || "",
        queue: serializeValue(status.queue || {}),
        commentsAi: serializeValue((status as any).commentsAi || {}),
      }
    );

    await storeOperatorMemory(db, {
      type: "operator-chat-question",
      success: true,
      impactScore: 4,
      title: "Pergunta respondida pelo Operator Chat",
      summary: compactText(question, 220),
      context: {
        health: status.health || "",
        generatedAt: status.generatedAt || "",
      },
    }).catch(() => null);

    return noStoreJson({
      ok: true,
      reply: {
        answer: answer.answer,
        highlights: answer.highlights || [],
        warnings: answer.warnings || [],
        recommendations: answer.recommendations || [],
      },
      messages: await listMessages(db, DEFAULT_RETURN_LIMIT),
      status,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal error";

    try {
      const db = getAdminDb();

      if (db) {
        await registerAction(
          db,
          "error",
          "Falha ao processar requisição do Operator Chat.",
          {
            error: message,
          }
        );

        await storeOperatorMemory(db, {
          type: "operator-chat-error",
          success: false,
          impactScore: -8,
          title: "Falha no Operator Chat",
          summary: message,
          context: {},
        }).catch(() => null);

        await upsertRecurringProblem(db, {
          key: "chat::fatal-error",
          title: "Falhas fatais no Operator Chat",
          type: "operator",
          severity: "high",
          meta: {
            error: message,
          },
        }).catch(() => null);
      }
    } catch (nested) {
      console.error("Erro ao registrar falha do chat:", nested);
    }

    return noStoreJson(
      { ok: false, error: message },
      500
    );
  }
}