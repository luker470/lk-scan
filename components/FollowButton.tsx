"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

type FollowingItem = {
  id: string;
};

export default function FollowButton({
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
  const router = useRouter();

  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.uid) {
        setFollowing(false);
        return;
      }

      try {
        const res = await fetch(`/api/following?uid=${encodeURIComponent(user.uid)}`);
        const data = await res.json();

        if (!data?.ok) return;

        const exists = (data.items || []).some((item: FollowingItem) => item.id === mangaId);

        if (!cancelled) {
          setFollowing(exists);
        }
      } catch (e) {
        console.error("Erro ao carregar seguindo:", e);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, mangaId]);

  async function toggleFollowing() {
    if (!user?.uid) {
      router.push("/login");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/following", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          uid: user.uid,
          mangaId,
          title,
          cover,
          genre,
        }),
      });

      const data = await res.json();

      if (data?.ok) {
        setFollowing(!!data.following);
      } else {
        console.error("Não consegui atualizar seguindo.");
      }
    } catch (e) {
      console.error("Erro ao seguir:", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={toggleFollowing}
      disabled={loading}
      className={`px-5 py-3 rounded-xl font-bold transition text-center ${
        following
          ? "bg-cyan-500 text-black hover:bg-cyan-400"
          : "border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
      } ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
    >
      {loading ? "Salvando..." : following ? "🔔 Seguindo" : "🔔 Seguir"}
    </button>
  );
}