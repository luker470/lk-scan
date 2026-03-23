import { NextRequest, NextResponse } from "next/server";
import {
  listAutomationQueue,
  listFailedAutomationQueue,
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
    const [items, failedItems] = await Promise.all([
      listAutomationQueue(40),
      listFailedAutomationQueue(20),
    ]);

    return NextResponse.json({
      ok: true,
      items,
      failedItems,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao carregar fila da automação.",
      },
      { status: 500 }
    );
  }
}