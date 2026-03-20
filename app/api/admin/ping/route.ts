import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  const token = req.headers.get("x-admin-token");
  const envToken = process.env.ADMIN_SYNC_TOKEN;

  if (uid && uid === ADMIN_UID) return true;
  if (token && envToken && token === envToken) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
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

    const ref = db.collection("_debug").doc("ping");
    const now = new Date();

    await ref.set(
      {
        ok: true,
        source: "admin-ping",
        updatedAt: now,
      },
      { merge: true }
    );

    const snap = await ref.get();

    return NextResponse.json({
      ok: true,
      exists: snap.exists,
      data: snap.data() || null,
    });
  } catch (error: unknown) {
    console.error("GET /api/admin/ping error:", error);

    const message =
      error instanceof Error ? error.message : "Erro interno";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}