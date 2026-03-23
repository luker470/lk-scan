import { NextRequest, NextResponse } from "next/server";
import {
  enqueueAutomationTask,
  processAutomationQueue,
  retryAllFailedAutomationTasks,
  retryAutomationTask,
  scheduleDueAutomationTasks,
} from "@/lib/automationCore";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  return uid === ADMIN_UID;
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
    const action = String(body?.action || "process");
    const origin = req.nextUrl.origin;

    if (action === "schedule") {
      const result = await scheduleDueAutomationTasks();
      return NextResponse.json(result);
    }

    if (action === "enqueue") {
      const type = String(body?.type || "");

      if (!["discovery", "sync", "cleanup", "source-health"].includes(type)) {
        return NextResponse.json(
          { ok: false, error: "Tipo inválido." },
          { status: 400 }
        );
      }

      const taskId = await enqueueAutomationTask({
        type: type as any,
        priority: Number(body?.priority ?? 10),
        payload: body?.payload || {},
      });

      return NextResponse.json({
        ok: true,
        taskId,
      });
    }

    if (action === "run-now") {
      const type = String(body?.type || "");

      if (!["discovery", "sync", "cleanup", "source-health"].includes(type)) {
        return NextResponse.json(
          { ok: false, error: "Tipo inválido." },
          { status: 400 }
        );
      }

      await enqueueAutomationTask({
        type: type as any,
        priority: 1,
        payload: body?.payload || {},
      });

      const result = await processAutomationQueue({
        limit: 1,
        origin,
      });

      return NextResponse.json(result);
    }

    if (action === "retry-one") {
      const taskId = String(body?.taskId || "").trim();

      if (!taskId) {
        return NextResponse.json(
          { ok: false, error: "taskId é obrigatório." },
          { status: 400 }
        );
      }

      const result = await retryAutomationTask(taskId);
      return NextResponse.json(result);
    }

    if (action === "retry-failed") {
      const result = await retryAllFailedAutomationTasks(
        Number(body?.limit ?? 20)
      );
      return NextResponse.json(result);
    }

    const result = await processAutomationQueue({
      limit: Number(body?.limit ?? 1),
      origin,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Erro ao rodar automação." },
      { status: 500 }
    );
  }
}