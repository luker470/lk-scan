import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import admin from "firebase-admin";

export const runtime = "nodejs";

function getWeekBucket(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export async function POST(req: Request) {
  try {
    const { mangaId, chapterId } = await req.json();

    if (!mangaId || !chapterId) {
      return NextResponse.json({ error: "Missing mangaId/chapterId" }, { status: 400 });
    }

    const db = getAdminDb();
    const now = new Date();
    const weekBucket = getWeekBucket(now);

    const mangaRef = db.collection("mangas").doc(mangaId);
    const chapterRef = mangaRef.collection("chapters").doc(chapterId);

    await db.runTransaction(async (tx) => {
      const [mangaSnap, chapterSnap] = await Promise.all([
        tx.get(mangaRef),
        tx.get(chapterRef),
      ]);

      const mangaData = mangaSnap.exists ? (mangaSnap.data() as any) : {};
      const chapterData = chapterSnap.exists ? (chapterSnap.data() as any) : {};

      const sameMangaWeek = mangaData.weekBucket === weekBucket;
      const sameChapterWeek = chapterData.weekBucket === weekBucket;

      tx.set(
        mangaRef,
        {
          views: admin.firestore.FieldValue.increment(1),
          weekViews: sameMangaWeek ? admin.firestore.FieldValue.increment(1) : 1,
          weekBucket,
          updatedAt: now,
        },
        { merge: true }
      );

      tx.set(
        chapterRef,
        {
          views: admin.firestore.FieldValue.increment(1),
          weekViews: sameChapterWeek ? admin.firestore.FieldValue.increment(1) : 1,
          weekBucket,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    return NextResponse.json({ ok: true, weekBucket });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed", details: String(e) }, { status: 500 });
  }
}