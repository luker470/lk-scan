"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { proxifyImage } from "@/lib/imgProxy";

type FavoriteItem = {
  id: string;
  mangaId: string;
  title: string;
  cover?: string;
  genre?: string;
};

export default function FavoritesPage() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!user?.uid) {
        setPageLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/favorites?uid=${encodeURIComponent(user.uid)}`);
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
        Carregando favoritos...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        Aguarde o login anônimo para acessar seus favoritos.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-cyan-400">❤️ Seus favoritos</h1>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-300">
            Você ainda não favoritou nenhum mangá.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => {
              const coverSrc = proxifyImage(item.cover);

              return (
                <Link
                  key={item.id}
                  href={`/manga/${item.id}`}
                  className="bg-zinc-900/60 rounded-2xl p-3 border border-zinc-800 hover:border-cyan-400 transition block"
                >
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={item.title}
                      className="h-44 w-full object-cover rounded-xl mb-2"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-44 w-full rounded-xl mb-2 flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm">
                      Sem capa
                    </div>
                  )}

                  <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                  <p className="text-xs text-zinc-400">{item.genre || "Sem gênero"}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
