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

  const { user } = useAuth();

  if (!isAdmin(user?.uid)) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        Acesso restrito
      </main>
    );
  }

  const [tab, setTab] = useState<TabKey>("usar");

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [mangaId, setMangaId] = useState<string>("");
  const [manualId, setManualId] = useState("");

  const mangaIdToUse = useMemo(() => cleanId(mangaId), [mangaId]);

  async function handleCreateManga() {

    const t = title.trim();
    const g = genre.trim();
    const c = coverUrl.trim();

    if (!db) {
      alert("Firebase não inicializado.");
      return;
    }

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

    if (!id) return alert("Cole um MangaId válido.");

    setMangaId(id);

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

    if (!mangaIdToUse) return;

    const res = await fetch("/api/admin/manga", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": user?.uid || ""
      },
      body: JSON.stringify({
        mangaId: mangaIdToUse,
        title,
        genre,
        cover: coverUrl
      }),
    });

    const txt = await res.text();

    if (!res.ok) return alert(txt);

    alert("Editado!");
  }

  async function handleDeleteManga() {

    if (!mangaIdToUse) return;

    const sure = confirm("Apagar mangá e capítulos?");

    if (!sure) return;

    const res = await fetch(`/api/admin/manga?mangaId=${encodeURIComponent(mangaIdToUse)}`, {
      method: "DELETE",
      headers: {
        "x-user-id": user?.uid || ""
      },
    });

    const txt = await res.text();

    if (!res.ok) return alert(txt);

    alert("Excluído!");

    handleClearId();

    setTab("usar");
  }

  return (
    <main className="min-h-screen bg-black text-white p-6">

      <div className="mx-auto max-w-6xl space-y-6">

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">

          <div className="flex flex-wrap gap-2">

            <TabButton active={tab==="usar"} onClick={()=>setTab("usar")}>
              Lista
            </TabButton>

            <TabButton active={tab==="criar"} onClick={()=>setTab("criar")}>
              Criar
            </TabButton>

            <TabButton active={tab==="editar"} onClick={()=>setTab("editar")}>
              Editar
            </TabButton>

            <TabButton active={tab==="importar"} onClick={()=>setTab("importar")}>
              Importar
            </TabButton>

            {mangaIdToUse && (
              <button
                onClick={handleCopyId}
                className="px-4 py-2 rounded-xl border border-zinc-700"
              >
                Copiar ID
              </button>
            )}

            <button
              onClick={handleClearId}
              className="px-4 py-2 rounded-xl border border-red-600"
            >
              Limpar
            </button>

          </div>

        </div>

        {tab==="usar" && (
          <MangaList
            onSelect={(m)=>{
              setMangaId(m.id);
              setManualId(m.id);
              setTab("importar");
            }}
          />
        )}

        {tab==="criar" && (
          <div className="space-y-3">

            <input
              placeholder="Título"
              value={title}
              onChange={(e)=>setTitle(e.target.value)}
              className="p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Gênero"
              value={genre}
              onChange={(e)=>setGenre(e.target.value)}
              className="p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Capa"
              value={coverUrl}
              onChange={(e)=>setCoverUrl(e.target.value)}
              className="p-3 bg-zinc-800 rounded"
            />

            <button
              onClick={handleCreateManga}
              className="bg-cyan-500 p-3 rounded font-bold text-black"
            >
              Criar
            </button>

          </div>
        )}

        {tab==="editar" && (
          <div className="space-y-3">

            <input
              placeholder="Novo título"
              value={title}
              onChange={(e)=>setTitle(e.target.value)}
              className="p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Novo gênero"
              value={genre}
              onChange={(e)=>setGenre(e.target.value)}
              className="p-3 bg-zinc-800 rounded"
            />

            <input
              placeholder="Nova capa"
              value={coverUrl}
              onChange={(e)=>setCoverUrl(e.target.value)}
              className="p-3 bg-zinc-800 rounded"
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

        {tab==="importar" && mangaIdToUse && (

          <div className="grid lg:grid-cols-3 gap-6">

            <ImportChapterLinks mangaId={mangaIdToUse} />

            <ImportMangaFull mangaId={mangaIdToUse} />

            <ImportAutoFromUrl mangaId={mangaIdToUse} />

          </div>

        )}

      </div>

    </main>
  );
}