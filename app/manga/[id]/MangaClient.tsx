"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { proxifyImage } from "@/lib/imgProxy";
import FavoriteButton from "@/components/FavoriteButton";
import { useAuth } from "@/context/AuthContext";

type Chapter = {
  id: string;
  number: number;
  title?: string;
  pagesCount?: number;
  views?: number;
  updatedAt?: any;
  createdAt?: any;
};

type Manga = {
  id: string;
  title: string;
  cover?: string;
  banner?: string;
  genre?: string;
  description?: string;
  status?: string;
  author?: string;
  artist?: string;
  views?: number;
  weekViews?: number;
  dayViews?: number;
  monthViews?: number;
  chaptersCount?: number;
  lastChapterNumber?: number;
  updatedAt?: any;
  createdAt?: any;
};

type HistoryItem = {
  id: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  chapterTitle?: string;
  updatedAt?: any;
};

function formatDate(v: any) {
  const seconds = v?.seconds;
  if (!seconds) return "Sem data";
  return new Date(seconds * 1000).toLocaleString("pt-BR");
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function formatStatus(status?: string) {
  if (!status) return "—";

  const s = status.toLowerCase();
  if (s === "ongoing") return "Em andamento";
  if (s === "completed") return "Finalizado";
  if (s === "hiatus") return "Hiato";
  if (s === "cancelled") return "Cancelado";

  return status;
}

function splitGenres(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export default function MangaClient({ id }: { id: string }) {
  const { user } = useAuth();

  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [related, setRelated] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortDesc, setSortDesc] = useState(true);
  const [lastReadChapterId, setLastReadChapterId] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);

      try {
        if (!db) {
          setManga(null);
          setChapters([]);
          setRelated([]);
          return;
        }

        const ref = doc(db, "mangas", id);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setManga(null);
          setChapters([]);
          setRelated([]);
          return;
        }

        const mangaData = {
          id: snap.id,
          ...(snap.data() as Omit<Manga, "id">),
        };

        setManga(mangaData);

        const chaptersQ = query(
          collection(db, "mangas", id, "chapters"),
          orderBy("number", "desc")
        );

        const chaptersSnap = await getDocs(chaptersQ);

        const chapterList = chaptersSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Chapter, "id">),
        })) as Chapter[];

        setChapters(chapterList);

        if (mangaData.genre) {
          try {
            const relatedSnap = await getDocs(
              query(collection(db, "mangas"), limit(40))
            );

            const currentGenres = splitGenres(mangaData.genre);

            const relatedList = relatedSnap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<Manga, "id">),
              }))
              .filter((item) => item.id !== id)
              .map((item) => {
                const itemGenres = splitGenres(item.genre);
                const score = itemGenres.reduce((sum, genre) => {
                  return sum + (currentGenres.includes(genre) ? 1 : 0);
                }, 0);

                return { ...item, _score: score };
              })
              .filter((item) => item._score > 0)
              .sort((a, b) => {
                if (b._score !== a._score) return b._score - a._score;
                return Number(b.views || 0) - Number(a.views || 0);
              })
              .slice(0, 6)
              .map(({ _score, ...rest }) => rest);

            setRelated(relatedList);
          } catch (e) {
            console.error("Erro ao carregar relacionados:", e);
            setRelated([]);
          }
        } else {
          setRelated([]);
        }
      } catch (e) {
        console.error("Erro ao carregar mangá:", e);
        setManga(null);
        setChapters([]);
        setRelated([]);
      } finally {
        setLoading(false);
      }
    }

    if (id) run();
  }, [id]);

  useEffect(() => {
    async function loadHistory() {
      if (!user?.uid || !id) {
        setLastReadChapterId(null);
        return;
      }

      try {
        const res = await fetch(`/api/history?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();

        const items = (data?.items || []) as HistoryItem[];
        const match = items.find((item) => item.mangaId === id);

        setLastReadChapterId(match?.chapterId || null);
      } catch (e) {
        console.error("Erro ao carregar histórico:", e);
        setLastReadChapterId(null);
      }
    }

    loadHistory();
  }, [user?.uid, id]);

  const latestChapter = useMemo(() => {
    if (!chapters.length) return null;
    return [...chapters].sort((a, b) => Number(b.number || 0) - Number(a.number || 0))[0];
  }, [chapters]);

  const firstChapter = useMemo(() => {
    if (!chapters.length) return null;
    return [...chapters].sort((a, b) => Number(a.number || 0) - Number(b.number || 0))[0];
  }, [chapters]);

  const displayedChapters = useMemo(() => {
    const list = [...chapters];
    list.sort((a, b) => {
      const an = Number(a.number || 0);
      const bn = Number(b.number || 0);
      return sortDesc ? bn - an : an - bn;
    });
    return list;
  }, [chapters, sortDesc]);

  const continueChapter = useMemo(() => {
    if (!lastReadChapterId) return null;
    return chapters.find((c) => c.id === lastReadChapterId) || null;
  }, [lastReadChapterId, chapters]);

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
  const bannerSrc = proxifyImage(manga.banner || manga.cover);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60">
          <div className="relative h-56 md:h-80 overflow-hidden">
            {bannerSrc ? (
              <>
                <img
                  src={bannerSrc}
                  alt={manga.title}
                  className="w-full h-full object-cover opacity-25 blur-[2px] scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/30" />
              </>
            ) : (
              <div className="w-full h-full bg-zinc-900" />
            )}
          </div>

          <div className="relative px-5 pb-5 md:px-8 md:pb-8">
            <div className="-mt-20 md:-mt-28 flex flex-col lg:flex-row gap-6">
              <div className="shrink-0">
                {coverSrc ? (
                  <img
                    src={coverSrc}
                    alt={manga.title}
                    className="w-40 md:w-52 h-56 md:h-72 object-cover rounded-2xl border border-zinc-800 shadow-[0_0_35px_rgba(0,255,255,0.08)]"
                  />
                ) : (
                  <div className="w-40 md:w-52 h-56 md:h-72 rounded-2xl border border-zinc-800 bg-zinc-800 flex items-center justify-center text-zinc-400">
                    Sem capa
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-5">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                      LK-Scan
                    </span>

                    {latestChapter?.number ? (
                      <span className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-semibold">
                        Último cap. {pad3(latestChapter.number)}
                      </span>
                    ) : null}

                    {!!manga.status && (
                      <span className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-semibold">
                        {formatStatus(manga.status)}
                      </span>
                    )}
                  </div>

                  <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
                    {manga.title}
                  </h1>

                  <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
                    <span>Gênero: {manga.genre || "—"}</span>
                    <span>Views: {(manga.views ?? 0).toLocaleString()}</span>
                    <span>Capítulos: {chaptersCount}</span>
                    <span>Semana: {(manga.weekViews ?? 0).toLocaleString()}</span>
                  </div>

                  {(manga.author || manga.artist) && (
                    <div className="flex flex-wrap gap-3 text-sm text-zinc-400">
                      {manga.author && <span>Autor: {manga.author}</span>}
                      {manga.artist && <span>Artista: {manga.artist}</span>}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4 text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {manga.description?.trim()
                    ? manga.description
                    : "Sem descrição ainda. Adicione uma descrição no painel admin para deixar a página mais completa."}
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  {continueChapter ? (
                    <Link
                      href={`/manga/${manga.id}/chapter/${continueChapter.id}`}
                      className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition text-center"
                    >
                      ▶ Continuar leitura
                    </Link>
                  ) : latestChapter ? (
                    <Link
                      href={`/manga/${manga.id}/chapter/${latestChapter.id}`}
                      className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition text-center"
                    >
                      ▶ Ler último capítulo
                    </Link>
                  ) : (
                    <div className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-300 text-center">
                      Nenhum capítulo ainda.
                    </div>
                  )}

                  {firstChapter ? (
                    <Link
                      href={`/manga/${manga.id}/chapter/${firstChapter.id}`}
                      className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition text-center"
                    >
                      📖 Ler do início
                    </Link>
                  ) : null}

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
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-2xl font-bold text-cyan-400">📚 Lista de capítulos</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Total: {chaptersCount} capítulo{chaptersCount === 1 ? "" : "s"}
                </p>
              </div>

              <button
                onClick={() => setSortDesc((v) => !v)}
                className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition text-sm font-semibold"
              >
                Ordem: {sortDesc ? "Mais novos" : "Mais antigos"}
              </button>
            </div>

            <div className="space-y-3">
              {displayedChapters.length === 0 && (
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-4 text-zinc-400">
                  Nenhum capítulo ainda.
                </div>
              )}

              {displayedChapters.map((c) => {
                const isContinue = continueChapter?.id === c.id;

                return (
                  <Link
                    key={c.id}
                    href={`/manga/${manga.id}/chapter/${c.id}`}
                    className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition ${
                      isContinue
                        ? "border-cyan-500/40 bg-cyan-500/5 hover:border-cyan-400"
                        : "border-zinc-800 bg-black/20 hover:border-cyan-400"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold">
                          {c.title || `Capítulo ${pad3(c.number || 0)}`}
                        </div>

                        {isContinue && (
                          <span className="px-2 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold">
                            Continuar
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-zinc-500 mt-1 flex flex-wrap gap-3">
                        <span>{c.pagesCount || 0} páginas</span>
                        <span>{(c.views ?? 0).toLocaleString()} views</span>
                        <span>{formatDate(c.updatedAt || c.createdAt)}</span>
                      </div>
                    </div>

                    <div className="shrink-0 text-sm text-zinc-300">Ler →</div>
                  </Link>
                );
              })}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">ℹ Informações</h3>

              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <div className="text-zinc-500">Título</div>
                  <div className="text-zinc-200 font-semibold">{manga.title}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <div className="text-zinc-500">Gênero</div>
                  <div className="text-zinc-200 font-semibold">{manga.genre || "—"}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <div className="text-zinc-500">Status</div>
                  <div className="text-zinc-200 font-semibold">
                    {formatStatus(manga.status)}
                  </div>
                </div>

                {manga.author && (
                  <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <div className="text-zinc-500">Autor</div>
                    <div className="text-zinc-200 font-semibold">{manga.author}</div>
                  </div>
                )}

                {manga.artist && (
                  <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <div className="text-zinc-500">Artista</div>
                    <div className="text-zinc-200 font-semibold">{manga.artist}</div>
                  </div>
                )}

                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <div className="text-zinc-500">Total de capítulos</div>
                  <div className="text-zinc-200 font-semibold">{chaptersCount}</div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <div className="text-zinc-500">Views totais</div>
                  <div className="text-zinc-200 font-semibold">
                    {(manga.views ?? 0).toLocaleString()}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                  <div className="text-zinc-500">Última atualização</div>
                  <div className="text-zinc-200 font-semibold">
                    {formatDate(manga.updatedAt || manga.createdAt)}
                  </div>
                </div>
              </div>
            </div>

            {latestChapter && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="text-lg font-bold text-cyan-400 mb-4">⚡ Acesso rápido</h3>

                <div className="space-y-3">
                  <Link
                    href={`/manga/${manga.id}/chapter/${latestChapter.id}`}
                    className="block w-full rounded-xl bg-cyan-500 p-3 text-center font-bold text-black hover:bg-cyan-400 transition"
                  >
                    Ler último capítulo
                  </Link>

                  {firstChapter && (
                    <Link
                      href={`/manga/${manga.id}/chapter/${firstChapter.id}`}
                      className="block w-full rounded-xl border border-zinc-700 p-3 text-center text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
                    >
                      Ler do início
                    </Link>
                  )}
                </div>
              </div>
            )}

            {related.length > 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <h3 className="text-lg font-bold text-cyan-400 mb-4">🔥 Relacionados</h3>

                <div className="space-y-3">
                  {related.map((item) => {
                    const img = proxifyImage(item.cover);

                    return (
                      <Link
                        key={item.id}
                        href={`/manga/${item.id}`}
                        className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-black/20 p-3 hover:border-cyan-400 transition"
                      >
                        {img ? (
                          <img
                            src={img}
                            alt={item.title}
                            className="h-16 w-12 rounded object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-16 w-12 rounded bg-zinc-800 shrink-0" />
                        )}

                        <div className="min-w-0">
                          <div className="font-semibold line-clamp-1">{item.title}</div>
                          <div className="text-xs text-zinc-500 line-clamp-1">
                            {item.genre || "Sem gênero"}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}