"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function AdminPingTest() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  async function handlePing() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/ping", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao testar ping.";
      setResult(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">🧪 Teste Firebase Admin</h2>

      <p className="text-sm text-zinc-400">
        Esse teste escreve e lê um documento em <b>_debug/ping</b> usando o
        Firebase Admin.
      </p>

      <button
        onClick={handlePing}
        disabled={loading}
        className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
      >
        {loading ? "Testando..." : "Testar Firebase Admin"}
      </button>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}