import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

export type AutomationLogStatus = "running" | "success" | "error";
export type AutomationTaskType = "discovery" | "sync" | "cleanup" | "source-health";

export async function createAutomationLog(params: {
  type: AutomationTaskType;
  status?: AutomationLogStatus;
  source?: string;
  message?: string;
  details?: any;
  taskId?: string | null;
}) {
  const db = getAdminDb();
  if (!db) return null;

  const ref = db.collection("automation_logs").doc();

  await ref.set({
    type: params.type,
    status: params.status || "running",
    source: params.source || "system",
    message: params.message || "",
    details: params.details || null,
    taskId: params.taskId || null,
    startedAt: FieldValue.serverTimestamp(),
    startedAtMs: Date.now(),
    finishedAt: null,
    durationMs: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

export async function finishAutomationLog(params: {
  logId: string | null;
  status: Exclude<AutomationLogStatus, "running">;
  message?: string;
  details?: any;
}) {
  const db = getAdminDb();
  if (!db || !params.logId) return;

  const ref = db.collection("automation_logs").doc(params.logId);
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  const startedAtMs = Number(data?.startedAtMs || Date.now());

  await ref.set(
    {
      status: params.status,
      message: params.message || data?.message || "",
      details: params.details ?? data?.details ?? null,
      finishedAt: FieldValue.serverTimestamp(),
      durationMs: Date.now() - startedAtMs,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}