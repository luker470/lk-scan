"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { proxifyImage } from "@/lib/imgProxy";
import { useAuth } from "@/context/AuthContext";
import { getVipBadge } from "@/lib/titles";

type OrderMode = "updated" | "created" | "az" | "views";
type RankingTab = "daily" | "weekly" | "monthly" | "readers";

interface Manga {
  id: string;
  title: string;
  cover?: string;
  genre?: string;
  views?: number;
  weekViews?: number;
  dayViews?: number;
  monthViews?: number;
  createdAt?: any;
  updatedAt?: any;
  chaptersCount?: number;
  lastChapterNumber?: number;
}

type HistoryItem = {
  id: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  mangaCover?: string;
  chapterTitle?: string;
  updatedAt?: any;
};

type ReaderRankItem = {
  id: string;
  displayName?: string;
  username?: string;
  photoURL?: string;
  level?: number;
  xpTotal?: number;
  title?: string;
  vipTier?: string | null;
};

function tsSeconds(v: any) {
  return v?.seconds ?? 0;
}

function formatRankValue(tab: RankingTab, manga: Manga) {
  if (tab === "daily") return manga.dayViews ?? 0;
  if (tab === "weekly") return manga.weekViews ?? 0;
  if (tab === "monthly") return manga.monthViews ?? 0;
  return manga.views ?? 0;
}

function formatReaderName(item: ReaderRankItem) {
  return item.displayName || item.username || "Usuário";
}

function RankingSidebar({
  rankingTab,
  onChangeTab,
  mangas,
  readers,
}: {
  rankingTab: RankingTab;
  onChangeTab: (tab: RankingTab) => void;
  mangas: Manga[];
  readers: ReaderRankItem[];
}) {
  const rankingMangas = useMemo(() => {
    if (rankingTab === "daily") {
      return [...mangas]
        .sort((a, b) => (b.dayViews ?? 0) - (a.dayViews ?? 0))
        .slice(0, 8);
    }

    if (rankingTab === "weekly") {
      return [...mangas]
        .sort((a, b) => (b.weekViews ?? 0) - (a.weekViews ?? 0))
        .slice(0, 8);
    }

    if (rankingTab === "monthly") {
      return [...mangas]
        .sort((a, b) => (b.monthViews ?? 0) - (a.monthViews ?? 0))
        .slice(0, 8);
    }

    return [...mangas]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 8);
  }, [mangas, rankingTab]);

  const topReaders = useMemo(() => {
    return [...readers]
      .sort((a, b) => (b.xpTotal ?? 0) - (a.xpTotal ?? 0))
      .slice(0, 8);
  }, [readers]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-cyan-400">🏆 Ranking</h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => onChangeTab("daily")}
          className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
            rankingTab === "daily"
              ? "bg-cyan-500 text-black"
              : "border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
          }`}
        >
          Diário
        </button>

        <button
          onClick={() => onChangeTab("weekly")}
          className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
            rankingTab === "weekly"
              ? "bg-cyan-500 text-black"
              : "border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
          }`}
        >
          Semanal
        </button>

        <button
          onClick={() => onChangeTab("monthly")}
          className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
            rankingTab === "monthly"
              ? "bg-cyan-500 text-black"
              : "border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
          }`}
        >
          Mensal
        </button>

        <button
          onClick={() => onChangeTab("readers")}
          className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
            rankingTab === "readers"
              ? "bg-cyan-500 text-black"
              : "border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
          }`}
        >
          Top leitores
        </button>
      </div>

      {rankingTab !== "readers" ? (
        <div className="space-y-3">
          {rankingMangas.length === 0 ? (
            <div className="text-sm text-zinc-500">Sem dados.</div>
          ) : (
            rankingMangas.map((manga, idx) => {
              const cover = proxifyImage(manga.cover);

              return (
                <Link
                  key={`${rankingTab}-${manga.id}`}
                  href={`/manga/${manga.id}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-black/20 p-3 hover:border-cyan-400 transition"
                >
                  <div className="w-7 text-center font-bold text-zinc-400">
                    {idx + 1}
                  </div>

                  {cover ? (
                    <img
                      src={cover}
                      alt={manga.title}
                      className="h-12 w-10 rounded object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-10 rounded bg-zinc-800 shrink-0" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold line-clamp-1">{manga.title}</div>
                    <div className="text-xs text-zinc-500">
                      {formatRankValue(rankingTab, manga).toLocaleString()} views
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {topReaders.length === 0 ? (
            <div className="text-sm text-zinc-500">Sem leitores ainda.</div>
          ) : (
            topReaders.map((reader, idx) => (
              <Link
                key={`reader-${reader.id}`}
                href="/ranking-users"
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-black/20 p-3 hover:border-cyan-400 transition"
              >
                <div className="w-7 text-center font-bold text-zinc-400">
                  {idx + 1}
                </div>

                {reader.photoURL ? (
                  <img
                    src={reader.photoURL}
                    alt={formatReaderName(reader)}
                    className="h-12 w-12 rounded-full object-cover shrink-0 border border-zinc-700"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-zinc-800 shrink-0 flex items-center justify-center font-bold">
                    {formatReaderName(reader).slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="font-semibold line-clamp-1">
                    {formatReaderName(reader)}
                  </div>
                  <div className="text-xs text-zinc-500 line-clamp-1">
                    {reader.title || "Leitor Iniciante"}
                    {reader.vipTier ? ` • ${getVipBadge(reader.vipTier)}` : ""}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-bold text-cyan-300">
                    Lv. {reader.level || 1}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    {reader.xpTotal ?? 0} XP
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();

  const [mangas, setMangas] = useState<Manga[]>([]);
  const [recentReads, setRecentReads] = useState<HistoryItem[]>([]);
  const [readers, setReaders] = useState<ReaderRankItem[]>([]);
  const [queryText, setQueryText] = useState("");
  const [genreFilter, setGenreFilter] = useState("Todos");
  const [orderMode, setOrderMode] = useState<OrderMode>("updated");
  const [rankingTab, setRankingTab] = useState<RankingTab>("weekly");

  const autoTabs: RankingTab[] = ["daily", "weekly", "monthly", "readers"];
  const pauseUntilRef = useRef<number>(0);

  function handleManualChangeTab(tab: RankingTab) {
    setRankingTab(tab);
    pauseUntilRef.current = Date.now() + 10000;
  }

  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;

      setRankingTab((prev) => {
        const currentIndex = autoTabs.indexOf(prev);
        const nextIndex = (currentIndex + 1) % autoTabs.length;
        return autoTabs[nextIndex];
      });
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    async function fetchMangas() {
      const q = query(collection(db, "mangas"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);

      const data: Manga[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Manga, "id">),
      }));

      setMangas(data);
    }

    async function fetchReaders() {
      try {
        const snap = await getDocs(collection(db, "users"));
        const data: ReaderRankItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ReaderRankItem, "id">),
        }));
        setReaders(data);
      } catch (e) {
        console.error(e);
      }
    }

    fetchMangas();
    fetchReaders();
  }, []);

  useEffect(() => {
    async function fetchRecentReads() {
      if (!user?.uid) {
        setRecentReads([]);
        return;
      }

      try {
        const res = await fetch(`/api/history?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        setRecentReads(data?.items || []);
      } catch (e) {
        console.error(e);
      }
    }

    fetchRecentReads();
  }, [user?.uid]);

  const genres = useMemo(() => {
    const set = new Set<string>();
    mangas.forEach((m) => m.genre && set.add(m.genre));
    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [mangas]);

  const normalized = (s: string) => s.toLowerCase().trim();

  const filtered = useMemo(() => {
    const q = normalized(queryText);

    let list = mangas.filter((m) => {
      const okQuery = q ? normalized(m.title).includes(q) : true;
      const okGenre = genreFilter === "Todos" ? true : m.genre === genreFilter;
      return okQuery && okGenre;
    });

    if (orderMode === "az") {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (orderMode === "views") {
      list = [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    } else if (orderMode === "created") {
      list = [...list].sort((a, b) => tsSeconds(b.createdAt) - tsSeconds(a.createdAt));
    } else {
      list = [...list].sort((a, b) => {
        const bu = tsSeconds(b.updatedAt);
        const au = tsSeconds(a.updatedAt);
        if (bu !== au) return bu - au;
        return tsSeconds(b.createdAt) - tsSeconds(a.createdAt);
      });
    }

    return list;
  }, [mangas, queryText, genreFilter, orderMode]);

  const topViews = useMemo(() => {
    return [...mangas].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 10);
  }, [mangas]);

  const topWeek = useMemo(() => {
    return [...mangas].sort((a, b) => (b.weekViews ?? 0) - (a.weekViews ?? 0)).slice(0, 10);
  }, [mangas]);

  const highlights = useMemo(() => filtered.slice(0, 10), [filtered]);
  const recentUpdated = useMemo(() => filtered.slice(0, 8), [filtered]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white">
      <div className="max-w-7xl mx-auto px-4 pb-12">
        <section className="mt-6 mb-8">
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-black via-zinc-900 to-black">
            <div className="p-6 md:p-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h2 className="text-2xl md:text-4xl font-extrabold text-cyan-400 drop-shadow-[0_0_12px_#00ffff]">
                  Bem-vindo ao LK-Scan
                </h2>

                <p className="mt-2 text-zinc-300 max-w-xl">
                  Leia mangás e manhwas online com atualização constante.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                  {user && (
                    <Link
                      href="/history"
                      className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-cyan-400"
                    >
                      📚 Vistos recentes
                    </Link>
                  )}

                  <Link
                    href="/ranking-users"
                    className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-cyan-400"
                  >
                    🏆 Top leitores
                  </Link>
                </div>
              </div>

              <img
                src="/logo.png"
                alt="LK"
                className="h-24 w-auto drop-shadow-[0_0_18px_#00ffff]"
              />
            </div>
          </div>
        </section>

        <section className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            placeholder="Buscar mangá..."
            className="p-3 rounded-xl bg-zinc-900 border border-zinc-800"
          />

          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="p-3 rounded-xl bg-zinc-900 border border-zinc-800"
          >
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>

          <select
            value={orderMode}
            onChange={(e) => setOrderMode(e.target.value as OrderMode)}
            className="p-3 rounded-xl bg-zinc-900 border border-zinc-800"
          >
            <option value="updated">Atualizados</option>
            <option value="created">Recentes</option>
            <option value="az">A-Z</option>
            <option value="views">Mais vistos</option>
          </select>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6 mb-10">
          <div className="space-y-10">
            {user && recentReads.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">📚 Vistos recentes</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recentReads.slice(0, 6).map((item) => {
                    const cover = proxifyImage(item.mangaCover);

                    return (
                      <Link
                        key={item.id}
                        href={`/manga/${item.mangaId}/chapter/${item.chapterId}`}
                        className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex gap-3 hover:border-cyan-400 transition"
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt={item.mangaTitle}
                            className="h-24 w-20 object-cover rounded-xl shrink-0"
                          />
                        ) : (
                          <div className="h-24 w-20 rounded-xl bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">
                            Sem capa
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold line-clamp-1 group-hover:text-cyan-300 transition">
                            {item.mangaTitle}
                          </div>
                          <div className="text-sm text-zinc-400 line-clamp-1 mt-1">
                            {item.chapterTitle || "Continuar leitura"}
                          </div>
                          <div className="text-xs text-zinc-500 mt-3">
                            Clique para continuar →
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-xl font-semibold mb-4">🆕 Atualizados</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentUpdated.map((manga) => {
                  const cover = proxifyImage(manga.cover);

                  return (
                    <Link
                      key={manga.id}
                      href={`/manga/${manga.id}`}
                      className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex gap-3 hover:border-cyan-400 transition"
                    >
                      {cover ? (
                        <img
                          src={cover}
                          alt={manga.title}
                          className="h-24 w-20 object-cover rounded-xl shrink-0"
                        />
                      ) : (
                        <div className="h-24 w-20 rounded-xl bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">
                          Sem capa
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold line-clamp-1 group-hover:text-cyan-300 transition">
                          {manga.title}
                        </div>
                        <div className="text-sm text-zinc-400 line-clamp-1 mt-1">
                          {manga.genre || "Sem gênero"}
                        </div>
                        <div className="text-xs text-zinc-500 mt-3">
                          {(manga.views ?? 0).toLocaleString()} views
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="hidden xl:block xl:sticky xl:top-[92px] h-fit">
            <RankingSidebar
              rankingTab={rankingTab}
              onChangeTab={handleManualChangeTab}
              mangas={mangas}
              readers={readers}
            />
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold mb-3">🔥 Destaques</h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {highlights.map((manga) => {
              const cover = proxifyImage(manga.cover);

              return (
                <Link
                  key={manga.id}
                  href={`/manga/${manga.id}`}
                  className="block rounded-xl overflow-hidden border border-zinc-800 hover:border-cyan-400 transition bg-zinc-900/50"
                >
                  {cover ? (
                    <img
                      src={cover}
                      alt={manga.title}
                      className="h-52 w-full object-cover"
                    />
                  ) : (
                    <div className="h-52 bg-zinc-800 flex items-center justify-center text-zinc-400">
                      Sem capa
                    </div>
                  )}

                  <div className="p-3 text-sm font-semibold">{manga.title}</div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">📈 Top da semana</h2>

          <div className="grid md:grid-cols-2 gap-3">
            {topWeek.map((m, idx) => {
              const cover = proxifyImage(m.cover);

              return (
                <Link
                  key={m.id}
                  href={`/manga/${m.id}`}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 hover:border-cyan-400 transition"
                >
                  <div className="w-8 text-center text-zinc-400 font-bold">{idx + 1}</div>

                  {cover ? (
                    <img
                      src={cover}
                      alt={m.title}
                      className="h-14 w-11 object-cover rounded"
                    />
                  ) : (
                    <div className="h-14 w-11 bg-zinc-800 rounded" />
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold line-clamp-1">{m.title}</div>
                    <div className="text-xs text-zinc-400">
                      {(m.weekViews ?? 0).toLocaleString()} views nesta semana
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold mb-3">🏆 Top 10 geral</h2>

          {topViews.map((m, idx) => {
            const cover = proxifyImage(m.cover);

            return (
              <Link
                key={m.id}
                href={`/manga/${m.id}`}
                className="flex items-center gap-3 p-2 hover:bg-zinc-800 rounded"
              >
                <span className="w-6">{idx + 1}</span>

                {cover ? (
                  <img
                    src={cover}
                    alt={m.title}
                    className="h-10 w-8 object-cover rounded"
                  />
                ) : (
                  <div className="h-10 w-8 bg-zinc-800 rounded" />
                )}

                <span>{m.title}</span>
              </Link>
            );
          })}
        </section>

        <section className="mt-12 xl:hidden">
          <RankingSidebar
            rankingTab={rankingTab}
            onChangeTab={handleManualChangeTab}
            mangas={mangas}
            readers={readers}
          />
        </section>
      </div>
    </main>
  );
}