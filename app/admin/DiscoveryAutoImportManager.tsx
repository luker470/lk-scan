"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function DiscoveryAutoImportManager() {
  const { user } = useAuth();

  const [source, setSource] = useState("mangaonlinered");
  const [maxChapters, setMaxChapters] = useState("3");
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function handleAutoImport() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const parsedMax = Number(maxChapters || 0);

      const res = await fetch("/api/admin/discovery/auto-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          source,
          maxChapters: Number.isFinite(parsedMax) ? parsedMax : 0,
          overwrite,
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro no auto import.";
      setResult(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">
        🚀 Descobrir e importar direto
      </h2>

      <p className="text-sm text-zinc-400">
        Descobre mangás da fonte escolhida, cria no catálogo automaticamente e já
        importa capítulos sem depender de aprovação manual.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <div className="text-sm text-zinc-300">Fonte</div>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
          >
            <option value="mangaonlinered">Manga Online Red</option>
            <option value="mangasonline">Mangás Online</option>
          </select>
        </label>

        <label className="space-y-1">
          <div className="text-sm text-zinc-300">Máximo de capítulos</div>
          <input
            value={maxChapters}
            onChange={(e) => setMaxChapters(e.target.value)}
            placeholder="0 = sem limite"
            className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={overwrite}
          onChange={(e) => setOverwrite(e.target.checked)}
        />
        Sobrescrever capítulos já existentes
      </label>

      <button
        onClick={handleAutoImport}
        disabled={loading}
        className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
      >
        {loading ? "Importando..." : "Descobrir + importar direto"}
      </button>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}
