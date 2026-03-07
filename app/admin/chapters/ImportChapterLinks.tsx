"use client";

import { useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, serverTimestamp, setDoc, updateDoc, increment } from "firebase/firestore";

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function isImageUrl(u: string) {
  return /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(u);
}

function extractUrls(raw: string) {
  const matches = raw.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return matches.map((s) => s.trim());
}

function sortByTrailingNumber(urls: string[]) {
  const num = (u: string) => {
    try {
      const clean = u.split("?")[0];
      const m = clean.match(/(\d+)\.(jpe?g|png|webp|gif)$/i);
      return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  };

  return [...urls].sort((a, b) => {
    const na = num(a);
    const nb = num(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

export default function ImportChapterLinks({ mangaId }: { mangaId: string }) {
  const [chapterNumber, setChapterNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const links = useMemo(() => {
    const urls = extractUrls(raw)
      .filter((u) => u.startsWith("http://") || u.startsWith("https://"))
      .filter(isImageUrl);

    const unique = Array.from(new Set(urls));
    return sortByTrailingNumber(unique);
  }, [raw]);

  async function save() {
    setOk(null);
    setErr(null);

    if (!mangaId) return setErr("mangaId ausente.");
    if (!chapterNumber || chapterNumber < 1) return setErr("Número do capítulo inválido.");
    if (links.length === 0) return setErr("Cole links válidos de imagens (jpg/png/webp/gif).");

    const chapterId = pad3(chapterNumber);

    setLoading(true);
    try {
      const chapterRef = doc(db, "mangas", mangaId, "chapters", chapterId);
      const pages = links.map((url, i) => ({ index: i + 1, url }));

      await setDoc(
        chapterRef,
        {
          number: chapterNumber,
          title: title || `Capítulo ${chapterId}`,
          pagesCount: pages.length,
          pages,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const mangaRef = doc(db, "mangas", mangaId);
      await updateDoc(mangaRef, {
        updatedAt: serverTimestamp(),
        chaptersCount: increment(1),
        lastChapterNumber: chapterNumber,
      }).catch(() => {});

      setOk(`✅ Capítulo ${chapterId} salvo com ${pages.length} páginas.`);
      setRaw("");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Erro ao salvar capítulo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-lg font-semibold">📄 Importar 1 capítulo (colar links)</div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <div className="text-sm text-zinc-300">Número</div>
          <input
            type="number"
            min={1}
            value={chapterNumber}
            onChange={(e) => setChapterNumber(Number(e.target.value))}
            className="w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
          />
        </label>

        <label className="space-y-1">
          <div className="text-sm text-zinc-300">Título (opcional)</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Capítulo 001"
            className="w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
          />
        </label>
      </div>

      <label className="block space-y-2">
        <div className="text-sm text-zinc-300">Cole os links (1 por linha)</div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          className="w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
        />
        <div className="text-xs text-zinc-400">
          Imagens válidas detectadas: <b className="text-zinc-200">{links.length}</b>
        </div>
      </label>

      {err && <div className="rounded-xl bg-red-500/15 p-2 text-sm text-red-200">{err}</div>}
      {ok && <div className="rounded-xl bg-green-500/15 p-2 text-sm text-green-200">{ok}</div>}

      <button
        onClick={save}
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50 transition"
      >
        {loading ? "Salvando..." : "Salvar Capítulo"}
      </button>
    </div>
  );
}