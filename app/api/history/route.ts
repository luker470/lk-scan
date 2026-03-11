import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = String(searchParams.get("uid") || "").trim();

    if (!uid) {
      return NextResponse.json({ ok: false, items: [] }, { status: 400 });
    }

    const db = getAdminDb();
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
  } catch (error: any) {
    console.error("GET /api/history error:", error);
    return NextResponse.json({ ok: false, items: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const uid = String(body?.uid || "").trim();
    const mangaId = String(body?.mangaId || "").trim();
    const chapterId = String(body?.chapterId || "").trim();
    const mangaTitle = String(body?.mangaTitle || "").trim();
    const mangaCover = String(body?.mangaCover || "").trim();
    const chapterTitle = String(body?.chapterTitle || "").trim();

    if (!uid || !mangaId || !chapterId) {
      return NextResponse.json({ ok: false, error: "Missing fields" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date();
    const docId = `${mangaId}_${chapterId}`;

    await db
      .collection("users")
      .doc(uid)
      .collection("history")
      .doc(docId)
      .set(
        {
          mangaId,
          chapterId,
          mangaTitle,
          mangaCover,
          chapterTitle,
          updatedAt: now,
        },
        { merge: true }
      );

    await db.collection("users").doc(uid).set(
      {
        lastReadAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("POST /api/history error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}