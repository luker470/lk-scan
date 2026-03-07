"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export default function FavoriteButton({
  mangaId,
  title,
  cover,
  genre,
}: {
  mangaId: string;
  title: string;
  cover?: string;
  genre?: string;
}) {
  const { user } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user?.uid) return;

      try {
        const res = await fetch(`/api/favorites?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();

        if (!data?.ok) return;

        const exists = (data.items || []).some((item: any) => item.id === mangaId);
        setFavorited(exists);
      } catch (e) {
        console.error(e);
      }
    }

    load();
  }, [user?.uid, mangaId]);

  async function toggleFavorite() {
    if (!user?.uid) {
      alert("Aguardando login...");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, mangaId, title, cover, genre }),
      });

      const data = await res.json();
      if (data?.ok) {
        setFavorited(!!data.favorited);
      }
    } catch (e) {
      console.error(e);
      alert("Não consegui atualizar os favoritos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggleFavorite}
      disabled={loading}
      className={`px-5 py-3 rounded-xl font-bold transition text-center ${
        favorited
          ? "bg-pink-500 text-white hover:bg-pink-600"
          : "border border-zinc-700 text-zinc-200 hover:border-pink-400 hover:text-pink-300"
      }`}
    >
      {loading ? "Salvando..." : favorited ? "❤️ Favoritado" : "🤍 Favoritar"}
    </button>
  );
}