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
  const [linksText, setLinksText] = useState("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function extractUrls(text: string) {
    const matches = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
    return matches.map((s) => s.trim());
  }

  async function runImport() {
    setMsg(null);
    setProgress(null);

    if (!adminToken) return setMsg("❌ Informe o ADMIN_SYNC_TOKEN.");
    if (!mangaId) return setMsg("❌ Defina um MangaId.");

    const urls = extractUrls(linksText);

    if (!urls.length) {
      return setMsg("❌ Cole pelo menos 1 link de capítulo.");
    }

    setLoading(true);

    try {
      let currentChapter = chapterNumber;
      let imported = 0;

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        setProgress(`Importando capítulo ${currentChapter}... (${i + 1}/${urls.length})`);

        const res = await fetch("/api/admin/import", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-token": adminToken,
          },
          body: JSON.stringify({
            mangaId,
            chapterNumber: currentChapter,
            chapterUrl: url,
            overwriteExisting,
          }),
        });

        const txt = await res.text();

        if (!res.ok) {
          setMsg(`❌ Erro no capítulo ${currentChapter}\n${txt}`);
          setLoading(false);
          return;
        }

        imported++;
        currentChapter++;
      }

      setMsg(`✅ Importados ${imported} capítulos com sucesso.`);
      setLinksText("");
      setChapterNumber(currentChapter);
      setProgress(null);
    } catch (e) {
      console.error(e);
      setMsg("❌ Falha durante importação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">

      <div className="text-lg font-semibold">
        ⚡ Importador Automático (Capítulos)
      </div>

      <div className="grid grid-cols-2 gap-3">

        <label className="space-y-1">
          <div className="text-sm text-zinc-300">Capítulo inicial</div>
          <input
            type="number"
            min={1}
            value={chapterNumber}
            onChange={(e) => setChapterNumber(Number(e.target.value))}
            className="w-full rounded-xl bg-zinc-800/70 p-2 border border-zinc-700 outline-none focus:border-cyan-400"
          />
        </label>

        <label className="col-span-2 space-y-1">
          <div className="text-sm text-zinc-300">Links dos capítulos</div>

          <textarea
            value={linksText}
            onChange={(e) => setLinksText(e.target.value)}
            placeholder={`Cole vários links aqui

Exemplo:

https://mangasonline.blog/capitulo-1
https://mangasonline.blog/capitulo-2
https://mangasonline.blog/capitulo-3`}
            rows={6}
            className="w-full rounded-xl bg-zinc-800/70 p-2 border border-zinc-700 outline-none focus:border-cyan-400"
          />
        </label>

        <label className="col-span-2 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={overwriteExisting}
            onChange={(e) => setOverwriteExisting(e.target.checked)}
          />
          Sobrescrever se capítulo já existir
        </label>
      </div>

      {progress && (
        <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-2 text-sm text-cyan-300">
          {progress}
        </div>
      )}

      {msg && (
        <div className="rounded-xl bg-white/5 border border-zinc-800 p-2 text-sm text-zinc-200 whitespace-pre-wrap">
          {msg}
        </div>
      )}

      <button
        onClick={runImport}
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50 transition"
      >
        {loading ? "Importando capítulos..." : "Importar capítulos"}
      </button>

      <div className="text-[11px] text-zinc-500">
        Cole vários links de capítulos. O sistema importará automaticamente em sequência.
      </div>
    </div>
  );
}