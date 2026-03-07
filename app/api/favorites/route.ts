import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { uid, mangaId, title, cover, genre } = await req.json();

    if (!uid || !mangaId) {
      return NextResponse.json({ error: "Missing uid/mangaId" }, { status: 400 });
    }

    const db = getAdminDb();
    const favRef = db.collection("users").doc(uid).collection("favorites").doc(mangaId);
    const snap = await favRef.get();

    if (snap.exists) {
      await favRef.delete();
      return NextResponse.json({ ok: true, favorited: false });
    }

    await favRef.set(
      {
        mangaId,
        title: title || "",
        cover: cover || "",
        genre: genre || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, favorited: true });
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
      .collection("favorites")
      .orderBy("createdAt", "desc")
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