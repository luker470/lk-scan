import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = getAdminDb();

    const snap = await db
      .collection("mangas")
      .orderBy("views", "desc")
      .limit(10)
      .get();

    const items = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { error: "Failed", details: String(e) },
      { status: 500 }
    );
  }
}