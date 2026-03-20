"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  title: string;
  cover?: string;
  banner?: string;
  genre?: string;
  status?: string;
  description?: string;
  author?: string;
  artist?: string;
  views?: number;
  chaptersCount?: number;
  updatedAt?: any;
  createdAt?: any;
};

type OrderMode = "updated" | "created" | "az" | "views";

function tsSeconds(v: any) {
  return v?.seconds ?? 0;
}

function formatStatus(status?: string) {
  if (!status) return "";
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
    .map((g) => g.trim())
    .filter(Boolean);
}

const PAGE_SIZE = 40;

export default function CatalogPage() {
  const [items, setItems] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [orderMode, setOrderMode] = useState<OrderMode>("updated");

  async function load(reset = false) {
    if (!db) {
      setItems([]);
      setHasMore(false);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    if (reset) {
      setLoading(true);
      setLastDoc(null);
      setHasMore(true);
    } else {
      if (!hasMore || loadingMore) return;
      setLoadingMore(true);
    }

    try {
      const colRef = collection(db, "mangas");

      const currentLastDoc = reset ? null : lastDoc;

      let qRef = query(colRef, orderBy("updatedAt", "desc"), limit(PAGE_SIZE));

      if (currentLastDoc) {
        qRef = query(
          colRef,
          orderBy("updatedAt", "desc"),
          startAfter(currentLastDoc),
          limit(PAGE_SIZE)
        );
      }

      const snap = await getDocs(qRef);

      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Manga, "id">),
      }));

      if (reset) {
        setItems(list);
      } else {
        setItems((prev) => {
          const map = new Map<string, Manga>();

          for (const item of prev) {
            map.set(item.id, item);
          }

          for (const item of list) {
            map.set(item.id, item);
          }

          return Array.from(map.values());
        });
      }

      setLastDoc(snap.docs.length ? snap.docs[snap.docs.length - 1] : null);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (e) {
      console.error("Erro ao carregar catálogo:", e);
      if (reset) setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const genres = useMemo(() => {
    const set = new Set<string>();

    items.forEach((m) => {
      splitGenres(m.genre).forEach((g) => set.add(g));
    });

    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => {
      if (m.status) set.add(m.status);
    });
    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    let list = items.filter((m) => {
      const title = (m.title || "").toLowerCase();
      const genresText = (m.genre || "").toLowerCase();
      const author = (m.author || "").toLowerCase();
      const artist = (m.artist || "").toLowerCase();
      const description = (m.description || "").toLowerCase();

      const okSearch = q
        ? title.includes(q) ||
          genresText.includes(q) ||
          author.includes(q) ||
          artist.includes(q) ||
          description.includes(q)
        : true;

      const okGenre =
        genre === "Todos" ? true : splitGenres(m.genre).includes(genre);

      const okStatus = status === "Todos" ? true : m.status === status;

      return okSearch && okGenre && okStatus;
    });

    if (orderMode === "az") {
      list = [...list].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (orderMode === "views") {
      list = [...list].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
    } else if (orderMode === "created") {
      list = [...list].sort((a, b) => tsSeconds(b.createdAt) - tsSeconds(a.createdAt));
    } else {
      list = [...list].sort((a, b) => {
        const bu = tsSeconds(b.updatedAt);
        const au = tsSeconds(a.updatedAt);

        if (bu !== au) return bu - au;

        const bc = tsSeconds(b.createdAt);
        const ac = tsSeconds(a.createdAt);

        if (bc !== ac) return bc - ac;

        return (a.title || "").localeCompare(b.title || "");
      });
    }

    return list;
  }, [items, search, genre, status, orderMode]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white flex items-center justify-center">
        Carregando catálogo...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">📚 Catálogo</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Explore todos os mangás disponíveis no LK-Scan.
            </p>
          </div>

          <Link
            href="/"
            className="w-fit px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            ← Voltar para Home
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar mangá..."
              className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none focus:border-cyan-400"
            />

            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none focus:border-cyan-400"
            >
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none focus:border-cyan-400"
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {formatStatus(s)}
                </option>
              ))}
            </select>

            <select
              value={orderMode}
              onChange={(e) => setOrderMode(e.target.value as OrderMode)}
              className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 outline-none focus:border-cyan-400"
            >
              <option value="updated">Últimos atualizados</option>
              <option value="created">Últimos adicionados</option>
              <option value="az">A-Z</option>
              <option value="views">Mais vistos</option>
            </select>
          </div>

          <div className="mt-4 text-sm text-zinc-400">
            {filtered.length} resultado{filtered.length !== 1 ? "s" : ""} encontrado
            {filtered.length !== 1 ? "s" : ""}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-300">
            Nenhum mangá encontrado com esses filtros.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((manga) => {
                const coverSrc = proxifyImage(manga.cover);

                return (
                  <Link
                    key={manga.id}
                    href={`/manga/${manga.id}`}
                    className="group bg-zinc-900/60 rounded-2xl p-3 border border-zinc-800 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(34,211,238,0.12)] transition block"
                  >
                    {coverSrc ? (
                      <img
                        src={coverSrc}
                        alt={manga.title}
                        className="h-52 w-full object-cover rounded-xl mb-3"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-52 w-full rounded-xl mb-3 flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm">
                        Sem capa
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-sm font-semibold line-clamp-1 group-hover:text-cyan-300 transition">
                        {manga.title}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full border border-zinc-700 bg-black/40 px-2 py-1 text-[11px] text-zinc-300">
                          {manga.genre || "Sem gênero"}
                        </span>

                        {!!manga.status && (
                          <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-300">
                            {formatStatus(manga.status)}
                          </span>
                        )}
                      </div>

                      {(manga.author || manga.artist) && (
                        <div className="text-[11px] text-zinc-500 line-clamp-2">
                          {manga.author ? `Autor: ${manga.author}` : ""}
                          {manga.author && manga.artist ? " • " : ""}
                          {manga.artist ? `Artista: ${manga.artist}` : ""}
                        </div>
                      )}

                      {!!manga.description && (
                        <div className="text-[11px] text-zinc-500 line-clamp-2">
                          {manga.description}
                        </div>
                      )}

                      <div className="text-[11px] text-zinc-500 space-y-1">
                        <div>
                          {typeof manga.chaptersCount === "number"
                            ? `${manga.chaptersCount} capítulos`
                            : "Capítulos não informados"}
                        </div>
                        <div>{(manga.views ?? 0).toLocaleString()} views</div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>

            <div className="pt-4 flex justify-center">
              {hasMore ? (
                <button
                  onClick={() => load(false)}
                  disabled={loadingMore}
                  className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition font-semibold disabled:opacity-50"
                >
                  {loadingMore ? "Carregando..." : "Carregar mais"}
                </button>
              ) : (
                <div className="text-xs text-zinc-500">Fim do catálogo carregado.</div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
