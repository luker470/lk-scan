import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";

type LockAcquireResult = {
  ok: boolean;
  ownerId: string;
  reason?: string;
};

function nowMs() {
  return Date.now();
}

export async function acquireAutomationLock(
  name: string,
  ttlMs = 1000 * 60 * 10
): Promise<LockAcquireResult> {
  const db = getAdminDb();

  if (!db) {
    return {
      ok: false,
      ownerId: "",
      reason: "Firestore Admin indisponível.",
    };
  }

  const ownerId = `${name}_${nowMs()}_${Math.random().toString(36).slice(2, 8)}`;
  const ref = db.collection("automation_locks").doc(name);

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;

      const expiresAtMs = Number(data?.expiresAtMs || 0);
      const locked = !!data?.locked;
      const currentOwnerId = String(data?.ownerId || "");

      const expired = !expiresAtMs || expiresAtMs < nowMs();

      if (locked && !expired) {
        return {
          ok: false,
          ownerId,
          reason: `Lock já ativo por ${currentOwnerId || "outro processo"}.`,
        };
      }

      tx.set(
        ref,
        {
          name,
          locked: true,
          ownerId,
          acquiredAt: FieldValue.serverTimestamp(),
          acquiredAtMs: nowMs(),
          expiresAtMs: nowMs() + ttlMs,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { ok: true, ownerId };
    });

    return result;
  } catch (error: any) {
    return {
      ok: false,
      ownerId,
      reason: error?.message || "Erro ao adquirir lock.",
    };
  }
}

export async function releaseAutomationLock(name: string, ownerId: string) {
  const db = getAdminDb();
  if (!db) return false;

  const ref = db.collection("automation_locks").doc(name);

  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;

      const data = snap.data() || {};
      if (String(data.ownerId || "") !== ownerId) return;

      tx.set(
        ref,
        {
          locked: false,
          releasedAt: FieldValue.serverTimestamp(),
          releasedAtMs: nowMs(),
          expiresAtMs: 0,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    return true;
  } catch {
    return false;
  }
}