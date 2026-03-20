"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { proxifyImage } from "@/lib/imgProxy";

type Manga = {
  id: string;
  title?: string;
  genre?: string;
  cover?: string;
  banner?: string;
  description?: string;
  status?: string;
  author?: string;
  artist?: string;
  sourceUrl?: string;
  autoSync?: boolean;
  views?: number;
  weekViews?: number;
  dayViews?: number;
  monthViews?: number;
  chaptersCount?: number;
  lastChapterNumber?: number;
  updatedAt?: any;
  createdAt?: any;
};

function safeText(v: unknown) {
  return typeof v === "string" ? v : "";
}

function splitGenres(value?: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function tsSeconds(v: any) {
  return v?.seconds ?? 0;
}

const PAGE_SIZE = 24;

export default function MangaList({
  onSelect,
}: {
  onSelect: (m: Manga) => void;
}) {
  const [list, setList] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [qtxt, setQtxt] = useState("");
  const [debounced, setDebounced] = useState("");

  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(qtxt.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [qtxt]);

  async function fetchPage(opts?: { reset?: boolean }) {
    const reset = !!opts?.reset;

    if (reset) {
      setLoading(true);
      setHasMore(true);
      lastDocRef.current = null;
    } else {
      setLoadingMore(true);
    }

    try {
      if (!db) {
        setList([]);
        setHasMore(false);
        return;
      }

      const colRef = collection(db, "mangas");

      let q1 = query(colRef, orderBy("updatedAt", "desc"), limit(PAGE_SIZE));

      if (!reset && lastDocRef.current) {
        q1 = query(
          colRef,
          orderBy("updatedAt", "desc"),
          startAfter(lastDocRef.current),
          limit(PAGE_SIZE)
        );
      }

      let snap;
      try {
        snap = await getDocs(q1);
      } catch {
        let q2 = query(colRef, orderBy("createdAt", "desc"), limit(PAGE_SIZE));

        if (!reset && lastDocRef.current) {
          q2 = query(
            colRef,
            orderBy("createdAt", "desc"),
            startAfter(lastDocRef.current),
            limit(PAGE_SIZE)
          );
        }

        snap = await getDocs(q2);
      }

      const docs = snap.docs;
      const data = docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Manga, "id">),
      })) as Manga[];

      if (reset) setList(data);
      else setList((prev) => [...prev, ...data]);

      lastDocRef.current = docs.length ? docs[docs.length - 1] : lastDocRef.current;
      setHasMore(docs.length === PAGE_SIZE);
    } catch (error) {
      console.error("Erro ao carregar lista de mangás:", error);
      if (reset) setList([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchPage({ reset: true });
  }, []);

  const filtered = useMemo(() => {
    if (!debounced) return list;

    return list.filter((m) => {
      const title = safeText(m.title).toLowerCase();
      const genre = safeText(m.genre).toLowerCase();
      const description = safeText(m.description).toLowerCase();
      const author = safeText(m.author).toLowerCase();
      const artist = safeText(m.artist).toLowerCase();
      const status = safeText(m.status).toLowerCase();
      const sourceUrl = safeText(m.sourceUrl).toLowerCase();
      const id = safeText(m.id).toLowerCase();

      return (
        title.includes(debounced) ||
        genre.includes(debounced) ||
        description.includes(debounced) ||
        author.includes(debounced) ||
        artist.includes(debounced) ||
        status.includes(debounced) ||
        sourceUrl.includes(debounced) ||
        id.includes(debounced)
      );
    });
  }, [list, debounced]);

  const stats = useMemo(() => {
    const getScore = (m: Manga) => {
      const u = tsSeconds(m.updatedAt);
      const c = tsSeconds(m.createdAt);
      return u || c || 0;
    };

    const newest = [...list].sort((a, b) => getScore(b) - getScore(a))[0];

    return {
      newestId: newest?.id || null,
    };
  }, [list]);

  if (loading) {
    return <div className="text-zinc-300">Carregando lista...</div>;
  }

  if (list.length === 0) {
    return <div className="text-zinc-300">Nenhum mangá ainda.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3">
        <input
          value={qtxt}
          onChange={(e) => setQtxt(e.target.value)}
          placeholder="Buscar por título, gênero, autor, artista, status, ID..."
          className="flex-1 p-3 rounded-xl bg-zinc-800/70 border border-zinc-700 outline-none focus:border-cyan-400"
        />

        <button
          onClick={() => fetchPage({ reset: true })}
          className="px-4 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition font-semibold"
        >
          🔄 Atualizar
        </button>
      </div>

      <div className="text-[11px] text-zinc-500">
        Carregados: <b className="text-zinc-200">{list.length}</b> • Mostrando:{" "}
        <b className="text-zinc-200">{filtered.length}</b>
        {stats.newestId ? (
          <>
            {" "}
            • Mais recente: <span className="text-zinc-300">{stats.newestId}</span>
          </>
        ) : null}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((m) => {
          const cover = proxifyImage(m.cover);
          const genres = splitGenres(m.genre);
          const last =
            typeof m.lastChapterNumber === "number" && m.lastChapterNumber > 0
              ? pad3(m.lastChapterNumber)
              : null;

          return (
            <div
              key={m.id}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden"
            >
              {cover ? (
                <img
                  src={cover}
                  alt={m.title || "Mangá"}
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-40 w-full bg-zinc-800 flex items-center justify-center text-zinc-500">
                  Sem capa
                </div>
              )}

              <div className="p-4 space-y-2">
                <div className="font-bold line-clamp-1">{m.title || "Sem título"}</div>

                <div className="flex flex-wrap gap-2">
                  {genres.length > 0 ? (
                    genres.slice(0, 2).map((g) => (
                      <span
                        key={`${m.id}-${g}`}
                        className="rounded-full border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300"
                      >
                        {g}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-full border border-zinc-700 px-2 py-1 text-[11px] text-zinc-400">
                      Sem gênero
                    </span>
                  )}

                  {m.status ? (
                    <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-300">
                      {m.status}
                    </span>
                  ) : null}

                  {m.autoSync ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-300">
                      Auto sync
                    </span>
                  ) : null}
                </div>

                <div className="text-xs text-zinc-400 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    Views: <b className="text-zinc-200">{(m.views ?? 0).toLocaleString()}</b>
                  </span>
                  <span>
                    Capítulos: <b className="text-zinc-200">{m.chaptersCount ?? 0}</b>
                  </span>
                  {last ? (
                    <span>
                      Último: <b className="text-zinc-200">{last}</b>
                    </span>
                  ) : null}
                </div>

                {(m.author || m.artist) && (
                  <div className="text-xs text-zinc-500 space-y-1">
                    {m.author ? <div>Autor: {m.author}</div> : null}
                    {m.artist ? <div>Artista: {m.artist}</div> : null}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => onSelect(m)}
                    className="flex-1 rounded-xl bg-cyan-500 px-3 py-2 font-bold text-black hover:bg-cyan-600 transition"
                  >
                    Selecionar
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(m.id);
                      } catch {}
                    }}
                    className="rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
                    title="Copiar MangaId"
                  >
                    📋
                  </button>

                  <a
                    href={`/manga/${m.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-zinc-700 px-3 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
                    title="Abrir no site"
                  >
                    🔗
                  </a>
                </div>

                <div className="text-[11px] text-zinc-500 break-all">ID: {m.id}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="pt-2 flex justify-center">
        {hasMore ? (
          <button
            onClick={() => fetchPage({ reset: false })}
            disabled={loadingMore}
            className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition font-semibold disabled:opacity-50"
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </button>
        ) : (
          <div className="text-xs text-zinc-500">Você já carregou tudo.</div>
        )}
      </div>
    </div>
  );
}