import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";

function isAuthed(req: NextRequest) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ ok: false });

  const cacheRef = db.collection("system_cache").doc("stats");
  const snap = await cacheRef.get();

  return NextResponse.json({
    ok: true,
    stats: snap.data() || null,
  });
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ ok: false });

  const mangas = await db.collection("mangas").get();

  let totalViews = 0;
  let totalWeekViews = 0;
  let totalChapters = 0;
  let autoSyncCount = 0;

  const items = mangas.docs.map((d) => d.data());

  for (const item of items) {
    totalViews += item.views || 0;
    totalWeekViews += item.weekViews || 0;
    totalChapters += item.chaptersCount || 0;
    if (item.autoSync) autoSyncCount++;
  }

  const stats = {
    totalMangas: items.length,
    totalViews,
    totalWeekViews,
    totalChapters,
    autoSyncCount,
    updatedAt: Date.now(),
  };

  await db.collection("system_cache").doc("stats").set(stats);

  return NextResponse.json({ ok: true, stats });
}