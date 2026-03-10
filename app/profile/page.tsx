"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
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
};

export default function ProfilePage() {
  const { user, loading } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user?.uid) {
        setPageLoading(false);
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const data = snap.data() as UserProfile | undefined;

        if (data) {
          setProfile(data);
          setDisplayName(data.displayName || "");
          setBio(data.bio || "");
          setPhotoURL(data.photoURL || "");
        }
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
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setProfile((prev) => ({
        ...(prev || {}),
        displayName: displayName.trim(),
        bio: bio.trim(),
        photoURL: photoURL.trim(),
      }));

      alert("Perfil atualizado.");
    } catch (e) {
      console.error(e);
      alert("Erro ao salvar perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    if (!user?.uid) return;

    setUploading(true);

    try {
      const avatarRef = ref(storage, `users/${user.uid}/avatar`);
      await uploadBytes(avatarRef, file);
      const url = await getDownloadURL(avatarRef);
      setPhotoURL(url);
    } catch (e) {
      console.error(e);
      alert("Erro ao enviar imagem.");
    } finally {
      setUploading(false);
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
    <main className="min-h-screen bg-gradient-to-b from-black via-zinc-900 to-black text-white p-6">
      <div className="max-w-4xl mx-auto grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <div className="flex flex-col items-center text-center gap-3">
            {photoURL ? (
              <img
                src={photoURL}
                alt="Avatar"
                className="h-28 w-28 rounded-full object-cover border border-cyan-500/40"
              />
            ) : (
              <div className="h-28 w-28 rounded-full bg-zinc-800 flex items-center justify-center text-3xl font-bold">
                {(profile?.displayName || user.email || "U").slice(0, 1).toUpperCase()}
              </div>
            )}

            <div>
              <div className="text-xl font-bold">{profile?.displayName || "Usuário"}</div>
              <div className="text-sm text-zinc-400">@{profile?.username || "usuario"}</div>
            </div>

            <div className="text-xs px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              Nível {levelData.level}
            </div>

            <div className="text-xs text-zinc-400">
              {profile?.title || "Leitor Iniciante"}
              {profile?.isVip && profile?.vipTier ? ` • ${getVipBadge(profile.vipTier)}` : ""}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm text-zinc-300">
              XP: {profile?.xpTotal || 0}
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

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-black/30 p-3">
              <div className="text-lg font-bold">{profile?.chaptersRead || 0}</div>
              <div className="text-[11px] text-zinc-500">Capítulos</div>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <div className="text-lg font-bold">{profile?.favoritesCount || 0}</div>
              <div className="text-[11px] text-zinc-500">Favoritos</div>
            </div>
            <div className="rounded-xl bg-black/30 p-3">
              <div className="text-lg font-bold">{profile?.commentsCount || 0}</div>
              <div className="text-[11px] text-zinc-500">Comentários</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <h1 className="text-2xl font-bold text-cyan-400">Meu perfil</h1>

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
              <div className="text-sm text-zinc-300">URL da foto</div>
              <input
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
              />
            </label>

            <label className="space-y-1">
              <div className="text-sm text-zinc-300">Enviar foto</div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                }}
                className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none"
              />
            </label>

            <button
              onClick={handleSave}
              disabled={saving || uploading}
              className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50"
            >
              {uploading ? "Enviando imagem..." : saving ? "Salvando..." : "Salvar perfil"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}