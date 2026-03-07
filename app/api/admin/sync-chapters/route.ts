import { NextResponse } from "next/server";
import { getAdminBucket, getAdminDb } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 🔥 evita cache no Vercel

function chapterToNumber(ch: string) {
  const n = parseInt(ch, 10);
  return Number.isFinite(n) ? n : 0;
}

function isImage(name: string) {
  return /\.(jpg|jpeg|png|webp)$/i.test(name);
}

export async function POST(req: Request) {
  try {
    // 🔒 proteção (agora não quebra se não existir ENV)
    const token = req.headers.get("x-admin-token") || "";
    const expected = process.env.ADMIN_SYNC_TOKEN;

    if (expected && token !== expected) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const db = getAdminDb();
    const bucket = getAdminBucket();

    const mangasSnap = await db.collection("mangas").get();

    let chaptersUpdated = 0;
    let mangasProcessed = 0;

    for (const mangaDoc of mangasSnap.docs) {
      const mangaId = mangaDoc.id;
      mangasProcessed++;

      const [files] = await bucket.getFiles({
        prefix: `mangas/${mangaId}/chapters/`,
      });

      const chaptersMap = new Map<string, string[]>();

      for (const f of files) {
        const path = f.name;
        const parts = path.split("/");

        if (parts.length < 5) continue;

        const chapterId = parts[3];
        const fileName = parts[4];

        if (!isImage(fileName)) continue;

        if (!chaptersMap.has(chapterId)) {
          chaptersMap.set(chapterId, []);
        }

        chaptersMap.get(chapterId)!.push(path);
      }

      for (const [chapterId, pathList] of chaptersMap.entries()) {
        pathList.sort((a, b) => a.localeCompare(b));

        const pages: string[] = [];

        for (const path of pathList) {
          const file = bucket.file(path);

          const [url] = await file.getSignedUrl({
            action: "read",
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10,
          });

          pages.push(url);
        }

        const chapterRef = db
          .collection("mangas")
          .doc(mangaId)
          .collection("chapters")
          .doc(chapterId);

        await chapterRef.set(
          {
            number: chapterToNumber(chapterId),
            pages,
            pagesCount: pages.length,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        chaptersUpdated++;
      }

      await db.collection("mangas").doc(mangaId).set(
        {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      ok: true,
      mangasProcessed,
      chaptersUpdated,
    });

  } catch (error: any) {
    console.error("SYNC ERROR:", error);

    return new NextResponse("Internal Server Error", { status: 500 });
  }
}