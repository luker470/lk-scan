import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { backupAllAutoSyncMangas } from "@/lib/backupManager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronAuthorized(req: NextRequest) {
  const querySecret = req.nextUrl.searchParams.get("secret");
  const headerSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const envSecret = process.env.CRON_SECRET;

  if (!envSecret) return false;
  if (querySecret && querySecret === envSecret) return true;
  if (headerSecret && headerSecret === envSecret) return true;
  if (authHeader === `Bearer ${envSecret}`) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Cron não autorizado." },
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

    const result = await backupAllAutoSyncMangas(db);

    return NextResponse.json({
      ok: true,
      mode: "cron-backup",
      ...result,
    });
  } catch (error: unknown) {
    console.error("GET /api/cron/backup error:", error);

    const message =
      error instanceof Error ? error.message : "Erro no cron de backup.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
