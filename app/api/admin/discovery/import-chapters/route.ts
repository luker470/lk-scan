// app/api/admin/discovery/import-chapters/route.ts
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import {
  buildChapterId,
  discoverChaptersFromMangaUrl,
} from "@/lib/chapterDiscovery";

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
    const body = await req.json();
    const mangaId = String(body?.mangaId || "").trim();
    const sourceUrl = String(body?.sourceUrl || "").trim();
    const maxChapters = Number(body?.maxChapters || 0);
    const overwrite = Boolean(body?.overwrite);

    if (!mangaId) {
      return NextResponse.json(
        { error: "mangaId é obrigatório." },
        { status: 400 }
      );
    }

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "sourceUrl é obrigatório." },
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

    const mangaRef = db.collection("mangas").doc(mangaId);
    const mangaSnap = await mangaRef.get();

    if (!mangaSnap.exists) {
      return NextResponse.json(
        { error: "Mangá não encontrado." },
        { status: 404 }
      );
    }

    const chapters = await discoverChaptersFromMangaUrl(sourceUrl, {
      maxChapters: maxChapters > 0 ? maxChapters : undefined,
    });

    if (!chapters.length) {
      return NextResponse.json(
        { error: "Nenhum capítulo válido foi encontrado." },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;
    let withPages = 0;

    for (const chapter of chapters) {
      const chapterId = buildChapterId(chapter.number, chapter.title);
      const chapterRef = mangaRef.collection("chapters").doc(chapterId);
      const existingSnap = await chapterRef.get();

      if (existingSnap.exists && !overwrite) {
        skipped += 1;
        continue;
      }

      const payload = {
        title: chapter.title || `Capítulo ${chapter.number}`,
        number: chapter.number || 0,
        slug: chapterId,
        sourceUrl: chapter.url,
        sourceSite: chapter.source,
        pages: chapter.pages || [],
        images: chapter.pages || [],
        pagesCount: Array.isArray(chapter.pages) ? chapter.pages.length : 0,
        views: existingSnap.data()?.views || 0,
        createdAt: existingSnap.exists
          ? existingSnap.data()?.createdAt || FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await chapterRef.set(payload, { merge: true });

      imported += 1;
      if ((chapter.pages || []).length > 0) {
        withPages += 1;
      }
    }

    const allChaptersSnap = await mangaRef.collection("chapters").get();
    const allChapters = allChaptersSnap.docs.map((doc) => doc.data() as any);

    const chaptersCount = allChapters.length;
    const sortedByNumber = [...allChapters].sort(
      (a, b) => Number(a?.number || 0) - Number(b?.number || 0)
    );
    const lastChapter = sortedByNumber[sortedByNumber.length - 1];

    await mangaRef.set(
      {
        sourceUrl,
        sourceHost: new URL(sourceUrl).hostname,
        autoSync: true,
        syncStatus: "active",
        lastSyncError: "",
        chaptersCount,
        lastChapterNumber: Number(lastChapter?.number || 0),
        latestChapter: lastChapter?.title || "",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({
      ok: true,
      mangaId,
      imported,
      skipped,
      withPages,
      totalFound: chapters.length,
      chaptersCount,
      latestChapter: lastChapter?.title || "",
      lastChapterNumber: Number(lastChapter?.number || 0),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erro ao importar capítulos automaticamente." },
      { status: 500 }
    );
  }
}