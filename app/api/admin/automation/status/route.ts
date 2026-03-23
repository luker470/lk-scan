import { NextRequest, NextResponse } from "next/server";
import {
  getAutomationStatus,
  updateAutomationConfig,
} from "@/lib/automationCore";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  return uid === ADMIN_UID;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const status = await getAutomationStatus();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao buscar status da automação.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json(
      { ok: false, error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const config = await updateAutomationConfig(body || {});

    return NextResponse.json({
      ok: true,
      config,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao atualizar configuração da automação.",
      },
      { status: 500 }
    );
  }
}