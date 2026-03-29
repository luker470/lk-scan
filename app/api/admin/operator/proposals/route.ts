import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ADMIN_UID } from "@/lib/admin";
import {
  createOperatorProposal,
  listOperatorProposals,
  updateOperatorProposalStatus,
} from "@/lib/operatorProposalEngine";
import { getOperatorPolicySummary } from "@/lib/operatorPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: Request) {
  return req.headers.get("x-user-id") === ADMIN_UID;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function safeNumber(value: string | null, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
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

    const { searchParams } = new URL(req.url);
    const limit = Math.max(1, Math.min(100, safeNumber(searchParams.get("limit"), 30)));
    const status = normalizeText(searchParams.get("status")).toLowerCase() || "all";
    const type = normalizeText(searchParams.get("type")).toLowerCase() || "all";
    const search = normalizeText(searchParams.get("search"));

    const items = await listOperatorProposals(db, {
      limit,
      status: status as any,
      type: type as any,
      search,
    });

    const summary = {
      total: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      approved: items.filter((item) => item.status === "approved").length,
      rejected: items.filter((item) => item.status === "rejected").length,
      applied: items.filter((item) => item.status === "applied").length,
    };

    return NextResponse.json({
      ok: true,
      items,
      summary,
      policy: getOperatorPolicySummary(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
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

    const body = await req.json().catch(() => ({}));

    const result = await createOperatorProposal(db, {
      type: body?.type,
      title: body?.title,
      description: body?.description,
      rationale: body?.rationale,
      impact: body?.impact || "medium",
      risk: body?.risk || "medium",
      relatedFiles: Array.isArray(body?.relatedFiles) ? body.relatedFiles : [],
      generatedText: body?.generatedText || "",
      generatedImagePrompt: body?.generatedImagePrompt || "",
      meta: body?.meta || {},
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
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

    const body = await req.json().catch(() => ({}));

    const result = await updateOperatorProposalStatus(db, {
      id: body?.id,
      status: body?.status,
      rejectedReason: body?.rejectedReason || "",
    });

    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
