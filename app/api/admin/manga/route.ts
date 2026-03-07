import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_SYNC_TOKEN;
}

export async function PATCH(req: Request) {
  if (!isAuthed(req)) return new NextResponse("Unauthorized", { status: 401 });

  const { mangaId, title, genre, cover } = await req.json();

  if (!mangaId) return new NextResponse("Missing mangaId", { status: 400 });

  const db = getAdminDb();

  const data: any = {};
  if (typeof title === "string" && title.trim()) data.title = title.trim();
  if (typeof genre === "string" && genre.trim()) data.genre = genre.trim();
  if (typeof cover === "string" && cover.trim()) data.cover = cover.trim();
  data.updatedAt = new Date();

  await db.collection("mangas").doc(mangaId).set(data, { merge: true });

  return new NextResponse("OK");
}

export async function DELETE(req: Request) {
  if (!isAuthed(req)) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const mangaId = searchParams.get("mangaId");
  if (!mangaId) return new NextResponse("Missing mangaId", { status: 400 });

  const db = getAdminDb();

  // apaga capítulos primeiro
  const chaptersRef = db.collection("mangas").doc(mangaId).collection("chapters");
  const snap = await chaptersRef.get();

  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  // apaga o manga
  await db.collection("mangas").doc(mangaId).delete();

  return new NextResponse("DELETED");
}