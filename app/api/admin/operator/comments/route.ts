import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { analyzeComment } from "@/lib/ai/commentBrain";
import { enqueueOperatorTask } from "@/lib/operatorQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentDoc = {
  text?: string;
  authorName?: string;
  uid?: string;
  createdAt?: any;
  updatedAt?: any;
  aiResponded?: boolean;
  aiResponse?: string;
  aiClassification?: string;
  aiPriority?: number;
  aiSentiment?: "positive" | "neutral" | "negative";
  needsReview?: boolean;
  moderationStatus?: string;
  aiAnalyzedAt?: any;
  hidden?: boolean;
  reportedCount?: number;
};

type ListedComment = CommentDoc & {
  id: string;
  path: string;
  mangaTitle?: string;
  mangaId?: string;
  chapterId?: string;
};

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toDate(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value;
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

function buildAiResponse(params: {
  text: string;
  classification: string;
  suggestedResponse: string;
}) {
  const text = normalizeText(params.text);
  const classification = lower(params.classification);

  if (classification === "bug") {
    return "Obrigado por avisar. O LK AI Operator já registrou esse problema para revisão automática, recovery e priorização de correção.";
  }

  if (classification === "question") {
    return "Recebemos sua dúvida. O sistema vai tentar responder com base no status atual da obra e do site.";
  }

  if (classification === "request") {
    return "Pedido registrado. O LK AI Operator vai considerar essa solicitação nas prioridades de catálogo, discovery e atualização.";
  }

  if (classification === "spoiler") {
    return "Seu comentário foi marcado para revisão por possível spoiler antes de permanecer visível.";
  }

  if (classification === "toxic") {
    return "Seu comentário foi sinalizado para revisão por linguagem inadequada.";
  }

  if (classification === "praise") {
    return "Obrigado pelo apoio. Ficamos felizes que você esteja curtindo o conteúdo do LK-SCAN.";
  }

  if (text.length <= 6) {
    return "Obrigado pelo comentário.";
  }

  return params.suggestedResponse || "Obrigado pelo comentário.";
}

async function registerAction(
  db: FirebaseFirestore.Firestore,
  status: "success" | "warning" | "error",
  message: string,
  meta?: Record<string, unknown>
) {
  await db.collection("system").doc("actions").collection("items").add({
    type: "operator-comments",
    status,
    message,
    meta: meta || {},
    createdAt: new Date(),
  });
}

async function hasOpenIncident(
  db: FirebaseFirestore.Firestore,
  title: string,
  type: string
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

async function registerIncident(
  db: FirebaseFirestore.Firestore,
  title: string,
  severity: "warning" | "high",
  meta?: Record<string, unknown>
) {
  const exists = await hasOpenIncident(db, title, "comment");
  if (exists) {
    return { ok: true as const, created: false as const };
  }

  await db.collection("system").doc("incidents").collection("items").add({
    title,
    type: "comment",
    severity,
    resolved: false,
    meta: meta || {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { ok: true as const, created: true as const };
}

async function listRecentComments(
  db: FirebaseFirestore.Firestore,
  limitValue = 50
) {
  const finalLimit = clamp(limitValue, 1, 120);
  const mangasSnap = await db.collection("mangas").limit(300).get().catch(() => null);
  if (!mangasSnap) return [];

  const items: ListedComment[] = [];

  for (const mangaDoc of mangasSnap.docs) {
    const manga = mangaDoc.data() || {};
    const mangaTitle = String(manga.title || "");

    const commentsSnap = await mangaDoc.ref
      .collection("comments")
      .limit(40)
      .get()
      .catch(() => null);

    if (commentsSnap && !commentsSnap.empty) {
      for (const commentDoc of commentsSnap.docs) {
        items.push({
          id: commentDoc.id,
          path: commentDoc.ref.path,
          mangaTitle,
          mangaId: mangaDoc.id,
          ...(commentDoc.data() as CommentDoc),
        });
      }
    }

    const chaptersSnap = await mangaDoc.ref
      .collection("chapters")
      .limit(80)
      .get()
      .catch(() => null);

    if (!chaptersSnap) continue;

    for (const chapterDoc of chaptersSnap.docs) {
      const chapterCommentsSnap = await chapterDoc.ref
        .collection("comments")
        .limit(30)
        .get()
        .catch(() => null);

      if (!chapterCommentsSnap || chapterCommentsSnap.empty) continue;

      for (const commentDoc of chapterCommentsSnap.docs) {
        items.push({
          id: commentDoc.id,
          path: commentDoc.ref.path,
          mangaTitle,
          mangaId: mangaDoc.id,
          chapterId: chapterDoc.id,
          ...(commentDoc.data() as CommentDoc),
        });
      }
    }
  }

  return items
    .sort((a, b) => {
      const ad = toDate(a.createdAt)?.getTime() || 0;
      const bd = toDate(b.createdAt)?.getTime() || 0;
      return bd - ad;
    })
    .slice(0, finalLimit)
    .map((item) => serializeValue(item));
}

async function analyzeAndPersistComment(
  db: FirebaseFirestore.Firestore,
  params: {
    path: string;
    force?: boolean;
  }
) {
  const snap = await db.doc(params.path).get().catch(() => null);

  if (!snap?.exists) {
    return {
      ok: false,
      error: "Comentário não encontrado.",
    };
  }

  const data = (snap.data() || {}) as CommentDoc;
  const text = normalizeText(data.text);

  if (!text) {
    return {
      ok: false,
      error: "Comentário vazio.",
    };
  }

  if (!params.force && data.aiResponded) {
    return {
      ok: true,
      skipped: true,
      path: params.path,
      comment: serializeValue(data),
    };
  }

  const analysis = analyzeComment(text);
  const aiResponse = buildAiResponse({
    text,
    classification: analysis.classification,
    suggestedResponse: analysis.suggestedResponse,
  });

  const now = new Date();

  await snap.ref.set(
    {
      aiResponded: true,
      aiResponse,
      aiClassification: analysis.classification,
      aiPriority: analysis.priority,
      aiSentiment: analysis.sentiment,
      needsReview: analysis.needsReview,
      moderationStatus: analysis.needsReview ? "pending-review" : "approved",
      aiAnalyzedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  const pathParts = params.path.split("/");
  const mangaId = pathParts[1] || "";
  const chapterId =
    pathParts.length >= 6 && pathParts[2] === "chapters" ? pathParts[3] : "";

  if (analysis.classification === "bug" && mangaId) {
    await enqueueOperatorTask(db, {
      type: chapterId ? "validate-chapter" : "validate-manga",
      priority: analysis.priority >= 85 ? "high" : "normal",
      mangaId,
      chapterId: chapterId || undefined,
      title: chapterId
        ? `Validar capítulo ${chapterId} após comentário de bug`
        : `Validar mangá ${mangaId} após comentário de bug`,
      description:
        "Comentário da comunidade classificado como bug. Validação automática necessária.",
      maxAttempts: 3,
      dedupeKey: `comment-bug::${mangaId}::${chapterId || "root"}::${snap.id}`,
      meta: {
        origin: "comment-ai",
        commentPath: params.path,
        classification: analysis.classification,
      },
    });

    await registerIncident(
      db,
      chapterId
        ? `Comentário indicou possível bug no capítulo ${chapterId}.`
        : `Comentário indicou possível bug no mangá ${mangaId}.`,
      analysis.priority >= 85 ? "high" : "warning",
      {
        mangaId,
        chapterId,
        commentPath: params.path,
      }
    );
  }

  if (analysis.classification === "request") {
    await enqueueOperatorTask(db, {
      type: "discover-source",
      priority: "normal",
      title: "Analisar pedido vindo de comentário",
      description:
        "Comentário do usuário pediu obra/conteúdo e deve influenciar discovery/catalogação.",
      mangaId,
      dedupeKey: `comment-request::${mangaId || "unknown"}::${snap.id}`,
      maxAttempts: 2,
      meta: {
        origin: "comment-ai",
        commentPath: params.path,
        classification: analysis.classification,
        text,
      },
    });

    await registerAction(
      db,
      "success",
      "Comentário classificado como pedido relevante para catálogo.",
      {
        path: params.path,
        mangaId,
        chapterId,
        classification: analysis.classification,
      }
    );
  }

  if (analysis.classification === "toxic" || analysis.classification === "spoiler") {
    await registerIncident(
      db,
      `Comentário exige revisão (${analysis.classification}).`,
      analysis.classification === "toxic" ? "high" : "warning",
      {
        path: params.path,
        mangaId,
        chapterId,
        classification: analysis.classification,
      }
    );
  }

  await registerAction(
    db,
    analysis.needsReview ? "warning" : "success",
    "Comentário analisado pela IA com persistência concluída.",
    {
      path: params.path,
      classification: analysis.classification,
      priority: analysis.priority,
      needsReview: analysis.needsReview,
    }
  );

  const updatedSnap = await snap.ref.get().catch(() => null);

  return {
    ok: true,
    skipped: false,
    path: params.path,
    comment: serializeValue(updatedSnap?.data() || {}),
  };
}

function buildStats(items: any[]) {
  return {
    total: items.length,
    pending: items.filter((item) => !item.aiResponded).length,
    review: items.filter((item) => item.needsReview).length,
    bug: items.filter((item) => item.aiClassification === "bug").length,
    question: items.filter((item) => item.aiClassification === "question").length,
    request: items.filter((item) => item.aiClassification === "request").length,
    praise: items.filter((item) => item.aiClassification === "praise").length,
    toxic: items.filter((item) => item.aiClassification === "toxic").length,
    spoiler: items.filter((item) => item.aiClassification === "spoiler").length,
    hidden: items.filter((item) => item.hidden).length,
    reported: items.filter((item) => n(item.reportedCount) > 0).length,
  };
}

function filterItems(items: any[], filter: string) {
  if (!filter) return items;

  if (filter === "pending") {
    return items.filter((item: any) => !item.aiResponded);
  }

  if (filter === "review") {
    return items.filter((item: any) => item.needsReview);
  }

  if (filter === "reported") {
    return items.filter((item: any) => n(item.reportedCount) > 0);
  }

  if (filter === "hidden") {
    return items.filter((item: any) => !!item.hidden);
  }

  return items.filter((item: any) => lower(item.aiClassification) === filter);
}

async function analyzeBatch(
  db: FirebaseFirestore.Firestore,
  params: {
    limit: number;
    filter: string;
    force: boolean;
  }
) {
  const sourceItems = await listRecentComments(db, Math.max(params.limit * 3, params.limit));
  const filtered = filterItems(sourceItems, params.filter).slice(0, params.limit);

  const results = [];

  for (const item of filtered) {
    const result = await analyzeAndPersistComment(db, {
      path: String(item.path || ""),
      force: params.force,
    });
    results.push(result);
  }

  return results;
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const limitValue = clamp(Number(searchParams.get("limit") || 50), 1, 120);
    const filter = lower(searchParams.get("filter"));
    const search = lower(searchParams.get("search"));

    let items = await listRecentComments(db, limitValue);

    items = filterItems(items, filter);

    if (search) {
      items = items.filter((item: any) => {
        const haystack = [
          item.text,
          item.authorName,
          item.mangaTitle,
          item.mangaId,
          item.chapterId,
          item.aiClassification,
          item.path,
        ]
          .map((value) => lower(value))
          .join(" ");
        return haystack.includes(search);
      });
    }

    return NextResponse.json({
      ok: true,
      items,
      stats: buildStats(items),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const action = lower(body?.action);
    const force = !!body?.force;

    if (action === "analyze-batch") {
      const limitValue = clamp(Number(body?.limit || 10), 1, 30);
      const filter = lower(body?.filter);

      const results = await analyzeBatch(db, {
        limit: limitValue,
        filter,
        force,
      });

      return NextResponse.json({
        ok: true,
        action,
        results,
        total: results.length,
        success: results.filter((item) => item?.ok).length,
        skipped: results.filter((item: any) => item?.skipped).length,
      });
    }

    const path = normalizeText(body?.path);

    if (!path) {
      return NextResponse.json(
        { ok: false, error: "Path do comentário não informado." },
        { status: 400 }
      );
    }

    const result = await analyzeAndPersistComment(db, {
      path,
      force,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}