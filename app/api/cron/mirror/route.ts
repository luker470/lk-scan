import { NextRequest, NextResponse } from "next/server";
import { getAdminBucket, getAdminDb } from "@/lib/firebaseAdmin";
import { mirrorAllAutoSyncMangas } from "@/lib/storageBackup";

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
    return NextResponse.json({ ok: false, error: "Cron não autorizado." }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const bucket = getAdminBucket();

    if (!db || !bucket) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin ou Storage não configurado." },
        { status: 500 }
      );
    }

    const result = await mirrorAllAutoSyncMangas(db, bucket);

    return NextResponse.json({
      ok: true,
      mode: "cron-mirror",
      ...result,
    });
  } catch (error: unknown) {
    console.error("GET /api/cron/mirror error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro no cron de mirror.",
      },
      { status: 500 }
    );
  }
}