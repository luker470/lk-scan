import type { Firestore } from "firebase-admin/firestore";

export async function createOperatorAlert(
  db: Firestore,
  title: string,
  severity: "info" | "warning" | "high" | "critical",
  meta?: Record<string, unknown>
) {
  await db.collection("system").doc("alerts").collection("items").add({
    title,
    severity,
    meta: meta || {},
    read: false,
    createdAt: new Date(),
  });
}