import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MangaSystemReportItem = {
  id: string;
  autoSync?: boolean;
  syncEnabled?: boolean;
  backupEnabled?: boolean;
  mirrorEnabled?: boolean;
  sourceHealth?: string;
  syncStatus?: string;
};

function isAuthed(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  const token = req.headers.get("x-admin-token");
  const envToken = process.env.ADMIN_SYNC_TOKEN;

  if (uid && uid === ADMIN_UID) return true;
  if (token && envToken && token === envToken) return true;

  return false;
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

    const items: MangaSystemReportItem[] = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, any>;

      return {
        id: doc.id,
        autoSync: Boolean(data?.autoSync),
        syncEnabled: Boolean(data?.syncEnabled),
        backupEnabled: Boolean(data?.backupEnabled),
        mirrorEnabled: Boolean(data?.mirrorEnabled),
        sourceHealth: String(data?.sourceHealth || ""),
        syncStatus: String(data?.syncStatus || ""),
      };
    });

    const totalMangas = items.length;
    const autoSyncCount = items.filter((item) => item.autoSync).length;
    const syncEnabledCount = items.filter((item) => item.syncEnabled).length;
    const backupEnabledCount = items.filter((item) => item.backupEnabled).length;
    const mirrorEnabledCount = items.filter((item) => item.mirrorEnabled).length;
    const healthyCount = items.filter((item) => item.sourceHealth === "healthy").length;
    const warningCount = items.filter((item) => item.sourceHealth === "warning").length;
    const errorCount = items.filter((item) => item.syncStatus === "error").length;
    const activeCount = items.filter((item) => item.syncStatus === "active").length;

    return NextResponse.json({
      ok: true,
      summary: {
        totalMangas,
        autoSyncCount,
        syncEnabledCount,
        backupEnabledCount,
        mirrorEnabledCount,
        healthyCount,
        warningCount,
        activeCount,
        errorCount,
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/admin/system-report error:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Erro ao gerar relatório do sistema.",
      },
      { status: 500 }
    );
  }
}