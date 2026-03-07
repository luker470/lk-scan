"use client";

import { useState } from "react";

export default function ImportAutoFromUrl({
  mangaId,
  adminToken,
}: {
  mangaId: string;
  adminToken: string;
}) {
  const [chapterNumber, setChapterNumber] = useState(1);
  const [chapterUrl, setChapterUrl] = useState("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function runImport() {
    setMsg(null);

    if (!adminToken) return setMsg("❌ Informe o ADMIN_SYNC_TOKEN (no topo do Admin).");
    if (!mangaId) return setMsg("❌ Defina um MangaId.");
    if (!chapterUrl.trim().startsWith("http")) return setMsg("❌ Cole o link do capítulo (http/https).");
    if (!chapterNumber || chapterNumber < 1) return setMsg("❌ Informe um número de capítulo válido.");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({
          mangaId,
          chapterNumber,
          chapterUrl: chapterUrl.trim(),
          overwriteExisting,
        }),
      });

      const txt = await res.text();

      if (!res.ok) {
        setMsg("❌ Erro: " + txt);
        return;
      }

      setMsg("✅ " + txt);
      if (!overwriteExisting) {
        setChapterNumber((v) => v + 1);
      }
      setChapterUrl("");
    } catch (e) {
      console.error(e);
      setMsg("❌ Falha no import.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-lg font-semibold">⚡ Importar automático (por URL do capítulo)</div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <div className="text-sm text-zinc-300">Capítulo</div>
          <input
            type="number"
            min={1}
            value={chapterNumber}
            onChange={(e) => setChapterNumber(Number(e.target.value))}
            className="w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
          />
        </label>

        <label className="space-y-1 col-span-2">
          <div className="text-sm text-zinc-300">Link do capítulo</div>
          <input
            value={chapterUrl}
            onChange={(e) => setChapterUrl(e.target.value)}
            placeholder="https://... (link do capítulo)"
            className="w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
          />
        </label>

        <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={(e) => setOverwriteExisting(e.target.checked)}
          />
          Sobrescrever se o capítulo já existir
        </label>
      </div>

      {msg && (
        <div className="rounded-xl bg-white/5 p-2 text-sm text-zinc-200 whitespace-pre-wrap border border-zinc-800">
          {msg}
        </div>
      )}

      <button
        onClick={runImport}
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50 transition"
      >
        {loading ? "Importando..." : "Importar agora"}
      </button>

      <div className="text-[11px] text-zinc-500">
        Esse modo depende do endpoint /api/admin/import. Agora ele evita duplicados por capítulo e por sourceUrl.
      </div>
    </div>
  );
}