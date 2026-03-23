"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function ParserDiagnosticsBoard() {
  const { user } = useAuth();

  const [mangaUrl, setMangaUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function runDiagnostics() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    if (!mangaUrl.trim()) {
      setResult("Informe a URL da obra.");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/parser-diagnostics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          mangaUrl: mangaUrl.trim(),
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      setResult(
        error instanceof Error ? error.message : "Erro ao diagnosticar parser."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">🧪 Diagnóstico de parser</h2>

      <p className="text-sm text-zinc-400">
        Testa uma obra específica e mostra quais seletores de capítulos e páginas
        foram tentados.
      </p>

      <label className="space-y-1 block">
        <div className="text-sm text-zinc-300">URL da obra</div>
        <input
          value={mangaUrl}
          onChange={(e) => setMangaUrl(e.target.value)}
          placeholder="https://mangaonline.red/manga/..."
          className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
        />
      </label>

      <button
        onClick={runDiagnostics}
        disabled={loading}
        className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
      >
        {loading ? "Diagnosticando..." : "Executar diagnóstico"}
      </button>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}