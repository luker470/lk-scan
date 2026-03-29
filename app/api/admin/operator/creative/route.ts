import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import { buildOperatorStatus } from "@/lib/operatorCore";
import { generateOperatorIdeas, autoCreateIdeas } from "@/lib/operatorCreative";

export const runtime = "nodejs";

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const db = getAdminDb();
  if (!db) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const status = await buildOperatorStatus(db);

  const ideas = await generateOperatorIdeas(db, {
    metrics: status.metrics,
    queue: status.queue,
    incidents: status.latestIncidents,
    commentsAi: (status as any).commentsAi,
  });

  const created = await autoCreateIdeas(db, ideas);

  return NextResponse.json({
    ok: true,
    generated: ideas.length,
    created: created.length,
    ids: created,
  });
}