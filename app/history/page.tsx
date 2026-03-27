"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { proxifyImage } from "@/lib/imgProxy";

type HistoryItem = {
  id: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  mangaCover?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  updatedAt?: {
    seconds?: number;
    _seconds?: number;
  };
};

function formatDate(v: any) {
  const seconds = v?.seconds || v?._seconds;
  if (!seconds) return "Sem data";
  return new Date(seconds * 1000).toLocaleString("pt-BR");
}

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.uid) {
        setPageLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/history?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();

        if (!cancelled) {
          setItems(data?.items || []);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setPageLoading(false);
        }
      }
    }

    if (!loading) load();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, loading]);

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando histórico...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        Faça login para acessar seu histórico.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-3xl font-bold text-cyan-400">📚 Histórico de leitura</h1>

          <Link
            href="/profile"
            className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            Voltar ao perfil
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-300">
            Você ainda não possui histórico de leitura.
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => {
              const coverSrc = proxifyImage(item.mangaCover);

              return (
                <Link
                  key={item.id}
                  href={`/manga/${item.mangaId}/chapter/${item.chapterId}`}
                  className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 hover:border-cyan-400 transition flex gap-4"
                >
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={item.mangaTitle}
                      className="h-28 w-20 rounded-xl object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-28 w-20 rounded-xl bg-zinc-800 shrink-0 flex items-center justify-center text-xs text-zinc-500">
                      Sem capa
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold line-clamp-1 group-hover:text-cyan-300 transition">
                      {item.mangaTitle}
                    </div>

                    <div className="mt-1 text-sm text-zinc-300 line-clamp-1">
                      {item.chapterTitle || "Continuar leitura"}
                    </div>

                    {typeof item.chapterNumber === "number" && item.chapterNumber > 0 ? (
                      <div className="mt-2 text-xs text-zinc-500">
                        Capítulo {item.chapterNumber}
                      </div>
                    ) : null}

                    <div className="mt-2 text-xs text-zinc-500">
                      Última leitura: {formatDate(item.updatedAt)}
                    </div>
                  </div>

                  <div className="shrink-0 self-center text-sm text-zinc-400 group-hover:text-cyan-300 transition">
                    Abrir →
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