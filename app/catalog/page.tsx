"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { proxifyImage } from "@/lib/imgProxy";

type Manga = {
  id: string;
  title: string;
  cover?: string;
  genre?: string;
  status?: string;
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

export default function CatalogPage() {
  const [items, setItems] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [orderMode, setOrderMode] = useState<OrderMode>("updated");

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const snap = await getDocs(
          query(collection(db, "mangas"), orderBy("createdAt", "desc"))
        );

        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Manga, "id">),
        }));

        setItems(list);
      } catch (e) {
        console.error("Erro ao carregar catálogo:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const genres = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => m.genre && set.add(m.genre));
    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => m.status && set.add(m.status));
    return ["Todos", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();

    let list = items.filter((m) => {
      const okSearch = q ? (m.title || "").toLowerCase().includes(q) : true;
      const okGenre = genre === "Todos" ? true : m.genre === genre;
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
        return tsSeconds(b.createdAt) - tsSeconds(a.createdAt);
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
        )}
      </div>
    </main>
  );
}