"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function SystemAutomationManager() {
  const { user } = useAuth();
  const [loadingNormalize, setLoadingNormalize] = useState(false);
  const [loadingAutoSystem, setLoadingAutoSystem] = useState(false);
  const [result, setResult] = useState("");

  async function handleNormalizeAll() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoadingNormalize(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/normalize-mangas", {
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
        error instanceof Error ? error.message : "Erro ao normalizar todos.";
      setResult(message);
    } finally {
      setLoadingNormalize(false);
    }
  }

  async function handleRunAutoSystemPreview() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoadingAutoSystem(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          source: "mangaonlinered",
          discoverNew: true,
          maxChapters: 2,
          overwrite: false,
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro na automação de preview.";
      setResult(message);
    } finally {
      setLoadingAutoSystem(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">🤖 Automação do sistema</h2>

      <p className="text-sm text-zinc-400">
        Normaliza mangás antigos e novos, melhora metadados, prepara múltiplas fontes
        e deixa o projeto pronto para rodar sozinho.
      </p>

      <div className="flex flex-col md:flex-row gap-3">
        <button
          onClick={handleNormalizeAll}
          disabled={loadingNormalize}
          className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
        >
          {loadingNormalize ? "Normalizando..." : "Normalizar mangás antigos e novos"}
        </button>

        <button
          onClick={handleRunAutoSystemPreview}
          disabled={loadingAutoSystem}
          className="px-5 py-3 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50"
        >
          {loadingAutoSystem ? "Executando..." : "Rodar preview da automação"}
        </button>
      </div>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}