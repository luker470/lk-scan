import { NextRequest, NextResponse } from "next/server";
import {
  getAutomationConfig,
  processAutomationQueue,
  scheduleDueAutomationTasks,
} from "@/lib/automationCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCronAuthorized(req: NextRequest) {
  const bearer = req.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET || "";
  const querySecret = req.nextUrl.searchParams.get("secret") || "";

  return (
    (!!cronSecret && bearer === `Bearer ${cronSecret}`) ||
    (!!cronSecret && querySecret === cronSecret)
  );
}

function resolveOrigin(req: NextRequest) {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (siteUrl) {
    return siteUrl.replace(/\/+$/, "");
  }

  const vercelUrl = String(process.env.VERCEL_URL || "").trim();
  if (vercelUrl) {
    return vercelUrl.startsWith("http")
      ? vercelUrl.replace(/\/+$/, "")
      : `https://${vercelUrl.replace(/\/+$/, "")}`;
  }

  return req.nextUrl.origin.replace(/\/+$/, "");
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const config = await getAutomationConfig();

    if (!config?.enabled) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "Automação desativada.",
      });
    }

    const origin = resolveOrigin(req);

    const scheduled = await scheduleDueAutomationTasks();

    const processed = await processAutomationQueue({
      limit: Math.max(1, Number(config?.processBatchSize ?? 2)),
      origin,
    });

    return NextResponse.json({
      ok: true,
      origin,
      scheduled,
      processed,
      processBatchSize: Math.max(1, Number(config?.processBatchSize ?? 2)),
      ranAt: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro no cron central.",
      },
      { status: 500 }
    );
  }
}