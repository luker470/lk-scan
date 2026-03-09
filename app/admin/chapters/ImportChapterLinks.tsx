"use client";

import { useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function isDirectImageUrl(url: string) {
  return /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url.trim());
}

export default function ImportChapterLinks({ mangaId }: { mangaId: string }) {
  const [chapterNumber, setChapterNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const links = useMemo(() => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(isDirectImageUrl);
  }, [text]);

  async function handleSave() {
    setMsg(null);

    if (!db) {
      setMsg("❌ Firebase não inicializado. Confira as variáveis NEXT_PUBLIC_FIREBASE_* no Vercel.");
      return;
    }

    if (!mangaId) {
      setMsg("❌ MangaId inválido.");
      return;
    }

    if (!chapterNumber || chapterNumber < 1) {
      setMsg("❌ Informe um número de capítulo válido.");
      return;
    }

    if (links.length === 0) {
      setMsg("❌ Cole links válidos de imagens (.jpg/.png/.webp/.gif), um por linha.");
      return;
    }

    setLoading(true);

    try {
      const chapterId = pad3(chapterNumber);
      const chapterRef = doc(db, "mangas", mangaId, "chapters", chapterId);

      const pages = links.map((url, i) => ({
        index: i + 1,
        url,
      }));

      await setDoc(
        chapterRef,
        {
          number: chapterNumber,
          title: title.trim() || `Capítulo ${chapterId}`,
          pagesCount: pages.length,
          pages,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // atualiza metadados do mangá
      const mangaRef = doc(db, "mangas", mangaId);
      const mangaSnap = await getDoc(mangaRef);
      const mangaData = mangaSnap.exists() ? (mangaSnap.data() as any) : {};

      const currentLast = Number(mangaData?.lastChapterNumber || 0);
      const currentCount = Number(mangaData?.chaptersCount || 0);

      await setDoc(
        mangaRef,
        {
          chaptersCount: Math.max(currentCount, chapterNumber),
          lastChapterNumber: Math.max(currentLast, chapterNumber),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMsg(`✅ Capítulo ${chapterId} salvo com ${pages.length} páginas.`);
      setText("");
      setTitle(`Capítulo ${pad3(chapterNumber + 1)}`);
      setChapterNumber((prev) => prev + 1);
    } catch (error) {
      console.error(error);
      setMsg("❌ Erro ao salvar capítulo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
        <div className="text-lg font-semibold">📄 Importar 1 capítulo (colar links)</div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-300">Número</div>
            <input
              type="number"
              min={1}
              value={chapterNumber}
              onChange={(e) => setChapterNumber(Number(e.target.value))}
              className="w-full rounded-xl bg-zinc-800/70 p-3 outline-none border border-zinc-700 focus:border-cyan-400"
            />
          </label>

          <label className="space-y-1">
            <div className="text-sm text-zinc-300">Título (opcional)</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Capítulo ${pad3(chapterNumber)}`}
              className="w-full rounded-xl bg-zinc-800/70 p-3 outline-none border border-zinc-700 focus:border-cyan-400"
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <div className="text-sm text-zinc-300">Cole os links (1 por linha)</div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="https://site.com/pagina-1.jpg&#10;https://site.com/pagina-2.jpg&#10;https://site.com/pagina-3.jpg"
            rows={10}
            className="w-full rounded-xl bg-zinc-800/70 p-3 outline-none border border-zinc-700 focus:border-cyan-400 resize-y"
          />
        </label>

        <div className="text-xs text-zinc-400">
          Imagens válidas detectadas: <b className="text-zinc-200">{links.length}</b>
        </div>

        {msg && (
          <div className="rounded-xl border border-zinc-800 bg-white/5 p-3 text-sm text-zinc-200 whitespace-pre-wrap">
            {msg}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50 transition"
        >
          {loading ? "Salvando..." : "Salvar Capítulo"}
        </button>
      </div>
    </div>
  );
}