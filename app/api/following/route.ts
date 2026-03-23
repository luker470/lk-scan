import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeString(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const uid = safeString(body?.uid);
    const mangaId = safeString(body?.mangaId);
    const title = safeString(body?.title);
    const cover = safeString(body?.cover);
    const genre = safeString(body?.genre);

    if (!uid || !mangaId) {
      return NextResponse.json(
        { ok: false, error: "Missing uid/mangaId" },
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

    const followRef = db
      .collection("users")
      .doc(uid)
      .collection("following")
      .doc(mangaId);

    const snap = await followRef.get();

    if (snap.exists) {
      await followRef.delete();
      return NextResponse.json({ ok: true, following: false });
    }

    await followRef.set(
      {
        mangaId,
        title,
        cover,
        genre,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, following: true });
  } catch (error: unknown) {
    console.error("POST /api/following error:", error);

    const message =
      error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const uid = safeString(req.nextUrl.searchParams.get("uid"));

    if (!uid) {
      return NextResponse.json(
        { ok: false, items: [], error: "Missing uid" },
        { status: 400 }
      );
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
      .collection("following")
      .orderBy("createdAt", "desc")
      .get();

    const items = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error: unknown) {
    console.error("GET /api/following error:", error);

    const message =
      error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, items: [], error: message },
      { status: 500 }
    );
  }
}