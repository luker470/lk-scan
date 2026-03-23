import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeString(value: unknown) {
  return String(value || "").trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = safeString(searchParams.get("uid"));

    if (!uid) {
      return NextResponse.json({ ok: false, items: [] }, { status: 400 });
    }

    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, items: [], error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const snap = await db
      .collection("users")
      .doc(uid)
      .collection("history")
      .orderBy("updatedAt", "desc")
      .limit(30)
      .get();

    const items = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    console.error("GET /api/history error:", error);

    const message =
      error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, items: [], error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const uid = safeString(body?.uid);
    const mangaId = safeString(body?.mangaId);
    const chapterId = safeString(body?.chapterId);
    const mangaTitle = safeString(body?.mangaTitle);
    const mangaCover = safeString(body?.mangaCover);
    const chapterTitle = safeString(body?.chapterTitle);
    const chapterNumber = safeNumber(body?.chapterNumber, 0);

    if (!uid || !mangaId || !chapterId) {
      return NextResponse.json(
        { ok: false, error: "Missing fields" },
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

    const now = new Date();

    const historyRef = db
      .collection("users")
      .doc(uid)
      .collection("history")
      .doc(mangaId);

    const progressRef = db
      .collection("users")
      .doc(uid)
      .collection("progress")
      .doc(mangaId);

    const userRef = db.collection("users").doc(uid);

    const batch = db.batch();

    batch.set(
      historyRef,
      {
        mangaId,
        chapterId,
        mangaTitle,
        mangaCover,
        chapterTitle,
        chapterNumber,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(
      progressRef,
      {
        mangaId,
        chapterId,
        chapterTitle,
        chapterNumber,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(
      userRef,
      {
        lastReadAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("POST /api/history error:", error);

    const message =
      error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}