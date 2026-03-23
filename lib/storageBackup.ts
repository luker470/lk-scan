import type { Bucket } from "@google-cloud/storage";
import type { Firestore } from "firebase-admin/firestore";
import crypto from "node:crypto";

export type MirrorPageResult = {
  index: number;
  sourceUrl: string;
  storagePath?: string;
  publicUrl?: string;
  ok: boolean;
  error?: string;
};

export type MirrorChapterResult = {
  mangaId: string;
  chapterId: string;
  mirrored: number;
  skipped: number;
  errorCount: number;
  pages: MirrorPageResult[];
  ok: boolean;
  error?: string;
};

function hashUrl(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function extFromUrl(url: string) {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".webp")) return "webp";
  if (clean.endsWith(".jpeg")) return "jpeg";
  if (clean.endsWith(".jpg")) return "jpg";
  return "jpg";
}

function buildPublicUrl(bucketName: string, filePath: string) {
  return `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(filePath).replace(/%2F/g, "/")}`;
}

async function fetchBinary(url: string) {
  const origin = new URL(url).origin;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Referer: origin,
      Origin: origin,
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Falha ao baixar imagem: HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await res.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

export async function mirrorChapterPagesToStorage(
  db: Firestore,
  bucket: Bucket,
  mangaId: string,
  chapterId: string
): Promise<MirrorChapterResult> {
  const chapterRef = db
    .collection("mangas")
    .doc(mangaId)
    .collection("chapters")
    .doc(chapterId);

  const chapterSnap = await chapterRef.get();

  if (!chapterSnap.exists) {
    throw new Error(`Capítulo não encontrado: ${mangaId}/${chapterId}`);
  }

  const chapter = chapterSnap.data() as Record<string, any>;
  const pages: string[] = Array.isArray(chapter?.pages)
    ? chapter.pages
    : Array.isArray(chapter?.images)
    ? chapter.images
    : [];

  if (!pages.length) {
    return {
      mangaId,
      chapterId,
      mirrored: 0,
      skipped: 0,
      errorCount: 0,
      pages: [],
      ok: false,
      error: "Capítulo sem páginas para espelhar.",
    };
  }

  const bucketName = bucket.name;
  const pageResults: MirrorPageResult[] = [];
  let mirrored = 0;
  let skipped = 0;
  let errorCount = 0;

  for (let i = 0; i < pages.length; i += 1) {
    const sourceUrl = String(pages[i] || "").trim();

    if (!sourceUrl) {
      skipped += 1;
      pageResults.push({
        index: i,
        sourceUrl: "",
        ok: false,
        error: "URL vazia.",
      });
      continue;
    }

    try {
      const ext = extFromUrl(sourceUrl);
      const fileHash = hashUrl(sourceUrl);
      const storagePath = `mirrors/${mangaId}/${chapterId}/${String(i + 1).padStart(4, "0")}-${fileHash}.${ext}`;
      const file = bucket.file(storagePath);

      const [exists] = await file.exists();

      if (!exists) {
        const { buffer, contentType } = await fetchBinary(sourceUrl);

        await file.save(buffer, {
          metadata: {
            contentType,
            cacheControl: "public, max-age=31536000, immutable",
          },
          resumable: false,
        });
      }

      const publicUrl = buildPublicUrl(bucketName, storagePath);

      pageResults.push({
        index: i,
        sourceUrl,
        storagePath,
        publicUrl,
        ok: true,
      });

      mirrored += 1;
    } catch (error: unknown) {
      errorCount += 1;
      pageResults.push({
        index: i,
        sourceUrl,
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao espelhar página.",
      });
    }
  }

  const mirroredPages = pageResults
    .filter((item) => item.ok && item.publicUrl)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.publicUrl as string);

  await chapterRef.set(
    {
      mirror: {
        enabled: mirroredPages.length > 0,
        status: mirroredPages.length > 0 ? "ready" : "partial",
        updatedAt: new Date(),
        pages: mirroredPages,
        pagesCount: mirroredPages.length,
        originalsCount: pages.length,
        items: pageResults,
      },
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return {
    mangaId,
    chapterId,
    mirrored,
    skipped,
    errorCount,
    pages: pageResults,
    ok: mirroredPages.length > 0,
    error: mirroredPages.length > 0 ? "" : "Nenhuma página foi espelhada com sucesso.",
  };
}

export async function mirrorAllChaptersOfManga(
  db: Firestore,
  bucket: Bucket,
  mangaId: string
) {
  const chaptersSnap = await db
    .collection("mangas")
    .doc(mangaId)
    .collection("chapters")
    .get();

  const results: MirrorChapterResult[] = [];

  for (const doc of chaptersSnap.docs) {
    try {
      const result = await mirrorChapterPagesToStorage(db, bucket, mangaId, doc.id);
      results.push(result);
    } catch (error: unknown) {
      results.push({
        mangaId,
        chapterId: doc.id,
        mirrored: 0,
        skipped: 0,
        errorCount: 1,
        pages: [],
        ok: false,
        error: error instanceof Error ? error.message : "Erro ao espelhar capítulo.",
      });
    }
  }

  return {
    mangaId,
    totalChapters: results.length,
    okCount: results.filter((item) => item.ok).length,
    errorCount: results.filter((item) => !item.ok).length,
    mirroredTotal: results.reduce((sum, item) => sum + item.mirrored, 0),
    results,
  };
}

export async function mirrorAllAutoSyncMangas(
  db: Firestore,
  bucket: Bucket
) {
  const mangasSnap = await db.collection("mangas").where("autoSync", "==", true).get();

  const results: Array<{
    mangaId: string;
    title: string;
    ok: boolean;
    mirroredTotal: number;
    totalChapters: number;
    errorCount: number;
    error?: string;
  }> = [];

  for (const doc of mangasSnap.docs) {
    const data = doc.data() as Record<string, any>;

    try {
      const result = await mirrorAllChaptersOfManga(db, bucket, doc.id);

      await doc.ref.set(
        {
          mirrorEnabled: true,
          mirrorLastRunAt: new Date(),
          mirrorPagesCount: result.mirroredTotal,
          updatedAt: new Date(),
        },
        { merge: true }
      );

      results.push({
        mangaId: doc.id,
        title: String(data?.title || doc.id),
        ok: result.errorCount === 0,
        mirroredTotal: result.mirroredTotal,
        totalChapters: result.totalChapters,
        errorCount: result.errorCount,
      });
    } catch (error: unknown) {
      results.push({
        mangaId: doc.id,
        title: String(data?.title || doc.id),
        ok: false,
        mirroredTotal: 0,
        totalChapters: 0,
        errorCount: 1,
        error: error instanceof Error ? error.message : "Erro ao espelhar mangá.",
      });
    }
  }

  return {
    totalMangas: results.length,
    okCount: results.filter((item) => item.ok).length,
    errorCount: results.filter((item) => !item.ok).length,
    mirroredTotal: results.reduce((sum, item) => sum + item.mirroredTotal, 0),
    results,
  };
}