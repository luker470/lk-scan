import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const base = req.nextUrl.origin;

  await fetch(`${base}/api/admin/stats`, {
    method: "POST",
    headers: {
      "x-admin-token": process.env.ADMIN_SYNC_TOKEN || "",
    },
  });

  return NextResponse.json({ ok: true });
}
