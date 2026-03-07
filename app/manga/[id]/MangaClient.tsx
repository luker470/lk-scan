"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { proxifyImage } from "@/lib/imgProxy";
import FavoriteButton from "@/components/FavoriteButton";

type Chapter = {
  id: string;
  number: number;
  title?: string;
  pagesCount?: number;
};

type Manga = {
  id: string;
  title: string;
  cover?: string;
  genre?: string;
  description?: string;
  views?: number;
  chaptersCount?: number;
  lastChapterNumber?: number;
  updatedAt?: any;
};

export default function MangaClient({ id }: { id: string }) {
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      setLoading(true);

      try {
        const ref = doc(db, "mangas", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setManga(null);
          setChapters([]);
          return;
        }

        const data = {
          id: snap.id,
          ...(snap.data() as Omit<Manga, "id">),
        };

        setManga(data);

        const chaptersQ = query(
          collection(db, "mangas", id, "chapters"),
          orderBy("number", "desc")
        );

        const chaptersSnap = await getDocs(chaptersQ);

        setChapters(
          chaptersSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
        );
      } catch (e) {
        console.error("Erro ao carregar mangá:", e);
      } finally {
        setLoading(false);
      }
    }

    if (id) run();
  }, [id]);

  const latestChapterId = useMemo(() => {
    if (!chapters.length) return null;
    return chapters[0].id;
  }, [chapters]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando...
      </main>
    );
  }

  if (!manga) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="max-w-3xl mx-auto bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-red-400 mb-2">Mangá não encontrado</h1>
          <p className="text-zinc-300 mb-4">Esse ID não existe no Firestore.</p>
          <Link
            href="/"
            className="inline-block px-5 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-semibold"
          >
            ← Voltar para Home
          </Link>
        </div>
      </main>
    );
  }

  const chaptersCount =
    typeof manga.chaptersCount === "number" ? manga.chaptersCount : chapters.length;

  const coverSrc = proxifyImage(manga.cover);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="LK"
            className="h-10 w-auto drop-shadow-[0_0_12px_#00ffff]"
          />
          <span className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_10px_#00ffff]">
            LK-Scan
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          {coverSrc ? (
            <img
              src={coverSrc}
              alt={manga.title}
              className="w-full max-h-96 object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-72 flex items-center justify-center bg-zinc-800 text-zinc-400">
              Sem capa
            </div>
          )}

          <div className="p-6 space-y-4">
            <div className="space-y-1">
              <h1 className="text-3xl font-bold">{manga.title}</h1>
              <p className="text-zinc-300">Gênero: {manga.genre || "—"}</p>

              {!!manga.description && (
                <p className="text-sm text-zinc-300 leading-relaxed pt-2">
                  {manga.description}
                </p>
              )}

              <p className="text-xs text-zinc-400">
                Capítulos: <b className="text-zinc-200">{chaptersCount}</b> • Views:{" "}
                <b className="text-zinc-200">{(manga.views ?? 0).toLocaleString()}</b>
              </p>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              {latestChapterId ? (
                <Link
                  href={`/manga/${manga.id}/chapter/${latestChapterId}`}
                  className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-600 transition text-center shadow-[0_0_12px_#00ffff]"
                >
                  ▶︎ Ler último capítulo
                </Link>
              ) : (
                <div className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-300 text-center">
                  Nenhum capítulo ainda.
                </div>
              )}

              <FavoriteButton
                mangaId={manga.id}
                title={manga.title}
                cover={manga.cover}
                genre={manga.genre}
              />

              <Link
                href="/"
                className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition text-center"
              >
                ← Voltar
              </Link>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="mb-2 font-semibold">Capítulos</div>

              <div className="space-y-2">
                {chapters.length === 0 && (
                  <div className="opacity-70">Nenhum capítulo ainda.</div>
                )}

                {chapters.map((c) => (
                  <Link
                    key={c.id}
                    href={`/manga/${manga.id}/chapter/${c.id}`}
                    className="flex items-center justify-between rounded-xl bg-white/5 p-3 hover:bg-white/10 transition"
                  >
                    <div>
                      <div className="font-semibold">
                        {c.title || `Capítulo ${String(c.number).padStart(3, "0")}`}
                      </div>
                      <div className="text-xs opacity-70">{c.pagesCount || 0} páginas</div>
                    </div>
                    <div className="text-sm opacity-80">Ler</div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="text-[11px] text-zinc-500">
              Dica: se o “Ler último capítulo” estiver errado, verifique se os capítulos estão
              salvando o campo <b>number</b>.
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}