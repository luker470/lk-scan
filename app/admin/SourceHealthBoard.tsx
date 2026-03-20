"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function SourceHealthBoard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function runHealthCheck() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/source-health", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao checar fontes.";
      setResult(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">🌐 Saúde das fontes</h2>

      <p className="text-sm text-zinc-400">
        Testa a fonte principal e as fontes backup. Se a principal cair, o sistema
        já prepara a troca automática.
      </p>

      <button
        onClick={runHealthCheck}
        disabled={loading}
        className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
      >
        {loading ? "Verificando..." : "Verificar saúde das fontes"}
      </button>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}