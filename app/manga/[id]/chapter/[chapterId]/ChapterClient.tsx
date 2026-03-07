"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ReaderPro from "@/components/ReaderPro";
import Comments from "@/components/Comments";
import { useAuth } from "@/context/AuthContext";

type PageItem = {
  index: number;
  url: string;
};

export default function ChapterClient({
  mangaId,
  chapterId,
}: {
  mangaId: string;
  chapterId: string;
}) {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState<string>("");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [prevId, setPrevId] = useState<string | null>(null);
  const [nextId, setNextId] = useState<string | null>(null);

  const [mangaTitle, setMangaTitle] = useState("");
  const [mangaCover, setMangaCover] = useState("");

  const countedRef = useRef(false);
  const historyRef = useRef(false);

  useEffect(() => {
    async function run() {
      setLoading(true);

      try {
        const mangaRef = doc(db, "mangas", mangaId);
        const mangaSnap = await getDoc(mangaRef);

        if (mangaSnap.exists()) {
          const mangaData = mangaSnap.data() as any;
          setMangaTitle(mangaData.title || "");
          setMangaCover(mangaData.cover || "");
        }

        const chapRef = doc(db, "mangas", mangaId, "chapters", chapterId);
        const snap = await getDoc(chapRef);

        if (snap.exists()) {
          const data = snap.data() as any;
          setTitle(data.title || `Capítulo ${data.number ?? chapterId}`);

          const list = (data.pages || []) as PageItem[];
          setPages(list.slice().sort((a, b) => a.index - b.index));
        } else {
          setTitle("Capítulo não encontrado");
          setPages([]);
        }

        const qAll = query(
          collection(db, "mangas", mangaId, "chapters"),
          orderBy("number", "asc")
        );
        const all = await getDocs(qAll);
        const ids = all.docs.map((d) => d.id);
        const idx = ids.indexOf(chapterId);

        setPrevId(idx > 0 ? ids[idx - 1] : null);
        setNextId(idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null);
      } catch (e) {
        console.error("Erro ao carregar capítulo:", e);
      } finally {
        setLoading(false);
      }
    }

    if (mangaId && chapterId) run();
  }, [mangaId, chapterId]);

  useEffect(() => {
    if (!mangaId || !chapterId) return;
    if (countedRef.current) return;

    countedRef.current = true;

    fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mangaId, chapterId }),
    }).catch(() => {});
  }, [mangaId, chapterId]);

  useEffect(() => {
    if (!user?.uid || !mangaId || !chapterId || !title) return;
    if (historyRef.current) return;

    historyRef.current = true;

    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uid: user.uid,
        mangaId,
        chapterId,
        mangaTitle,
        mangaCover,
        chapterTitle: title,
      }),
    }).catch(() => {});
  }, [user?.uid, mangaId, chapterId, title, mangaTitle, mangaCover]);

  const pageUrls = useMemo(() => pages.map((p) => p.url), [pages]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando capítulo...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white p-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-4">
        <div className="sticky top-0 z-20 flex items-center justify-between rounded-2xl border border-zinc-800 bg-black/70 p-3 backdrop-blur">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            ← Voltar
          </button>

          <div className="text-sm text-zinc-300 truncate px-2">{title}</div>
          <div className="text-sm text-zinc-400">{pages.length}p</div>
        </div>

        <div className="flex gap-2">
          <button
            disabled={!prevId}
            onClick={() => prevId && router.push(`/manga/${mangaId}/chapter/${prevId}`)}
            className="flex-1 px-4 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-40"
          >
            ◀︎ Capítulo anterior
          </button>

          <button
            disabled={!nextId}
            onClick={() => nextId && router.push(`/manga/${mangaId}/chapter/${nextId}`)}
            className="flex-1 px-4 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-40"
          >
            Próximo capítulo ▶︎
          </button>
        </div>

        {pageUrls.length === 0 ? (
          <div className="text-zinc-300 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            Esse capítulo ainda não tem páginas.
          </div>
        ) : (
          <ReaderPro
            pages={pageUrls}
            storageKey={`manga:${mangaId}:chapter:${chapterId}`}
          />
        )}

        <Comments mangaId={mangaId} chapterId={chapterId} />
      </div>
    </main>
  );
}
