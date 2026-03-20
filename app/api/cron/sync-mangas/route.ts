import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExtractChapterEntry = {
  number: number | null;
  title: string;
  url: string;
};

type ExtractPage = {
  index: number;
  url: string;
};

type MangaDocData = {
  sourceUrl?: string;
  sourceHost?: string;
  title?: string;
  cover?: string;
  banner?: string;
  genre?: string;
  description?: string;
  status?: string;
  author?: string;
  artist?: string;
  lastChapterNumber?: number;
  autoSync?: boolean;
  syncStatus?: string;
  lastSyncAt?: unknown;
  lastSyncError?: string;
};

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function getBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: text || "Resposta inválida",
    };
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET não configurado." },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = getAdminDb();

  if (!db) {
    return NextResponse.json(
      { ok: false, error: "Firebase Admin não configurado." },
      { status: 500 }
    );
  }

  const baseUrl = getBaseUrl();

  if (!baseUrl) {
    return NextResponse.json(
      { ok: false, error: "NEXT_PUBLIC_SITE_URL não configurado." },
      { status: 500 }
    );
  }

  try {
    const mangasSnap = await db
      .collection("mangas")
      .where("autoSync", "==", true)
      .limit(10)
      .get();

    let mangasProcessed = 0;
    let chaptersImported = 0;
    let chaptersSkipped = 0;
    const errors: string[] = [];

    for (const mangaDoc of mangasSnap.docs) {
      const mangaId = mangaDoc.id;
      const mangaData = (mangaDoc.data() || {}) as MangaDocData;

      const sourceUrl = String(mangaData.sourceUrl || "").trim();

      if (!sourceUrl) {
        await mangaDoc.ref.set(
          {
            syncStatus: "error",
            lastSyncError: "sourceUrl ausente",
            lastSyncAt: new Date(),
          },
          { merge: true }
        );

        errors.push(`${mangaId}: sourceUrl ausente`);
        continue;
      }

      mangasProcessed++;

      try {
        const mangaRes = await fetch(`${baseUrl}/api/admin/extract-manga`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mangaUrl: sourceUrl }),
          cache: "no-store",
        });

        const mangaJson = await parseJsonSafe(mangaRes);

        if (!mangaRes.ok || !mangaJson?.ok) {
          throw new Error(mangaJson?.error || "Falha ao analisar obra");
        }

        const chapters = (mangaJson.chapters || []) as ExtractChapterEntry[];

        const existingSnap = await db
          .collection("mangas")
          .doc(mangaId)
          .collection("chapters")
          .get();

        const existingIds = new Set(existingSnap.docs.map((d) => d.id));
        const existingSourceUrls = new Set(
          existingSnap.docs
            .map((d) => String(d.data().sourceUrl || "").trim())
            .filter(Boolean)
        );

        let maxChapterNumber = Number(mangaData.lastChapterNumber || 0);

        for (let i = 0; i < chapters.length; i++) {
          const chapter = chapters[i];

          const chapterNumber =
            chapter.number !== null && Number.isFinite(chapter.number)
              ? Math.trunc(chapter.number)
              : i + 1;

          if (!chapterNumber || chapterNumber < 1) {
            chaptersSkipped++;
            continue;
          }

          const chapterId = pad3(chapterNumber);

          if (existingIds.has(chapterId) || existingSourceUrls.has(chapter.url)) {
            chaptersSkipped++;
            maxChapterNumber = Math.max(maxChapterNumber, chapterNumber);
            continue;
          }

          const chapterRes = await fetch(`${baseUrl}/api/admin/extract-chapter`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chapterUrl: chapter.url,
            }),
            cache: "no-store",
          });

          const chapterJson = await parseJsonSafe(chapterRes);

          if (!chapterRes.ok || !chapterJson?.ok) {
            throw new Error(
              `Erro ao extrair ${chapter.title || chapter.url}: ${
                chapterJson?.error || "falha desconhecida"
              }`
            );
          }

          const pages = (chapterJson.pages || []) as ExtractPage[];

          if (!pages.length) {
            chaptersSkipped++;
            continue;
          }

          const chapterRef = db
            .collection("mangas")
            .doc(mangaId)
            .collection("chapters")
            .doc(chapterId);

          const previousSnap = await chapterRef.get();
          const previousData = previousSnap.exists ? previousSnap.data() : null;

          await chapterRef.set(
            {
              number: chapterNumber,
              title: chapter.title || `Capítulo ${chapterId}`,
              pagesCount: pages.length,
              pages,
              sourceUrl: chapter.url,
              views: previousData?.views ?? 0,
              dayViews: previousData?.dayViews ?? 0,
              weekViews: previousData?.weekViews ?? 0,
              monthViews: previousData?.monthViews ?? 0,
              createdAt: previousData?.createdAt || new Date(),
              updatedAt: new Date(),
            },
            { merge: true }
          );

          chaptersImported++;
          maxChapterNumber = Math.max(maxChapterNumber, chapterNumber);
        }

        const afterSnap = await db
          .collection("mangas")
          .doc(mangaId)
          .collection("chapters")
          .get();

        await mangaDoc.ref.set(
          {
            title: mangaJson.title || mangaData.title || "Sem título",
            cover: mangaJson.cover || mangaData.cover || "",
            banner: mangaJson.banner || mangaData.banner || mangaJson.cover || "",
            genre: mangaJson.genre || mangaData.genre || "",
            description: mangaJson.description || mangaData.description || "",
            status: mangaJson.status || mangaData.status || "",
            author: mangaJson.author || mangaData.author || "",
            artist: mangaJson.artist || mangaData.artist || "",
            chaptersCount: afterSnap.size,
            lastChapterNumber: maxChapterNumber,
            updatedAt: new Date(),
            lastSyncAt: new Date(),
            syncStatus: "active",
            lastSyncError: "",
            sourceUrl,
            sourceHost: (() => {
              try {
                return new URL(sourceUrl).hostname;
              } catch {
                return "";
              }
            })(),
            autoSync: true,
          },
          { merge: true }
        );
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Erro desconhecido";

        await mangaDoc.ref.set(
          {
            syncStatus: "error",
            lastSyncError: message,
            lastSyncAt: new Date(),
          },
          { merge: true }
        );

        errors.push(`${mangaId}: ${message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      mangasProcessed,
      chaptersImported,
      chaptersSkipped,
      errors,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sync failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}