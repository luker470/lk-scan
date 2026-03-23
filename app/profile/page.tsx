"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  collection,
  getDocs,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { getLevelFromXp } from "@/lib/levels";
import { getVipBadge } from "@/lib/titles";

type UserProfile = {
  displayName?: string;
  username?: string;
  usernameLower?: string;
  photoURL?: string;
  bio?: string;
  level?: number;
  xp?: number;
  xpTotal?: number;
  xpToNext?: number;
  progressPercent?: number;
  title?: string;
  isVip?: boolean;
  vipTier?: string | null;
  chaptersRead?: number;
  favoritesCount?: number;
  commentsCount?: number;
  preferredLanguage?: string;
  preferredReaderMode?: "fitWidth" | "fitHeight" | "paged";
  theme?: "dark" | "light" | "system";
  createdAt?: any;
};

type HistoryItem = {
  id: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  mangaCover?: string;
  chapterTitle?: string;
};

type FavoriteItem = {
  id: string;
  mangaId: string;
  title: string;
  cover?: string;
  genre?: string;
};

function proxifyImage(url?: string) {
  if (!url) return "";
  return `/api/img?url=${encodeURIComponent(url)}`;
}

export default function ProfilePage() {
  const { user, loading } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("pt-BR");
  const [preferredReaderMode, setPreferredReaderMode] = useState<
    "fitWidth" | "fitHeight" | "paged"
  >("fitWidth");
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    async function load() {
      if (!user?.uid) {
        setPageLoading(false);
        return;
      }

      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.data() as UserProfile | undefined;

        if (userData) {
          setProfile(userData);
          setDisplayName(userData.displayName || "");
          setBio(userData.bio || "");
          setPhotoURL(userData.photoURL || "");
          setPreferredLanguage(userData.preferredLanguage || "pt-BR");
          setPreferredReaderMode(userData.preferredReaderMode || "fitWidth");
          setTheme(userData.theme || "dark");
        }

        const historySnap = await getDocs(
          query(
            collection(db, "users", user.uid, "history"),
            orderBy("updatedAt", "desc"),
            limit(4)
          )
        );

        setHistoryItems(
          historySnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<HistoryItem, "id">),
          }))
        );

        const favoritesSnap = await getDocs(
          query(collection(db, "users", user.uid, "favorites"), limit(4))
        );

        setFavoriteItems(
          favoritesSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<FavoriteItem, "id">),
          }))
        );
      } catch (e) {
        console.error(e);
      } finally {
        setPageLoading(false);
      }
    }

    if (!loading) load();
  }, [user?.uid, loading]);

  const levelData = useMemo(() => {
    return getLevelFromXp(profile?.xpTotal || 0);
  }, [profile?.xpTotal]);

  async function handleSave() {
    if (!user?.uid) return;

    setSaving(true);

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          displayName: displayName.trim(),
          bio: bio.trim(),
          photoURL: photoURL.trim(),
          preferredLanguage: preferredLanguage.trim(),
          preferredReaderMode,
          theme,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfile((prev) => ({
        ...(prev || {}),
        displayName: displayName.trim(),
        bio: bio.trim(),
        photoURL: photoURL.trim(),
        preferredLanguage: preferredLanguage.trim(),
        preferredReaderMode,
        theme,
      }));

      alert("Perfil atualizado.");
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando perfil...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        Faça login para acessar seu perfil.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <section className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60">
          <div className="h-40 md:h-52 bg-gradient-to-r from-cyan-900/40 via-zinc-900 to-black" />

          <div className="px-5 pb-5 md:px-8 md:pb-8">
            <div className="-mt-16 md:-mt-20 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-col md:flex-row items-start md:items-end gap-4">
                {photoURL ? (
                  <img
                    src={photoURL}
                    alt="Avatar"
                    className="h-28 w-28 md:h-36 md:w-36 rounded-full object-cover border-4 border-black shadow-[0_0_25px_rgba(0,255,255,0.15)]"
                  />
                ) : (
                  <div className="h-28 w-28 md:h-36 md:w-36 rounded-full bg-zinc-800 border-4 border-black flex items-center justify-center text-4xl font-extrabold shadow-[0_0_25px_rgba(0,255,255,0.15)]">
                    {(profile?.displayName || user.email || "U").slice(0, 1).toUpperCase()}
                  </div>
                )}

                <div className="space-y-1">
                  <h1 className="text-2xl md:text-3xl font-extrabold">
                    {profile?.displayName || "Usuário"}
                  </h1>
                  <div className="text-zinc-400">@{profile?.username || "usuario"}</div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold">
                      Nível {levelData.level}
                    </span>

                    <span className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-semibold">
                      {profile?.title || "Leitor Iniciante"}
                    </span>

                    {profile?.isVip && profile?.vipTier && (
                      <span className="px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-semibold">
                        {getVipBadge(profile.vipTier)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="w-full md:w-80">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-zinc-300">XP Total</span>
                  <span className="text-cyan-300 font-bold">{profile?.xpTotal || 0}</span>
                </div>

                <div className="h-3 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-cyan-500"
                    style={{ width: `${levelData.progressPercent}%` }}
                  />
                </div>

                <div className="mt-2 text-xs text-zinc-500">
                  {levelData.xpToNext > 0
                    ? `${levelData.xpToNext} XP para o próximo nível`
                    : "Nível máximo atual"}
                </div>
              </div>
            </div>

            {profile?.bio ? (
              <div className="mt-6 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-zinc-300">
                {profile.bio}
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-zinc-800 bg-black/30 p-4 text-zinc-500">
                Adicione uma biografia para deixar seu perfil mais completo.
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-lg font-bold text-cyan-400 mb-4">📊 Estatísticas</h2>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-black/30 p-3 border border-zinc-800">
                  <div className="text-xl font-extrabold">{profile?.chaptersRead || 0}</div>
                  <div className="text-[11px] text-zinc-500">Capítulos</div>
                </div>

                <div className="rounded-xl bg-black/30 p-3 border border-zinc-800">
                  <div className="text-xl font-extrabold">{profile?.favoritesCount || 0}</div>
                  <div className="text-[11px] text-zinc-500">Favoritos</div>
                </div>

                <div className="rounded-xl bg-black/30 p-3 border border-zinc-800">
                  <div className="text-xl font-extrabold">{profile?.commentsCount || 0}</div>
                  <div className="text-[11px] text-zinc-500">Comentários</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <h2 className="text-lg font-bold text-cyan-400 mb-4">⚙️ Editar perfil</h2>

              <div className="grid gap-4">
                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Nome de exibição</div>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Biografia</div>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={4}
                    className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Foto de perfil (URL)</div>
                  <input
                    value={photoURL}
                    onChange={(e) => setPhotoURL(e.target.value)}
                    placeholder="https://exemplo.com/avatar.png"
                    className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Idioma preferido</div>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value)}
                    className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="ja">日本語</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Modo do leitor</div>
                  <select
                    value={preferredReaderMode}
                    onChange={(e) =>
                      setPreferredReaderMode(
                        e.target.value as "fitWidth" | "fitHeight" | "paged"
                      )
                    }
                    className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
                  >
                    <option value="fitWidth">Ajustar largura</option>
                    <option value="fitHeight">Ajustar altura</option>
                    <option value="paged">Paginado</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Tema</div>
                  <select
                    value={theme}
                    onChange={(e) =>
                      setTheme(e.target.value as "dark" | "light" | "system")
                    }
                    className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
                  >
                    <option value="dark">Escuro</option>
                    <option value="light">Claro</option>
                    <option value="system">Sistema</option>
                  </select>
                </label>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-400 disabled:opacity-50"
                >
                  {saving ? "Salvando..." : "Salvar perfil"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-cyan-400">📚 Leituras recentes</h2>
                <Link href="/history" className="text-sm text-cyan-300 hover:text-cyan-200">
                  Ver tudo
                </Link>
              </div>

              {historyItems.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-4 text-zinc-500">
                  Nenhuma leitura recente ainda.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {historyItems.map((item) => {
                    const cover = proxifyImage(item.mangaCover);

                    return (
                      <Link
                        key={item.id}
                        href={`/manga/${item.mangaId}/chapter/${item.chapterId}`}
                        className="group rounded-2xl border border-zinc-800 bg-black/20 p-4 flex gap-3 hover:border-cyan-400 transition"
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt={item.mangaTitle}
                            className="h-24 w-20 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-24 w-20 rounded-xl bg-zinc-800 shrink-0 flex items-center justify-center text-xs text-zinc-500">
                            Sem capa
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold line-clamp-1 group-hover:text-cyan-300 transition">
                            {item.mangaTitle}
                          </div>
                          <div className="text-sm text-zinc-400 line-clamp-1 mt-1">
                            {item.chapterTitle || "Continuar leitura"}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-cyan-400">❤️ Favoritos</h2>
                <Link href="/favorites" className="text-sm text-pink-300 hover:text-pink-200">
                  Ver tudo
                </Link>
              </div>

              {favoriteItems.length === 0 ? (
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-4 text-zinc-500">
                  Nenhum favorito ainda.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {favoriteItems.map((item) => {
                    const cover = proxifyImage(item.cover);

                    return (
                      <Link
                        key={item.id}
                        href={`/manga/${item.id}`}
                        className="group rounded-2xl border border-zinc-800 bg-black/20 p-4 flex gap-3 hover:border-pink-400 transition"
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt={item.title}
                            className="h-24 w-20 rounded-xl object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-24 w-20 rounded-xl bg-zinc-800 shrink-0 flex items-center justify-center text-xs text-zinc-500">
                            Sem capa
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold line-clamp-1 group-hover:text-pink-300 transition">
                            {item.title}
                          </div>
                          <div className="text-sm text-zinc-400 line-clamp-1 mt-1">
                            {item.genre || "Sem gênero"}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}