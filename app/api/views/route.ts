import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  buildUpdatedUserProgress,
  getDayKey,
  getMonthKey,
  getWeekKey,
} from "@/lib/userProgress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeString(value: unknown) {
  return String(value || "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const mangaId = safeString(body?.mangaId);
    const chapterId = safeString(body?.chapterId);
    const uid = safeString(body?.uid);

    if (!mangaId || !chapterId) {
      return NextResponse.json(
        { ok: false, error: "Missing mangaId or chapterId" },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const now = new Date();
    const dayKey = getDayKey(now);
    const weekKey = getWeekKey(now);
    const monthKey = getMonthKey(now);

    const mangaRef = db.collection("mangas").doc(mangaId);
    const chapterRef = mangaRef.collection("chapters").doc(chapterId);

    const mangaSnap = await mangaRef.get();
    const chapterSnap = await chapterRef.get();

    if (!mangaSnap.exists || !chapterSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "Manga or chapter not found" },
        { status: 404 }
      );
    }

    const batch = db.batch();

    const mangaData = mangaSnap.data() || {};
    const chapterData = chapterSnap.data() || {};

    const currentMangaDayKey = mangaData.dayBucket || null;
    const currentMangaWeekKey = mangaData.weekBucket || null;
    const currentMangaMonthKey = mangaData.monthBucket || null;

    const currentChapterDayKey = chapterData.dayBucket || null;
    const currentChapterWeekKey = chapterData.weekBucket || null;
    const currentChapterMonthKey = chapterData.monthBucket || null;

    const nextMangaDayViews =
      currentMangaDayKey === dayKey ? Number(mangaData.dayViews || 0) + 1 : 1;
    const nextMangaWeekViews =
      currentMangaWeekKey === weekKey ? Number(mangaData.weekViews || 0) + 1 : 1;
    const nextMangaMonthViews =
      currentMangaMonthKey === monthKey ? Number(mangaData.monthViews || 0) + 1 : 1;

    const nextChapterDayViews =
      currentChapterDayKey === dayKey ? Number(chapterData.dayViews || 0) + 1 : 1;
    const nextChapterWeekViews =
      currentChapterWeekKey === weekKey ? Number(chapterData.weekViews || 0) + 1 : 1;
    const nextChapterMonthViews =
      currentChapterMonthKey === monthKey ? Number(chapterData.monthViews || 0) + 1 : 1;

    batch.set(
      mangaRef,
      {
        views: Number(mangaData.views || 0) + 1,
        dayViews: nextMangaDayViews,
        weekViews: nextMangaWeekViews,
        monthViews: nextMangaMonthViews,
        dayBucket: dayKey,
        weekBucket: weekKey,
        monthBucket: monthKey,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(
      chapterRef,
      {
        views: Number(chapterData.views || 0) + 1,
        dayViews: nextChapterDayViews,
        weekViews: nextChapterWeekViews,
        monthViews: nextChapterMonthViews,
        dayBucket: dayKey,
        weekBucket: weekKey,
        monthBucket: monthKey,
        updatedAt: now,
      },
      { merge: true }
    );

    if (uid) {
      const userRef = db.collection("users").doc(uid);
      const readKey = `${mangaId}_${chapterId}`;
      const readRef = userRef.collection("readChapters").doc(readKey);
      const progressRef = userRef.collection("progress").doc(mangaId);
      const historyRef = userRef.collection("history").doc(mangaId);

      const [userSnap, readSnap] = await Promise.all([userRef.get(), readRef.get()]);

      if (userSnap.exists && !readSnap.exists) {
        const userData = userSnap.data() || {};
        const isVip = Boolean(userData.isVip);
        const earnedXp = isVip ? 15 : 10;

        const nextProgress = buildUpdatedUserProgress(userData, earnedXp);

        batch.set(
          userRef,
          {
            ...nextProgress,
            updatedAt: now,
            lastReadAt: now,
          },
          { merge: true }
        );

        batch.set(
          readRef,
          {
            mangaId,
            chapterId,
            earnedXp,
            createdAt: now,
          },
          { merge: true }
        );
      } else if (userSnap.exists) {
        batch.set(
          userRef,
          {
            lastReadAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      batch.set(
        progressRef,
        {
          mangaId,
          chapterId,
          updatedAt: now,
        },
        { merge: true }
      );

      const mangaTitle = safeString(mangaData.title);
      const chapterTitle =
        safeString(chapterData.title) ||
        `Capítulo ${safeString(chapterData.number || chapterId)}`;

      batch.set(
        historyRef,
        {
          mangaId,
          mangaTitle,
          mangaCover: safeString(mangaData.cover),
          chapterId,
          chapterTitle,
          chapterNumber: Number(chapterData.number || 0),
          updatedAt: now,
        },
        { merge: true }
      );
    }

    await batch.commit();

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error("POST /api/views error:", error);

    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}