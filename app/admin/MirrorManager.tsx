"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function MirrorManager() {
  const { user } = useAuth();

  const [mangaId, setMangaId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");

  async function runMirror() {
    if (!user?.uid) {
      setResult("Usuário não autenticado.");
      return;
    }

    setLoading(true);
    setResult("");

    try {
      const res = await fetch("/api/admin/mirror", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          mangaId: mangaId.trim(),
          chapterId: chapterId.trim(),
        }),
      });

      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      setResult(error instanceof Error ? error.message : "Erro ao espelhar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <h2 className="text-xl font-bold text-cyan-400">🪞 Espelhamento físico</h2>

      <p className="text-sm text-zinc-400">
        Salva fisicamente as páginas no Firebase Storage para reduzir dependência da fonte original.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <div className="text-sm text-zinc-300">MangaId opcional</div>
          <input
            value={mangaId}
            onChange={(e) => setMangaId(e.target.value)}
            placeholder="Vazio = todos autoSync"
            className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm text-zinc-300">ChapterId opcional</div>
          <input
            value={chapterId}
            onChange={(e) => setChapterId(e.target.value)}
            placeholder="Use junto com MangaId"
            className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
          />
        </label>
      </div>

      <button
        onClick={runMirror}
        disabled={loading}
        className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
      >
        {loading ? "Espelhando..." : "Executar espelhamento"}
      </button>

      <pre className="rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs text-zinc-200 overflow-auto whitespace-pre-wrap">
        {result || "Sem resultado ainda."}
      </pre>
    </section>
  );
}