import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
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

function tsSeconds(value: any) {
  return value?.seconds ?? value?._seconds ?? 0;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const snap = await db.collection("mangas").get();

    const items = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, any>;

      return {
        id: doc.id,
        title: String(data?.title || "Sem título"),
        sourceUrl: String(data?.sourceUrl || ""),
        autoSync: Boolean(data?.autoSync),
        syncStatus: String(data?.syncStatus || ""),
        lastSyncError: String(data?.lastSyncError || ""),
        chaptersCount: Number(data?.chaptersCount || 0),
        lastChapterNumber: Number(data?.lastChapterNumber || 0),
        latestChapter: String(data?.latestChapter || ""),
        syncImportedLastRun: Number(data?.syncImportedLastRun || 0),
        syncSkippedLastRun: Number(data?.syncSkippedLastRun || 0),
        syncFoundLastRun: Number(data?.syncFoundLastRun || 0),
        syncLastRunAt: data?.syncLastRunAt || null,
        updatedAt: data?.updatedAt || null,
      };
    });

    const autoSyncItems = items.filter((item) => item.autoSync);
    const errorItems = autoSyncItems.filter(
      (item) =>
        item.syncStatus === "error" ||
        Boolean(item.lastSyncError?.trim())
    );

    const activeItems = autoSyncItems.filter(
      (item) => item.syncStatus === "active"
    );

    const recentItems = [...autoSyncItems]
      .sort((a, b) => tsSeconds(b.syncLastRunAt) - tsSeconds(a.syncLastRunAt))
      .slice(0, 20);

    return NextResponse.json({
      ok: true,
      summary: {
        totalMangas: items.length,
        autoSyncCount: autoSyncItems.length,
        activeCount: activeItems.length,
        errorCount: errorItems.length,
      },
      errorItems: errorItems.slice(0, 20),
      recentItems,
    });
  } catch (error: unknown) {
    console.error("GET /api/admin/sync-status error:", error);

    const message =
      error instanceof Error ? error.message : "Erro ao carregar status.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}