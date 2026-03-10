"use client";

import { useMemo, useState, type ReactNode } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/admin";

import MangaList from "./MangaList";
import ImportChapterLinks from "./chapters/ImportChapterLinks";
import ImportMangaFull from "./chapters/ImportMangaFull";
import ImportAutoFromUrl from "./chapters/ImportAutoFromUrl";

type TabKey = "usar" | "criar" | "editar" | "importar";

function cleanId(s: string) {
  return s.trim().replace(/\s+/g, "");
}

function isValidHttpUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl border transition text-sm font-semibold ${
        active
          ? "border-cyan-400 text-cyan-300 bg-cyan-500/10"
          : "border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
      }`}
    >
      {children}
    </button>
  );
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<TabKey>("usar");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [mangaId, setMangaId] = useState<string>("");
  const [manualId, setManualId] = useState("");

  const mangaIdToUse = useMemo(() => cleanId(mangaId), [mangaId]);

  if (authLoading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Carregando...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Faça login para continuar.
      </main>
    );
  }

  if (!isAdmin(user.uid)) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Acesso restrito
      </main>
    );
  }

  async function handleCreateManga() {
    const t = title.trim();
    const g = genre.trim();
    const c = coverUrl.trim();

    if (!t || !g || !c) {
      alert("Preencha Título, Gênero e LINK da capa.");
      return;
    }

    if (!isValidHttpUrl(c)) {
      alert("Link da capa inválido.");
      return;
    }

    setLoading(true);

    try {
      const created = await addDoc(collection(db, "mangas"), {
        title: t,
        genre: g,
        cover: c,
        views: 0,
        weekViews: 0,
        chaptersCount: 0,
        lastChapterNumber: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setMangaId(created.id);
      setManualId(created.id);
      alert(`Mangá criado! ID: ${created.id}`);
      setTab("importar");
    } catch (e) {
      console.error(e);
      alert("Erro ao criar mangá.");
    } finally {
      setLoading(false);
    }
  }

  function handleUseExistingId() {
    const id = cleanId(manualId);

    if (!id) {
      alert("Cole um MangaId válido.");
      return;
    }

    setMangaId(id);
    setManualId(id);
    alert(`Usando MangaId: ${id}`);
    setTab("importar");
  }

  function handleClearId() {
    setMangaId("");
    setManualId("");
    setTitle("");
    setGenre("");
    setCoverUrl("");
  }

  async function handleCopyId() {
    if (!mangaIdToUse) return;

    try {
      await navigator.clipboard.writeText(mangaIdToUse);
      alert("ID copiado");
    } catch {
      alert("Copie manualmente");
    }
  }

  async function handleEditManga() {
    if (!user) {
      alert("Login necessário.");
      return;
    }

    if (!mangaIdToUse) {
      alert("Selecione um mangá primeiro.");
      return;
    }

    const res = await fetch("/api/admin/manga", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user.uid,
      },
      body: JSON.stringify({
        mangaId: mangaIdToUse,
        title,
        genre,
        cover: coverUrl,
      }),
    });

    const txt = await res.text();

    if (!res.ok) {
      alert(txt);
      return;
    }

    alert("Editado!");
  }

  async function handleDeleteManga() {
    if (!user) {
      alert("Login necessário.");
      return;
    }

    if (!mangaIdToUse) {
      alert("Selecione um mangá primeiro.");
      return;
    }

    const sure = confirm("Apagar mangá e capítulos?");
    if (!sure) return;

    const res = await fetch(
      `/api/admin/manga?mangaId=${encodeURIComponent(mangaIdToUse)}`,
      {
        method: "DELETE",
        headers: {
          "x-user-id": user.uid,
        },
      }
    );

    const txt = await res.text();

    if (!res.ok) {
      alert(txt);
      return;
    }

    alert("Excluído!");
    handleClearId();
    setTab("usar");
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="text-xl font-bold text-cyan-400">⚙️ Painel Admin</div>
              <div className="text-sm text-zinc-400">
                MangaId em uso:{" "}
                {mangaIdToUse ? (
                  <b className="text-cyan-300">{mangaIdToUse}</b>
                ) : (
                  <span className="text-zinc-400">nenhum</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton active={tab === "usar"} onClick={() => setTab("usar")}>
                📚 Lista
              </TabButton>

              <TabButton active={tab === "criar"} onClick={() => setTab("criar")}>
                ➕ Criar
              </TabButton>

              <TabButton active={tab === "editar"} onClick={() => setTab("editar")}>
                ✏️ Editar
              </TabButton>

              <TabButton active={tab === "importar"} onClick={() => setTab("importar")}>
                📥 Importar
              </TabButton>

              {mangaIdToUse && (
                <button
                  onClick={handleCopyId}
                  className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition text-sm font-semibold"
                >
                  📋 Copiar ID
                </button>
              )}

              <button
                onClick={handleClearId}
                className="px-4 py-2 rounded-xl border border-red-600 text-red-200 hover:bg-red-500/10 transition text-sm font-semibold"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>

        {tab === "usar" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
              <h2 className="text-xl font-bold text-cyan-400">🔑 Usar MangaId existente</h2>

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  placeholder="Cole o MangaId"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUseExistingId()}
                  className="flex-1 p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                />

                <button
                  onClick={handleUseExistingId}
                  className="px-4 py-3 rounded bg-cyan-500 hover:bg-cyan-600 font-bold text-black transition"
                >
                  Usar este MangaId
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <MangaList
                onSelect={(m) => {
                  setMangaId(m.id);
                  setManualId(m.id);
                  alert("Mangá selecionado!");
                  setTab("importar");
                }}
              />
            </div>
          </div>
        )}

        {tab === "criar" && (
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <input
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Gênero"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Capa"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="w-full p-3 bg-zinc-800 rounded"
            />

            <button
              onClick={handleCreateManga}
              disabled={loading}
              className="bg-cyan-500 p-3 rounded font-bold text-black disabled:opacity-50"
            >
              {loading ? "Criando..." : "Criar"}
            </button>
          </div>
        )}

        {tab === "editar" && (
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
            <input
              placeholder="Novo título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Novo gênero"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Nova capa"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              className="w-full p-3 bg-zinc-800 rounded"
            />

            <button
              onClick={handleEditManga}
              className="bg-cyan-500 p-3 rounded font-bold text-black"
            >
              Salvar
            </button>

            <button
              onClick={handleDeleteManga}
              className="border border-red-500 p-3 rounded"
            >
              Excluir
            </button>
          </div>
        )}

        {tab === "importar" && (
          <>
            {!mangaIdToUse ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-300">
                Selecione ou cole um MangaId primeiro.
              </div>
            ) : (
              <div className="grid lg:grid-cols-3 gap-6">
                <ImportChapterLinks mangaId={mangaIdToUse} />
                <ImportMangaFull mangaId={mangaIdToUse} />
                <ImportAutoFromUrl mangaId={mangaIdToUse} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}