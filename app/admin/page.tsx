"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/admin";

import MangaList from "./MangaList";
import ImportChapterLinks from "./chapters/ImportChapterLinks";
import ImportMangaFull from "./chapters/ImportMangaFull";
import ImportAutoFromUrl from "./chapters/ImportAutoFromUrl";

type TabKey = "dashboard" | "usar" | "criar" | "editar" | "importar";

type MangaStats = {
  totalMangas: number;
  totalViews: number;
  totalWeekViews: number;
  totalChapters: number;
  latestTitles: string[];
  topTitles: string[];
};

type MangaDoc = {
  id: string;
  title?: string;
  genre?: string;
  cover?: string;
  views?: number;
  weekViews?: number;
  chaptersCount?: number;
  updatedAt?: any;
};

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

function tsSeconds(v: any) {
  return v?.seconds ?? 0;
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<TabKey>("dashboard");

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const [mangaId, setMangaId] = useState<string>("");
  const [manualId, setManualId] = useState("");

  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<MangaStats>({
    totalMangas: 0,
    totalViews: 0,
    totalWeekViews: 0,
    totalChapters: 0,
    latestTitles: [],
    topTitles: [],
  });

  const [previewCover, setPreviewCover] = useState("");

  const mangaIdToUse = useMemo(() => cleanId(mangaId), [mangaId]);

  useEffect(() => {
    setPreviewCover(coverUrl.trim());
  }, [coverUrl]);

  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true);

      try {
        const snap = await getDocs(
          query(collection(db, "mangas"), orderBy("createdAt", "desc"))
        );

        const items = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MangaDoc, "id">),
        })) as MangaDoc[];

        const totalMangas = items.length;
        const totalViews = items.reduce(
          (sum, item) => sum + Number(item.views || 0),
          0
        );
        const totalWeekViews = items.reduce(
          (sum, item) => sum + Number(item.weekViews || 0),
          0
        );
        const totalChapters = items.reduce(
          (sum, item) => sum + Number(item.chaptersCount || 0),
          0
        );

        const latestTitles = [...items]
          .sort((a, b) => tsSeconds(b.updatedAt) - tsSeconds(a.updatedAt))
          .slice(0, 5)
          .map((item) => item.title || "Sem título");

        const topTitles = [...items]
          .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
          .slice(0, 5)
          .map((item) => item.title || "Sem título");

        setStats({
          totalMangas,
          totalViews,
          totalWeekViews,
          totalChapters,
          latestTitles,
          topTitles,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setStatsLoading(false);
      }
    }

    if (!authLoading && user && isAdmin(user.uid)) {
      loadStats();
    }
  }, [authLoading, user]);

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

  const adminUid = user.uid;
  const adminLabel = user.email || adminUid;

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
        dayViews: 0,
        weekViews: 0,
        monthViews: 0,
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
    setPreviewCover("");
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
    if (!mangaIdToUse) {
      alert("Selecione um mangá primeiro.");
      return;
    }

    const res = await fetch("/api/admin/manga", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": adminUid,
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
          "x-user-id": adminUid,
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
    setTab("dashboard");
  }

  return (
    <main className="min-h-screen bg-black text-white p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-black p-5 md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm text-zinc-400">Painel avançado</div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-cyan-400">
                LK-Scan Admin Pro
              </h1>
              <div className="mt-2 text-sm text-zinc-400">
                Manga em uso:{" "}
                {mangaIdToUse ? (
                  <span className="text-cyan-300 font-semibold">
                    {mangaIdToUse}
                  </span>
                ) : (
                  <span>nenhum selecionado</span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setTab("dashboard")}
                className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition"
              >
                Dashboard
              </button>

              {mangaIdToUse && (
                <button
                  onClick={handleCopyId}
                  className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition"
                >
                  Copiar ID
                </button>
              )}

              <button
                onClick={handleClearId}
                className="px-4 py-2 rounded-xl border border-red-700 text-red-200 hover:bg-red-500/10 transition"
              >
                Limpar seleção
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex flex-wrap gap-2">
            <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
              📊 Dashboard
            </TabButton>
            <TabButton active={tab === "usar"} onClick={() => setTab("usar")}>
              📚 Selecionar mangá
            </TabButton>
            <TabButton active={tab === "criar"} onClick={() => setTab("criar")}>
              ➕ Criar mangá
            </TabButton>
            <TabButton active={tab === "editar"} onClick={() => setTab("editar")}>
              ✏️ Editar / Excluir
            </TabButton>
            <TabButton active={tab === "importar"} onClick={() => setTab("importar")}>
              📥 Importar capítulos
            </TabButton>
          </div>
        </section>

        {tab === "dashboard" && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <div className="text-sm text-zinc-400">Mangás cadastrados</div>
                <div className="mt-2 text-3xl font-extrabold text-cyan-400">
                  {statsLoading ? "..." : stats.totalMangas}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <div className="text-sm text-zinc-400">Capítulos totais</div>
                <div className="mt-2 text-3xl font-extrabold text-cyan-400">
                  {statsLoading ? "..." : stats.totalChapters}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <div className="text-sm text-zinc-400">Views totais</div>
                <div className="mt-2 text-3xl font-extrabold text-cyan-400">
                  {statsLoading ? "..." : stats.totalViews.toLocaleString()}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <div className="text-sm text-zinc-400">Views da semana</div>
                <div className="mt-2 text-3xl font-extrabold text-cyan-400">
                  {statsLoading ? "..." : stats.totalWeekViews.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="text-lg font-bold text-cyan-400 mb-4">⚡ Ações rápidas</h2>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={() => setTab("criar")}
                    className="rounded-xl bg-cyan-500 p-4 text-left font-bold text-black hover:bg-cyan-400 transition"
                  >
                    Criar novo mangá
                  </button>

                  <button
                    onClick={() => setTab("usar")}
                    className="rounded-xl border border-zinc-700 p-4 text-left hover:border-cyan-400 transition"
                  >
                    Escolher mangá
                  </button>

                  <button
                    onClick={() => setTab("editar")}
                    className="rounded-xl border border-zinc-700 p-4 text-left hover:border-cyan-400 transition"
                  >
                    Editar informações
                  </button>

                  <button
                    onClick={() => setTab("importar")}
                    className="rounded-xl border border-zinc-700 p-4 text-left hover:border-cyan-400 transition"
                  >
                    Importar capítulos
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="text-lg font-bold text-cyan-400 mb-4">🧠 Estado atual</h2>

                <div className="space-y-3 text-sm">
                  <div className="rounded-xl bg-black/30 p-3 border border-zinc-800">
                    <span className="text-zinc-400">Mangá selecionado: </span>
                    <span className="text-zinc-200 font-semibold">
                      {mangaIdToUse || "nenhum"}
                    </span>
                  </div>

                  <div className="rounded-xl bg-black/30 p-3 border border-zinc-800">
                    <span className="text-zinc-400">Aba atual: </span>
                    <span className="text-zinc-200 font-semibold">{tab}</span>
                  </div>

                  <div className="rounded-xl bg-black/30 p-3 border border-zinc-800">
                    <span className="text-zinc-400">Admin logado: </span>
                    <span className="text-zinc-200 font-semibold">
                      {adminLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="text-lg font-bold text-cyan-400 mb-4">
                  🆕 Últimos atualizados
                </h2>

                <div className="space-y-2">
                  {stats.latestTitles.length === 0 ? (
                    <div className="text-sm text-zinc-500">Sem dados.</div>
                  ) : (
                    stats.latestTitles.map((item, idx) => (
                      <div
                        key={`${item}-${idx}`}
                        className="rounded-xl border border-zinc-800 bg-black/20 p-3"
                      >
                        {idx + 1}. {item}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <h2 className="text-lg font-bold text-cyan-400 mb-4">
                  🔥 Mais vistos
                </h2>

                <div className="space-y-2">
                  {stats.topTitles.length === 0 ? (
                    <div className="text-sm text-zinc-500">Sem dados.</div>
                  ) : (
                    stats.topTitles.map((item, idx) => (
                      <div
                        key={`${item}-${idx}`}
                        className="rounded-xl border border-zinc-800 bg-black/20 p-3"
                      >
                        {idx + 1}. {item}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "usar" && (
          <section className="space-y-6">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
              <h2 className="text-xl font-bold text-cyan-400">🔎 Selecionar mangá</h2>

              <div className="flex flex-col md:flex-row gap-3">
                <input
                  placeholder="Cole o MangaId"
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUseExistingId()}
                  className="flex-1 p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                />

                <button
                  onClick={handleUseExistingId}
                  className="px-5 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold transition"
                >
                  Usar MangaId
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <MangaList
                onSelect={(m) => {
                  setMangaId(m.id);
                  setManualId(m.id);
                  setTab("importar");
                }}
              />
            </div>
          </section>
        )}

        {tab === "criar" && (
          <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
              <h2 className="text-xl font-bold text-cyan-400">➕ Criar mangá</h2>

              <div className="grid gap-4">
                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Título</div>
                  <input
                    placeholder="Ex: Solo Leveling"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Gênero</div>
                  <input
                    placeholder="Ex: Ação, Fantasia"
                    value={genre}
                    onChange={(e) => setGenre(e.target.value)}
                    className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Capa (URL)</div>
                  <input
                    placeholder="https://..."
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                    className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                </label>

                <button
                  onClick={handleCreateManga}
                  disabled={loading}
                  className="w-full md:w-fit px-6 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
                >
                  {loading ? "Criando..." : "Criar mangá"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="text-lg font-bold text-cyan-400 mb-4">👁 Prévia</h2>

              <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-black/30">
                {previewCover ? (
                  <img
                    src={previewCover}
                    alt={title || "Prévia"}
                    className="w-full h-80 object-cover"
                  />
                ) : (
                  <div className="w-full h-80 flex items-center justify-center text-zinc-500">
                    Sem capa
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <div className="font-bold text-lg">{title || "Título do mangá"}</div>
                  <div className="text-sm text-zinc-400">{genre || "Gênero"}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "editar" && (
          <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
              <h2 className="text-xl font-bold text-cyan-400">✏️ Editar mangá</h2>

              {!mangaIdToUse ? (
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-4 text-zinc-400">
                  Selecione um mangá primeiro na aba <b>Selecionar mangá</b>.
                </div>
              ) : (
                <>
                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Novo título</div>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Novo gênero</div>
                    <input
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Nova capa</div>
                    <input
                      value={coverUrl}
                      onChange={(e) => setCoverUrl(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      onClick={handleEditManga}
                      className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition"
                    >
                      Salvar alterações
                    </button>

                    <button
                      onClick={handleDeleteManga}
                      className="px-5 py-3 rounded-xl border border-red-700 text-red-200 hover:bg-red-500/10 transition"
                    >
                      Excluir mangá
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h2 className="text-lg font-bold text-cyan-400 mb-4">📌 Seleção atual</h2>

              <div className="space-y-3 text-sm">
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                  <span className="text-zinc-400">MangaId:</span>
                  <div className="break-all text-zinc-200 mt-1">
                    {mangaIdToUse || "nenhum"}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                  <span className="text-zinc-400">Prévia capa:</span>
                  {previewCover ? (
                    <img
                      src={previewCover}
                      alt="Prévia"
                      className="mt-3 rounded-xl w-full h-56 object-cover"
                    />
                  ) : (
                    <div className="mt-3 rounded-xl w-full h-56 bg-zinc-800 flex items-center justify-center text-zinc-500">
                      Sem imagem
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "importar" && (
          <>
            {!mangaIdToUse ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-zinc-300">
                Selecione um mangá primeiro.
              </div>
            ) : (
              <section className="grid gap-6 xl:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">
                    📄 Importar 1 capítulo
                  </h2>
                  <ImportChapterLinks mangaId={mangaIdToUse} />
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">
                    📚 Importar tudo
                  </h2>
                  <ImportMangaFull mangaId={mangaIdToUse} />
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                  <h2 className="text-xl font-bold mb-4 text-cyan-400">
                    ⚡ Importação automática
                  </h2>
                  <ImportAutoFromUrl mangaId={mangaIdToUse} />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}