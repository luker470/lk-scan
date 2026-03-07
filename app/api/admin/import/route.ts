import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_SYNC_TOKEN;
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

const ALLOWED_CHAPTER_HOSTS = new Set([
  "mangasonline.blog",
  "www.mangasonline.blog",
  "mangaonline.red",
  "www.mangaonline.red",
]);

function isAllowedChapterUrl(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return ALLOWED_CHAPTER_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function extractImageUrlsFromHtml(html: string) {
  const matches =
    html.match(/https?:\/\/[^\s"'<>]+?\.(?:jpe?g|png|webp|gif)(?:\?[^\s"'<>]+)?/gi) || [];

  const filtered = matches.filter((u) =>
    u.includes("/wp-content/uploads/WP-manga/data/")
  );

  const unique = Array.from(new Set(filtered));

  const num = (u: string) => {
    const clean = u.split("?")[0];
    const m = clean.match(/(\d+)\.(jpe?g|png|webp|gif)$/i);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
  };

  unique.sort((a, b) => {
    const na = num(a);
    const nb = num(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });

  return unique;
}

export async function POST(req: Request) {
  if (!isAuthed(req)) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const mangaId = body?.mangaId as string | undefined;
  const chapterNumber = Number(body?.chapterNumber);
  const chapterUrl = String(body?.chapterUrl || "");
  const overwriteExisting = Boolean(body?.overwriteExisting);

  if (!mangaId) return new NextResponse("Missing mangaId", { status: 400 });
  if (!chapterNumber || chapterNumber < 1) {
    return new NextResponse("Invalid chapterNumber", { status: 400 });
  }
  if (!chapterUrl || !chapterUrl.startsWith("http")) {
    return new NextResponse("Invalid chapterUrl", { status: 400 });
  }
  if (!isAllowedChapterUrl(chapterUrl)) {
    return new NextResponse("Chapter host not allowed", { status: 403 });
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);

  try {
    const db = getAdminDb();
    const chapterId = pad3(chapterNumber);
    const mangaRef = db.collection("mangas").doc(mangaId);
    const chapterRef = mangaRef.collection("chapters").doc(chapterId);

    const existingChapterSnap = await chapterRef.get();
    if (existingChapterSnap.exists && !overwriteExisting) {
      return new NextResponse(
        `Capítulo ${chapterId} já existe. Marque "Sobrescrever" para atualizar.`,
        { status: 409 }
      );
    }

    const sourceDuplicateSnap = await mangaRef
      .collection("chapters")
      .where("sourceUrl", "==", chapterUrl)
      .limit(1)
      .get();

    if (!sourceDuplicateSnap.empty && !overwriteExisting) {
      const dup = sourceDuplicateSnap.docs[0];
      return new NextResponse(
        `Essa sourceUrl já foi importada no capítulo ${dup.id}.`,
        { status: 409 }
      );
    }

    const u = new URL(chapterUrl);

    const res = await fetch(chapterUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
        Referer: `${u.protocol}//${u.host}/`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.status}`, { status: 502 });
    }

    const html = await res.text();
    const urls = extractImageUrlsFromHtml(html);

    if (urls.length === 0) {
      return new NextResponse(
        "Não encontrei imagens no HTML desse capítulo. Tente outro link.",
        { status: 400 }
      );
    }

    const pages = urls.map((url, i) => ({ index: i + 1, url }));
    const now = new Date();

    await chapterRef.set(
      {
        number: chapterNumber,
        title: `Capítulo ${chapterId}`,
        pagesCount: pages.length,
        pages,
        sourceUrl: chapterUrl,
        views: existingChapterSnap.data()?.views ?? 0,
        weekViews: existingChapterSnap.data()?.weekViews ?? 0,
        createdAt: existingChapterSnap.exists
          ? existingChapterSnap.data()?.createdAt || now
          : now,
        updatedAt: now,
      },
      { merge: true }
    );

    const chaptersSnap = await mangaRef.collection("chapters").get();
    const chaptersCount = chaptersSnap.size;

    let lastChapterNumber = 0;
    chaptersSnap.forEach((docSnap) => {
      const data = docSnap.data() as any;
      const n = Number(data.number || 0);
      if (n > lastChapterNumber) lastChapterNumber = n;
    });

    await mangaRef.set(
      {
        updatedAt: now,
        chaptersCount,
        lastChapterNumber,
      },
      { merge: true }
    );

    return new NextResponse(
      `Importado com sucesso: ${chapterId} (${pages.length} páginas). chaptersCount=${chaptersCount}, lastChapterNumber=${lastChapterNumber}`
    );
  } catch (e: any) {
    console.error(e);
    return new NextResponse(e?.message || "Import failed", { status: 500 });
  } finally {
    clearTimeout(t);
  }
}