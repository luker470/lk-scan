import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { uid, mangaId, chapterId, mangaTitle, mangaCover, chapterTitle } = await req.json();

    if (!uid || !mangaId || !chapterId) {
      return NextResponse.json({ error: "Missing uid/mangaId/chapterId" }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("users").doc(uid).collection("history").doc(mangaId);

    await ref.set(
      {
        mangaId,
        chapterId,
        mangaTitle: mangaTitle || "",
        mangaCover: mangaCover || "",
        chapterTitle: chapterTitle || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "Failed", details: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const uid = req.nextUrl.searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
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
      ...(d.data() as Record<string, unknown>),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json({ error: "Failed", details: String(e) }, { status: 500 });
  }
}