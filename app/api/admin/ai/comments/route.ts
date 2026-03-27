import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { analyzeComment } from "@/lib/ai/commentBrain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

function safeString(value: unknown) {
  return String(value || "").trim();
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const snap = await db
      .collectionGroup("comments")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get()
      .catch(async () => db.collectionGroup("comments").limit(30).get());

    const items = snap.docs.map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        path: doc.ref.path,
        text: safeString(data.text || data.message || data.content),
        authorName: safeString(data.authorName || data.userName || data.displayName),
        aiResponded: Boolean(data.aiResponded),
        aiResponse: safeString(data.aiResponse),
        aiClassification: safeString(data.aiClassification),
        needsReview: Boolean(data.needsReview),
        createdAt: data.createdAt || null,
      };
    });

    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const path = safeString(body?.path);

    if (!path) {
      return NextResponse.json(
        { ok: false, error: "Missing comment path" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const ref = db.doc(path);
    const snap = await ref.get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: "Comentário não encontrado." },
        { status: 404 }
      );
    }

    const data = snap.data() || {};
    const text = safeString(data.text || data.message || data.content);
    const analysis = analyzeComment(text);

    await ref.set(
      {
        aiClassification: analysis.classification,
        aiPriority: analysis.priority,
        aiSentiment: analysis.sentiment,
        toxicityScore: analysis.toxicityScore,
        needsReview: analysis.needsReview,
        aiResponse: analysis.suggestedResponse,
        aiResponded: true,
        aiUpdatedAt: new Date(),
      },
      { merge: true }
    );

    await db.collection("system").doc("actions").collection("items").add({
      type: "ai-comment-analysis",
      status: analysis.needsReview ? "warning" : "success",
      message: `Comentário analisado como ${analysis.classification}.`,
      meta: {
        path,
        classification: analysis.classification,
        priority: analysis.priority,
      },
      createdAt: new Date(),
    });

    if (analysis.needsReview) {
      await db.collection("system").doc("incidents").collection("items").add({
        title: `Comentário marcado para revisão: ${analysis.classification}`,
        type: "comment",
        severity: analysis.classification === "toxic" ? "high" : "warning",
        meta: {
          path,
          classification: analysis.classification,
        },
        resolved: false,
        createdAt: new Date(),
      });
    }

    return NextResponse.json({ ok: true, analysis });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}