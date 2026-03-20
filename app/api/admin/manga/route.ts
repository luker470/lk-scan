// app/api/admin/manga/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  const uid = req.headers.get("x-user-id");
  return uid === ADMIN_UID;
}

function isValidHttpUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function deleteCollectionBatch(
  db: FirebaseFirestore.Firestore,
  collectionRef: FirebaseFirestore.CollectionReference,
  batchSize = 400
) {
  while (true) {
    const snap = await collectionRef.limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();

    if (snap.size < batchSize) break;
  }
}

export async function PATCH(req: Request) {
  if (!isAuthed(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return new NextResponse("Firebase Admin não configurado.", {
        status: 500,
      });
    }

    const body = await req.json().catch(() => null);

    const mangaId = String(body?.mangaId || "").trim();
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const genre = typeof body?.genre === "string" ? body.genre.trim() : "";
    const cover = typeof body?.cover === "string" ? body.cover.trim() : "";
    const banner = typeof body?.banner === "string" ? body.banner.trim() : "";
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    const status = typeof body?.status === "string" ? body.status.trim() : "";
    const author = typeof body?.author === "string" ? body.author.trim() : "";
    const artist = typeof body?.artist === "string" ? body.artist.trim() : "";
    const sourceUrl =
      typeof body?.sourceUrl === "string" ? body.sourceUrl.trim() : "";
    const autoSync = Boolean(body?.autoSync);

    if (!mangaId) {
      return new NextResponse("Missing mangaId", { status: 400 });
    }

    if (cover && !isValidHttpUrl(cover)) {
      return new NextResponse("Link da capa inválido.", { status: 400 });
    }

    if (banner && !isValidHttpUrl(banner)) {
      return new NextResponse("Link do banner inválido.", { status: 400 });
    }

    if (sourceUrl && !isValidHttpUrl(sourceUrl)) {
      return new NextResponse("SourceUrl inválida.", { status: 400 });
    }

    const payload: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (title) payload.title = title;
    if (genre) payload.genre = genre;
    if (cover) payload.cover = cover;
    if (banner) payload.banner = banner;
    if (description) payload.description = description;
    if (status) payload.status = status;
    if (author) payload.author = author;
    if (artist) payload.artist = artist;

    payload.autoSync = autoSync && !!sourceUrl;

    if (sourceUrl) {
      payload.sourceUrl = sourceUrl;
      payload.sourceHost = new URL(sourceUrl).hostname;
      payload.syncStatus = autoSync ? "active" : "";
      payload.lastSyncError = "";
    } else {
      payload.sourceUrl = "";
      payload.sourceHost = "";
      payload.autoSync = false;
      payload.syncStatus = "";
    }

    await db.collection("mangas").doc(mangaId).set(payload, { merge: true });

    return new NextResponse("OK");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return new NextResponse(message, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!isAuthed(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return new NextResponse("Firebase Admin não configurado.", {
        status: 500,
      });
    }

    const { searchParams } = new URL(req.url);
    const mangaId = (searchParams.get("mangaId") || "").trim();

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

    await deleteCollectionBatch(db, mangaRef.collection("comments"));
    await mangaRef.delete();

    return new NextResponse("Deleted");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed";
    return new NextResponse(message, { status: 500 });
  }
}