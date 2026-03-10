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
  updatedAt?: any;
};

function formatDate(v: any) {
  const seconds = v?.seconds;
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleString("pt-BR");
}

export default function HistoryPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.uid) {
        setPageLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/history?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();
        setItems(data?.items || []);
      } catch (e) {
        console.error(e);
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) load();
  }, [user?.uid, loading]);

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando leituras recentes...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        Faça login para ver o que você está lendo.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-cyan-400">📚 Lendo recentes</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Aqui aparecem apenas os capítulos que você abriu recentemente.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-300">
            Você ainda não abriu nenhum capítulo.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => {
              const coverSrc = proxifyImage(item.mangaCover);

              return (
                <Link
                  key={item.id}
                  href={`/manga/${item.mangaId}/chapter/${item.chapterId}`}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 flex gap-4 hover:border-cyan-400 transition"
                >
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={item.mangaTitle}
                      className="h-24 w-20 object-cover rounded-xl"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-24 w-20 rounded-xl flex items-center justify-center bg-zinc-800 text-zinc-400 text-xs">
                      Sem capa
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold line-clamp-1">{item.mangaTitle}</div>
                    <div className="text-sm text-zinc-400 line-clamp-1">
                      {item.chapterTitle || "Continuar leitura"}
                    </div>
                    <div className="text-xs text-zinc-500 mt-2">
                      {formatDate(item.updatedAt)}
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