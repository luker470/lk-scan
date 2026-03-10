import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  const uid = req.headers.get("x-user-id");
  return uid === ADMIN_UID;
}

async function deleteCollectionBatch(
  db: FirebaseFirestore.Firestore,
  collectionRef: FirebaseFirestore.CollectionReference
) {
  const snap = await collectionRef.get();

  if (snap.empty) return;

  const batch = db.batch();

  snap.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

export async function PATCH(req: Request) {
  if (!isAuthed(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const db = getAdminDb();
    const body = await req.json();

    const mangaId = String(body?.mangaId || "");
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const genre = typeof body?.genre === "string" ? body.genre.trim() : "";
    const cover = typeof body?.cover === "string" ? body.cover.trim() : "";

    if (!mangaId) {
      return new NextResponse("Missing mangaId", { status: 400 });
    }

    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title) payload.title = title;
    if (genre) payload.genre = genre;
    if (cover) payload.cover = cover;

    await db.collection("mangas").doc(mangaId).set(payload, { merge: true });

    return new NextResponse("OK");
  } catch (e: any) {
    return new NextResponse(e?.message || "Failed", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isAuthed(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const db = getAdminDb();
    const { searchParams } = new URL(req.url);
    const mangaId = searchParams.get("mangaId") || "";

    if (!mangaId) {
      return new NextResponse("Missing mangaId", { status: 400 });
    }

    const mangaRef = db.collection("mangas").doc(mangaId);
    const chaptersRef = mangaRef.collection("chapters");

    const chaptersSnap = await chaptersRef.get();

    for (const chapterDoc of chaptersSnap.docs) {
      await deleteCollectionBatch(db, chapterDoc.ref.collection("comments"));
      await chapterDoc.ref.delete();
    }

    await mangaRef.delete();

    return new NextResponse("Deleted");
  } catch (e: any) {
    return new NextResponse(e?.message || "Failed", { status: 500 });
  }
}