"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getVipBadge } from "@/lib/titles";

type UserRankItem = {
  id: string;
  displayName?: string;
  username?: string;
  photoURL?: string;
  level?: number;
  xpTotal?: number;
  title?: string;
  vipTier?: string | null;
};

export default function RankingUsersPage() {
  const [items, setItems] = useState<UserRankItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const snap = await getDocs(
          query(collection(db, "users"), orderBy("xpTotal", "desc"), limit(50))
        );

        setItems(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UserRankItem, "id">),
          }))
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando ranking...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-cyan-400">
            🏆 Ranking de usuários
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Ranking por XP total acumulado.
          </p>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <div className="w-8 text-center font-bold text-zinc-400">
                {index + 1}
              </div>

              {item.photoURL ? (
                <img
                  src={item.photoURL}
                  alt={item.displayName || item.username || "User"}
                  className="h-14 w-14 rounded-full object-cover border border-zinc-700"
                />
              ) : (
                <div className="h-14 w-14 rounded-full bg-zinc-800 flex items-center justify-center">
                  {(item.displayName || item.username || "U")
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="font-semibold line-clamp-1">
                  {item.displayName || item.username || "Usuário"}
                </div>
                <div className="text-sm text-zinc-400 line-clamp-1">
                  @{item.username || "usuario"}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {item.title || "Leitor Iniciante"}
                  {item.vipTier ? ` • ${getVipBadge(item.vipTier)}` : ""}
                </div>
              </div>

              <div className="text-right">
                <div className="font-bold text-cyan-300">
                  Lv. {item.level || 1}
                </div>
                <div className="text-xs text-zinc-500">
                  {item.xpTotal || 0} XP
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}