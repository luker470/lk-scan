import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { sanitizeMangaTitle, slugify } from "@/lib/discovery";
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

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const { discoveredId } = await req.json();

    if (!discoveredId) {
      return NextResponse.json(
        { error: "discoveredId é obrigatório." },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const discoveredRef = db.collection("discovered_mangas").doc(discoveredId);
    const discoveredSnap = await discoveredRef.get();

    if (!discoveredSnap.exists) {
      return NextResponse.json(
        { error: "Item descoberto não encontrado." },
        { status: 404 }
      );
    }

    const discovered = discoveredSnap.data() as Record<string, any>;
    const cleanTitle = sanitizeMangaTitle(discovered?.title, discovered?.url);
    const mangaId = slugify(cleanTitle || `manga-${Date.now()}`);

    const mangaRef = db.collection("mangas").doc(mangaId);
    const mangaSnap = await mangaRef.get();

    if (!mangaSnap.exists) {
      await mangaRef.set({
        title: cleanTitle,
        slug: mangaId,
        cover: discovered?.cover || "",
        description: discovered?.description || "",
        genre: Array.isArray(discovered?.genres)
          ? discovered.genres.join(", ")
          : "",
        sourceUrl: discovered?.url || "",
        sourceSite: discovered?.source || "",
        latestChapter: discovered?.latestChapter || "",
        views: 0,
        chaptersCount: 0,
        status: "ongoing",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      await mangaRef.set(
        {
          title: cleanTitle || mangaSnap.data()?.title || "",
          cover: discovered?.cover || mangaSnap.data()?.cover || "",
          description:
            discovered?.description || mangaSnap.data()?.description || "",
          sourceUrl: discovered?.url || mangaSnap.data()?.sourceUrl || "",
          sourceSite: discovered?.source || mangaSnap.data()?.sourceSite || "",
          latestChapter:
            discovered?.latestChapter || mangaSnap.data()?.latestChapter || "",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await discoveredRef.set(
      {
        approved: true,
        approvedAt: FieldValue.serverTimestamp(),
        mangaId,
        cleanTitle,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      mangaId,
      title: cleanTitle,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Erro ao aprovar mangá descoberto.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}