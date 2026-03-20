"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function BackupManager() {
  const { user } = useAuth();

  const [mangaId, setMangaId] = useState("");
  const [loadingAll, setLoadingAll] = useState(false);
  const [loadingSingle, setLoadingSingle] = useState(false);
  const [result, setResult] = useState("");

  async function backupAll() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoadingAll(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({}),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao gerar backup geral.";
      setResult(message);
    } finally {
      setLoadingAll(false);
    }
  }

  async function backupSingle() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    if (!mangaId.trim()) {
      setResult("Informe um mangaId.");
      return;
    }

    setLoadingSingle(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          mangaId: mangaId.trim(),
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao gerar backup do mangá.";
      setResult(message);
    } finally {
      setLoadingSingle(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">💾 Backup persistente</h2>

      <p className="text-sm text-zinc-400">
        Gera snapshot local dos capítulos já importados para manter leitura mesmo se
        a fonte original cair.
      </p>

      <label className="space-y-1 block">
        <div className="text-sm text-zinc-300">MangaId opcional</div>
        <input
          value={mangaId}
          onChange={(e) => setMangaId(e.target.value)}
          placeholder="Deixe vazio para backup de todos"
          className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
        />
      </label>

      <div className="flex flex-col md:flex-row gap-3">
        <button
          onClick={backupSingle}
          disabled={loadingSingle}
          className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
        >
          {loadingSingle ? "Gerando..." : "Backup de 1 mangá"}
        </button>

        <button
          onClick={backupAll}
          disabled={loadingAll}
          className="px-5 py-3 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50"
        >
          {loadingAll ? "Gerando backups..." : "Backup de todos autoSync"}
        </button>
      </div>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}
