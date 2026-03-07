"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { proxifyImage } from "@/lib/imgProxy";

type LatestItem = {
  mangaId: string;
  mangaTitle: string;
  mangaCover?: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber?: number;
  updatedAt?: any;
};

function tsSeconds(v: any) {
  return v?.seconds ?? 0;
}

function formatDate(v: any) {
  const seconds = v?.seconds;
  if (!seconds) return "Sem data";
  return new Date(seconds * 1000).toLocaleString("pt-BR");
}

export default function LatestPage() {
  const [items, setItems] = useState<LatestItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const mangasSnap = await getDocs(
          query(collection(db, "mangas"), orderBy("updatedAt", "desc"))
        );

        const list: LatestItem[] = [];

        for (const mangaDoc of mangasSnap.docs) {
          const manga = mangaDoc.data() as any;

          const chaptersSnap = await getDocs(
            query(
              collection(db, "mangas", mangaDoc.id, "chapters"),
              orderBy("number", "desc")
            )
          );

          const first = chaptersSnap.docs[0];
          if (!first) continue;

          const chapter = first.data() as any;

          list.push({
            mangaId: mangaDoc.id,
            mangaTitle: manga.title || "Sem título",
            mangaCover: manga.cover || "",
            chapterId: first.id,
            chapterTitle:
              chapter.title ||
              (typeof chapter.number === "number"
                ? `Capítulo ${String(chapter.number).padStart(3, "0")}`
                : "Novo capítulo"),
            chapterNumber: chapter.number,
            updatedAt: manga.updatedAt || manga.createdAt,
          });
        }

        list.sort((a, b) => tsSeconds(b.updatedAt) - tsSeconds(a.updatedAt));
        setItems(list);
      } catch (e) {
        console.error("Erro ao carregar latest:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white flex items-center justify-center">
        Carregando atualizações...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">🆕 Últimas atualizações</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Veja os mangás atualizados mais recentemente no LK-Scan.
            </p>
          </div>

          <Link
            href="/"
            className="w-fit px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            ← Voltar para Home
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-300">
            Nenhuma atualização encontrada.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => {
              const coverSrc = proxifyImage(item.mangaCover);

              return (
                <Link
                  key={`${item.mangaId}-${item.chapterId}`}
                  href={`/manga/${item.mangaId}/chapter/${item.chapterId}`}
                  className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex gap-4 hover:border-cyan-400 hover:bg-zinc-900/70 transition"
                >
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={item.mangaTitle}
                      className="h-28 w-20 object-cover rounded-xl shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-28 w-20 rounded-xl bg-zinc-800 flex items-center justify-center text-xs text-zinc-400 shrink-0">
                      Sem capa
                    </div>
                  )}

                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div className="space-y-1">
                      <div className="text-lg font-semibold line-clamp-1 group-hover:text-cyan-300 transition">
                        {item.mangaTitle}
                      </div>

                      <div className="text-sm text-zinc-300 line-clamp-1">
                        {item.chapterTitle}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                          {typeof item.chapterNumber === "number"
                            ? `Cap. ${String(item.chapterNumber).padStart(3, "0")}`
                            : "Novo capítulo"}
                        </span>

                        <span className="text-xs text-zinc-500">
                          {formatDate(item.updatedAt)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 text-xs text-zinc-500 group-hover:text-zinc-400 transition">
                      Clique para continuar lendo →
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