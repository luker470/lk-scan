import { NextRequest, NextResponse } from "next/server";
import { getAdminBucket, getAdminDb } from "@/lib/firebaseAdmin";
import { runSourceHealthCheck } from "@/lib/sourceHealth";
import { discoverAndAutoImportFromSource } from "@/lib/discoveryAutoImport";
import { syncAllAutoSyncMangas } from "@/lib/autoSync";
import { normalizeAllExistingMangas } from "@/lib/mangaNormalizer";
import { backupAllAutoSyncMangas } from "@/lib/backupManager";
import { mirrorAllAutoSyncMangas } from "@/lib/storageBackup";
import { type DiscoverySourceKey } from "@/lib/discovery";

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
    const bucket = getAdminBucket();

    if (!db) {
      return NextResponse.json(
        { ok: false, error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const source = String(
      req.nextUrl.searchParams.get("source") || "mangaonlinered"
    ).trim() as DiscoverySourceKey;

    const maxChapters = Number(req.nextUrl.searchParams.get("maxChapters") || 3);

    const sourceHealth = await runSourceHealthCheck(db);
    const normalize = await normalizeAllExistingMangas(db);
    const autoImport = await discoverAndAutoImportFromSource(db, source, {
      maxChapters: maxChapters > 0 ? maxChapters : undefined,
      overwrite: false,
    });
    const sync = await syncAllAutoSyncMangas(db, {
      maxChapters: maxChapters > 0 ? maxChapters : undefined,
      overwrite: false,
    });
    const backup = await backupAllAutoSyncMangas(db);

    const mirror = bucket
      ? await mirrorAllAutoSyncMangas(db, bucket)
      : { ok: false, error: "Bucket não configurado." };

    return NextResponse.json({
      ok: true,
      mode: "cron-auto-system",
      source,
      sourceHealth,
      normalize,
      autoImport,
      sync,
      backup,
      mirror,
    });
  } catch (error: unknown) {
    console.error("GET /api/cron/auto-system error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro na automação total.",
      },
      { status: 500 }
    );
  }
}