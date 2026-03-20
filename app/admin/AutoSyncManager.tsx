"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function AutoSyncManager() {
  const { user } = useAuth();

  const [mangaId, setMangaId] = useState("");
  const [source, setSource] = useState("mangaonlinered");
  const [maxChapters, setMaxChapters] = useState("0");
  const [overwrite, setOverwrite] = useState(false);
  const [discoverNew, setDiscoverNew] = useState(true);

  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingSingle, setLoadingSingle] = useState(false);
  const [result, setResult] = useState("");

  async function syncAll() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoadingAll(true);
    setResult("");

    try {
      const parsedMax = Number(maxChapters || 0);

      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          source,
          discoverNew,
          maxChapters: Number.isFinite(parsedMax) ? parsedMax : 0,
          overwrite,
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao sincronizar todos.";
      setResult(message);
    } finally {
      setLoadingAll(false);
    }
  }

  async function syncSingle() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    if (!mangaId.trim()) {
      setResult("Informe um mangaId para sincronização individual.");
      return;
    }

    setLoadingSingle(true);
    setResult("");

    try {
      const parsedMax = Number(maxChapters || 0);

      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          mangaId: mangaId.trim(),
          maxChapters: Number.isFinite(parsedMax) ? parsedMax : 0,
          overwrite,
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao sincronizar mangá.";
      setResult(message);
    } finally {
      setLoadingSingle(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">🔄 Sincronização automática</h2>

      <p className="text-sm text-zinc-400">
        Agora em modo <b>incremental</b>: tenta importar só capítulos novos dos mangás
        com <b>autoSync = true</b> e também pode descobrir/importar mangás novos.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <div className="text-sm text-zinc-300">MangaId opcional</div>
          <input
            value={mangaId}
            onChange={(e) => setMangaId(e.target.value)}
            placeholder="Deixe vazio para sincronizar todos"
            className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm text-zinc-300">Fonte para descobrir novos</div>
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
          <div className="text-sm text-zinc-300">Máximo de capítulos por sync</div>
          <input
            value={maxChapters}
            onChange={(e) => setMaxChapters(e.target.value)}
            placeholder="0 = sem limite"
            className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
          />
          <div className="text-xs text-zinc-500">Use 3 ou 5 para teste. Use 0 para sem limite.</div>
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

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={discoverNew}
          onChange={(e) => setDiscoverNew(e.target.checked)}
        />
        Descobrir e importar mangás novos automaticamente
      </label>

      <div className="flex flex-col md:flex-row gap-3">
        <button
          onClick={syncSingle}
          disabled={loadingSingle}
          className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
        >
          {loadingSingle ? "Sincronizando..." : "Sincronizar 1 mangá"}
        </button>

        <button
          onClick={syncAll}
          disabled={loadingAll}
          className="px-5 py-3 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50"
        >
          {loadingAll ? "Sincronizando todos..." : "Sincronizar tudo"}
        </button>
      </div>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}