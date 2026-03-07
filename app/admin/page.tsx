"use client";

import { useMemo, useState, type ReactNode } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

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
  const [tab, setTab] = useState<TabKey>("usar");

  // token admin (1 vez)
  const [adminToken, setAdminToken] = useState("");

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

    if (!t || !g || !c) return alert("Preencha Título, Gênero e LINK da capa.");
    if (!isValidHttpUrl(c)) return alert("Link da capa inválido. Precisa começar com http:// ou https://");

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
      alert(`✅ Mangá criado! ID: ${created.id}`);
      setTab("importar");
    } catch (e) {
      console.error(e);
      alert("❌ Erro ao criar mangá (ver console).");
    } finally {
      setLoading(false);
    }
  }

  function handleUseExistingId() {
    const id = cleanId(manualId);
    if (!id) return alert("Cole um MangaId válido.");
    setMangaId(id);
    alert(`✅ Usando MangaId existente: ${id}`);
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
      alert("✅ MangaId copiado!");
    } catch {
      alert("❌ Não consegui copiar. Copie manualmente.");
    }
  }

  async function handleEditManga() {
    if (!mangaIdToUse) return;

    if (!adminToken) return alert("Cole o ADMIN_SYNC_TOKEN no topo do Admin.");

    const res = await fetch("/api/admin/manga", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ mangaId: mangaIdToUse, title, genre, cover: coverUrl }),
    });

    const txt = await res.text();
    if (!res.ok) return alert("Erro ao editar: " + txt);

    alert("✅ Editado!");
  }

  async function handleDeleteManga() {
    if (!mangaIdToUse) return;

    const sure = confirm("Tem certeza? Isso apaga o mangá e TODOS os capítulos.");
    if (!sure) return;

    if (!adminToken) return alert("Cole o ADMIN_SYNC_TOKEN no topo do Admin.");

    const res = await fetch(`/api/admin/manga?mangaId=${encodeURIComponent(mangaIdToUse)}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });

    const txt = await res.text();
    if (!res.ok) return alert("Erro ao excluir: " + txt);

    alert("🗑️ Excluído!");
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
                {mangaIdToUse ? <b className="text-cyan-300">{mangaIdToUse}</b> : <span className="text-zinc-400">nenhum</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton active={tab === "usar"} onClick={() => setTab("usar")}>
                📚 Lista / Usar ID
              </TabButton>
              <TabButton active={tab === "criar"} onClick={() => setTab("criar")}>
                ➕ Criar
              </TabButton>
              <TabButton active={tab === "editar"} onClick={() => setTab("editar")}>
                ✏️ Editar/Excluir
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
                className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-red-400 hover:text-red-300 transition text-sm font-semibold"
              >
                Limpar
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <div className="text-sm text-zinc-300 mb-1">ADMIN_SYNC_TOKEN (uma vez)</div>
              <input
                value={adminToken}
                onChange={(e) => setAdminToken(e.target.value)}
                placeholder="Cole aqui o ADMIN_SYNC_TOKEN do .env"
                className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
              />
              <div className="text-[11px] text-zinc-500 mt-1">Usado para Editar/Excluir e Import por URL.</div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/40 p-3">
              <div className="text-sm text-zinc-300">Atalho</div>
              <div className="text-xs text-zinc-500 mt-1">
                1) Selecione um mangá na lista <br />
                2) Vá em Importar <br />
                3) Cole links ou use URL (auto)
              </div>
            </div>
          </div>
        </div>

        {tab === "usar" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
              <h2 className="text-xl font-bold text-cyan-400">🔑 Usar MangaId existente</h2>
              <p className="text-sm text-zinc-400">Cole um MangaId e clique em <b>Usar</b> ou selecione um mangá na lista abaixo.</p>

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  placeholder="Cole o MangaId (ex: AbC123xyz...)"
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

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
              <h2 className="text-xl font-bold text-cyan-400">📚 Seus mangás</h2>
              <MangaList
                onSelect={(m) => {
                  setMangaId(m.id);
                  setManualId(m.id);
                  alert("✅ Mangá selecionado!");
                  setTab("importar");
                }}
              />
            </div>
          </div>
        )}

        {tab === "criar" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <h2 className="text-xl font-bold text-cyan-400">➕ Criar Mangá</h2>

            <div className="grid md:grid-cols-3 gap-3">
              <input
                placeholder="Título do mangá"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
              />
              <input
                placeholder="Gênero"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
              />
              <input
                placeholder="Link da capa (https://...)"
                value={coverUrl}
                onChange={(e) => setCoverUrl(e.target.value)}
                className="p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
              />
            </div>

            <button
              onClick={handleCreateManga}
              disabled={loading}
              className="w-full md:w-auto bg-cyan-500 hover:bg-cyan-600 p-3 rounded font-bold text-black transition disabled:opacity-60"
            >
              {loading ? "Criando..." : "Criar Mangá"}
            </button>
          </div>
        )}

        {tab === "editar" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
            <h2 className="text-xl font-bold text-cyan-400">✏️ Editar / 🗑️ Excluir</h2>

            {!mangaIdToUse ? (
              <div className="text-zinc-300">
                Defina um MangaId primeiro (aba <b>Lista / Usar ID</b> ou <b>Criar</b>).
              </div>
            ) : (
              <>
                <p className="text-sm text-zinc-400">Campos opcionais. Preencha só o que quiser mudar.</p>

                <div className="grid md:grid-cols-3 gap-3">
                  <input
                    placeholder="Novo título (opcional)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                  <input
                    placeholder="Novo gênero (opcional)"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                  <input
                    placeholder="Nova capa (opcional)"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                  <button
                    onClick={handleEditManga}
                    className="px-4 py-3 rounded bg-cyan-500 hover:bg-cyan-600 font-bold text-black transition"
                  >
                    Salvar alterações
                  </button>

                  <button
                    onClick={handleDeleteManga}
                    className="px-4 py-3 rounded border border-red-500 text-red-200 hover:bg-red-500/10 font-bold transition"
                  >
                    Excluir mangá
                  </button>
                </div>

                <div className="text-xs text-zinc-400">
                  * Excluir apaga o documento do mangá e a subcoleção <b>chapters</b>.
                </div>
              </>
            )}
          </div>
        )}

        {tab === "importar" && (
          <div className="space-y-6">
            {!mangaIdToUse ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-300">
                Defina um MangaId primeiro (aba <b>Lista / Usar ID</b> ou <b>Criar</b>).
              </div>
            ) : (
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">📄 Importar 1 capítulo (colar links)</h2>
                  <ImportChapterLinks mangaId={mangaIdToUse} />
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">📚 Importar tudo (colar links)</h2>
                  <ImportMangaFull mangaId={mangaIdToUse} />
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">⚡ Importar automático (por URL)</h2>
                  <ImportAutoFromUrl mangaId={mangaIdToUse} adminToken={adminToken} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}