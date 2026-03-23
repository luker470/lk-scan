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
import CleanupTitlesManager from "./CleanupTitlesManager";
import DiscoveryAutoImportManager from "./DiscoveryAutoImportManager";
import SyncStatusBoard from "./SyncStatusBoard";
import AutomationManagerPanel from "./SystemAutomationManager";
import SourceHealthBoard from "./SourceHealthBoard";
import BackupManager from "./BackupManager";
import ParserDiagnosticsBoard from "./ParserDiagnosticsBoard";
import ProductionBoard from "./ProductionBoard";

import MangaList from "./MangaList";
import ImportChapterLinks from "./chapters/ImportChapterLinks";
import ImportMangaFull from "./chapters/ImportMangaFull";
import ImportAutoFromUrl from "./chapters/ImportAutoFromUrl";
import DiscoveryManager from "./discovery/DiscoveryManager";
import AdminPingTest from "./AdminPingTest";
import MirrorManager from "./MirrorManager";
import AutoSyncManager from "./AutoSyncManager";

type TabKey =
  | "dashboard"
  | "usar"
  | "criar"
  | "editar"
  | "importar"
  | "descobrir";

type MangaStats = {
  totalMangas: number;
  totalViews: number;
  totalWeekViews: number;
  totalChapters: number;
  latestTitles: string[];
  topTitles: string[];
  autoSyncCount: number;
};

type MangaDoc = {
  id: string;
  title?: string;
  genre?: string;
  cover?: string;
  banner?: string;
  description?: string;
  status?: string;
  author?: string;
  artist?: string;
  sourceUrl?: string;
  autoSync?: boolean;
  views?: number;
  weekViews?: number;
  chaptersCount?: number;
  updatedAt?: any;
  createdAt?: any;
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

function tsSeconds(v: any) {
  return v?.seconds ?? 0;
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
      className={`px-4 py-2 rounded-xl border transition text-sm font-semibold whitespace-nowrap ${
        active
          ? "border-cyan-400 text-cyan-300 bg-cyan-500/10"
          : "border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-extrabold text-cyan-400">
        {loading ? "..." : value}
      </div>
    </div>
  );
}

const INITIAL_STATS: MangaStats = {
  totalMangas: 0,
  totalViews: 0,
  totalWeekViews: 0,
  totalChapters: 0,
  latestTitles: [],
  topTitles: [],
  autoSyncCount: 0,
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<TabKey>("dashboard");

  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("");
  const [author, setAuthor] = useState("");
  const [artist, setArtist] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [autoSync, setAutoSync] = useState(false);

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<"" | "edit" | "delete">("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "info">("info");

  const [mangaId, setMangaId] = useState<string>("");
  const [manualId, setManualId] = useState("");

  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState<MangaStats>(INITIAL_STATS);

  const [previewCover, setPreviewCover] = useState("");
  const [previewBanner, setPreviewBanner] = useState("");

  const mangaIdToUse = useMemo(() => cleanId(mangaId), [mangaId]);
  const hasSelectedManga = Boolean(mangaIdToUse);

  function showStatus(message: string, type: "success" | "error" | "info" = "info") {
    setStatusMessage(message);
    setStatusType(type);
  }

  function clearStatus() {
    setStatusMessage("");
    setStatusType("info");
  }

  function clearForm() {
    setTitle("");
    setGenre("");
    setCoverUrl("");
    setBannerUrl("");
    setDescription("");
    setStatus("");
    setAuthor("");
    setArtist("");
    setSourceUrl("");
    setAutoSync(false);
  }

  function fillFormFromManga(m: MangaDoc) {
    setMangaId(m.id);
    setManualId(m.id);
    setTitle(m.title || "");
    setGenre(m.genre || "");
    setCoverUrl(m.cover || "");
    setBannerUrl(m.banner || "");
    setDescription(m.description || "");
    setStatus(m.status || "");
    setAuthor(m.author || "");
    setArtist(m.artist || "");
    setSourceUrl(m.sourceUrl || "");
    setAutoSync(Boolean(m.autoSync));
  }

  async function loadStats() {
    if (!db) {
      setStats(INITIAL_STATS);
      setStatsLoading(false);
      return;
    }

    setStatsLoading(true);

    try {
      const snap = await getDocs(
        query(collection(db, "mangas"), orderBy("createdAt", "desc"))
      );

      const items = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MangaDoc, "id">),
      })) as MangaDoc[];

      let totalViews = 0;
      let totalWeekViews = 0;
      let totalChapters = 0;
      let autoSyncCount = 0;

      for (const item of items) {
        totalViews += Number(item.views || 0);
        totalWeekViews += Number(item.weekViews || 0);
        totalChapters += Number(item.chaptersCount || 0);
        if (item.autoSync) autoSyncCount++;
      }

      const latestTitles = items
        .slice()
        .sort((a, b) => tsSeconds(b.updatedAt) - tsSeconds(a.updatedAt))
        .slice(0, 5)
        .map((item) => item.title || "Sem título");

      const topTitles = items
        .slice()
        .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
        .slice(0, 5)
        .map((item) => item.title || "Sem título");

      setStats({
        totalMangas: items.length,
        totalViews,
        totalWeekViews,
        totalChapters,
        latestTitles,
        topTitles,
        autoSyncCount,
      });
    } catch (error) {
      console.error("Erro ao carregar stats:", error);
      showStatus("Erro ao carregar estatísticas do painel.", "error");
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    setPreviewCover(coverUrl.trim());
  }, [coverUrl]);

  useEffect(() => {
    setPreviewBanner(bannerUrl.trim());
  }, [bannerUrl]);

  useEffect(() => {
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
    clearStatus();

    const t = title.trim();
    const g = genre.trim();
    const c = coverUrl.trim();
    const b = bannerUrl.trim();
    const d = description.trim();
    const s = status.trim();
    const a = author.trim();
    const ar = artist.trim();
    const src = sourceUrl.trim();

    if (!t) {
      showStatus("Preencha o título.", "error");
      return;
    }

    if (c && !isValidHttpUrl(c)) {
      showStatus("Link da capa inválido.", "error");
      return;
    }

    if (b && !isValidHttpUrl(b)) {
      showStatus("Link do banner inválido.", "error");
      return;
    }

    if (src && !isValidHttpUrl(src)) {
      showStatus("Source URL inválida.", "error");
      return;
    }

    const firestore = db;

    if (!firestore) {
      showStatus("Firebase não inicializado.", "error");
      return;
    }

    setLoading(true);

    try {
      const created = await addDoc(collection(firestore, "mangas"), {
        title: t,
        genre: g,
        cover: c,
        banner: b || c,
        description: d,
        status: s,
        author: a,
        artist: ar,
        sourceUrl: src,
        sourceHost: src ? new URL(src).hostname : "",
        autoSync: autoSync && !!src,
        syncStatus: autoSync && !!src ? "active" : "",
        lastSyncError: "",
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
      clearForm();
      await loadStats();
      showStatus(`Mangá criado com sucesso. ID: ${created.id}`, "success");
      setTab("importar");
    } catch (error) {
      console.error(error);
      showStatus("Erro ao criar mangá.", "error");
    } finally {
      setLoading(false);
    }
  }

  function handleUseExistingId() {
    clearStatus();

    const id = cleanId(manualId);

    if (!id) {
      showStatus("Cole um MangaId válido.", "error");
      return;
    }

    setMangaId(id);
    setManualId(id);
    showStatus(`Usando MangaId: ${id}`, "success");
    setTab("importar");
  }

  function handleClearId() {
    setMangaId("");
    setManualId("");
    clearForm();
    setPreviewCover("");
    setPreviewBanner("");
    clearStatus();
  }

  async function handleCopyId() {
    if (!mangaIdToUse) return;

    try {
      await navigator.clipboard.writeText(mangaIdToUse);
      showStatus("ID copiado com sucesso.", "success");
    } catch {
      showStatus("Não foi possível copiar. Copie manualmente.", "error");
    }
  }

  async function handleEditManga() {
    if (!mangaIdToUse) {
      showStatus("Selecione um mangá primeiro.", "error");
      return;
    }

    clearStatus();
    setActionLoading("edit");

    try {
      const payload = {
        mangaId: mangaIdToUse,
        title: title.trim(),
        genre: genre.trim(),
        cover: coverUrl.trim(),
        banner: bannerUrl.trim(),
        description: description.trim(),
        status: status.trim(),
        author: author.trim(),
        artist: artist.trim(),
        sourceUrl: sourceUrl.trim(),
        autoSync,
      };

      const res = await fetch("/api/admin/manga", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": adminUid,
        },
        body: JSON.stringify(payload),
      });

      const txt = await res.text();

      if (!res.ok) {
        showStatus(txt || "Erro ao editar mangá.", "error");
        return;
      }

      await loadStats();
      showStatus("Mangá editado com sucesso.", "success");
    } catch (error) {
      console.error(error);
      showStatus("Erro ao editar mangá.", "error");
    } finally {
      setActionLoading("");
    }
  }

  async function handleDeleteManga() {
    if (!mangaIdToUse) {
      showStatus("Selecione um mangá primeiro.", "error");
      return;
    }

    const sure = confirm("Apagar mangá e capítulos?");
    if (!sure) return;

    clearStatus();
    setActionLoading("delete");

    try {
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
        showStatus(txt || "Erro ao excluir mangá.", "error");
        return;
      }

      handleClearId();
      await loadStats();
      setTab("dashboard");
      showStatus("Mangá excluído com sucesso.", "success");
    } catch (error) {
      console.error(error);
      showStatus("Erro ao excluir mangá.", "error");
    } finally {
      setActionLoading("");
    }
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
                {hasSelectedManga ? (
                  <span className="text-cyan-300 font-semibold">{mangaIdToUse}</span>
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

              {hasSelectedManga ? (
                <button
                  onClick={handleCopyId}
                  className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition"
                >
                  Copiar ID
                </button>
              ) : null}

              <button
                onClick={handleClearId}
                className="px-4 py-2 rounded-xl border border-red-700 text-red-200 hover:bg-red-500/10 transition"
              >
                Limpar seleção
              </button>

              <button
                onClick={loadStats}
                className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Atualizar dados
              </button>
            </div>
          </div>
        </section>

        {statusMessage ? (
          <section
            className={`rounded-2xl border p-4 text-sm font-medium ${
              statusType === "success"
                ? "border-emerald-700 bg-emerald-500/10 text-emerald-300"
                : statusType === "error"
                ? "border-red-700 bg-red-500/10 text-red-300"
                : "border-cyan-700 bg-cyan-500/10 text-cyan-300"
            }`}
          >
            {statusMessage}
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
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
            <TabButton active={tab === "descobrir"} onClick={() => setTab("descobrir")}>
              🔎 Descobrir
            </TabButton>
          </div>
        </section>

        {tab === "dashboard" && (
          <section className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label="Mangás cadastrados"
                value={stats.totalMangas}
                loading={statsLoading}
              />
              <StatCard
                label="Capítulos totais"
                value={stats.totalChapters}
                loading={statsLoading}
              />
              <StatCard
                label="Views totais"
                value={stats.totalViews.toLocaleString()}
                loading={statsLoading}
              />
              <StatCard
                label="Views da semana"
                value={stats.totalWeekViews.toLocaleString()}
                loading={statsLoading}
              />
              <StatCard
                label="Auto sync ativos"
                value={stats.autoSyncCount}
                loading={statsLoading}
              />
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

                  <button
                    onClick={() => setTab("descobrir")}
                    className="rounded-xl border border-zinc-700 p-4 text-left hover:border-cyan-400 transition sm:col-span-2"
                  >
                    Descoberta automática
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
                    <span className="text-zinc-200 font-semibold break-all">
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
                <h2 className="text-lg font-bold text-cyan-400 mb-4">🔥 Mais vistos</h2>

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

            <ProductionBoard />
            <AdminPingTest />
            <AutoSyncManager />
            <CleanupTitlesManager />
            <DiscoveryAutoImportManager />
            <SyncStatusBoard />
            <AutomationManagerPanel />
            <SourceHealthBoard />
            <BackupManager />
            <MirrorManager />
            <ParserDiagnosticsBoard />
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
                  fillFormFromManga(m);
                  setTab("editar");
                  showStatus(`Mangá selecionado: ${m.title || m.id}`, "success");
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

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Banner (URL)</div>
                  <input
                    placeholder="https://..."
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-sm text-zinc-300">Descrição</div>
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                  />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1">
                    <div className="text-sm text-zinc-300">Status</div>
                    <input
                      placeholder="ongoing / completed"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-sm text-zinc-300">Autor</div>
                    <input
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-sm text-zinc-300">Artista</div>
                    <input
                      value={artist}
                      onChange={(e) => setArtist(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1">
                    <div className="text-sm text-zinc-300">Source URL</div>
                    <input
                      placeholder="https://site.com/manga/obra/"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                  />
                  Ativar sincronização automática
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
                {previewBanner || previewCover ? (
                  <img
                    src={previewBanner || previewCover}
                    alt={title || "Prévia"}
                    className="w-full h-40 object-cover"
                  />
                ) : (
                  <div className="w-full h-40 flex items-center justify-center text-zinc-500">
                    Sem banner
                  </div>
                )}

                <div className="p-4 space-y-2">
                  {previewCover ? (
                    <img
                      src={previewCover}
                      alt={title || "Capa"}
                      className="w-28 h-40 object-cover rounded-xl border border-zinc-700"
                    />
                  ) : null}

                  <div className="font-bold text-lg">{title || "Título do mangá"}</div>
                  <div className="text-sm text-zinc-400">{genre || "Gênero"}</div>
                  <div className="text-xs text-zinc-500">{status || "Status"}</div>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "editar" && (
          <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
              <h2 className="text-xl font-bold text-cyan-400">✏️ Editar mangá</h2>

              {!hasSelectedManga ? (
                <div className="rounded-xl border border-zinc-800 bg-black/30 p-4 text-zinc-400">
                  Selecione um mangá primeiro na aba <b>Selecionar mangá</b>.
                </div>
              ) : (
                <>
                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Título</div>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Gênero</div>
                    <input
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Capa</div>
                    <input
                      value={coverUrl}
                      onChange={(e) => setCoverUrl(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Banner</div>
                    <input
                      value={bannerUrl}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-sm text-zinc-300">Descrição</div>
                    <textarea
                      rows={5}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                    />
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-1 block">
                      <div className="text-sm text-zinc-300">Status</div>
                      <input
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                      />
                    </label>

                    <label className="space-y-1 block">
                      <div className="text-sm text-zinc-300">Autor</div>
                      <input
                        value={author}
                        onChange={(e) => setAuthor(e.target.value)}
                        className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                      />
                    </label>

                    <label className="space-y-1 block">
                      <div className="text-sm text-zinc-300">Artista</div>
                      <input
                        value={artist}
                        onChange={(e) => setArtist(e.target.value)}
                        className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                      />
                    </label>

                    <label className="space-y-1 block">
                      <div className="text-sm text-zinc-300">Source URL</div>
                      <input
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        className="w-full p-3 rounded-xl bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={autoSync}
                      onChange={(e) => setAutoSync(e.target.checked)}
                    />
                    Ativar sincronização automática
                  </label>

                  <div className="flex flex-col md:flex-row gap-3">
                    <button
                      onClick={handleEditManga}
                      disabled={actionLoading === "edit"}
                      className="px-5 py-3 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
                    >
                      {actionLoading === "edit" ? "Salvando..." : "Salvar alterações"}
                    </button>

                    <button
                      onClick={handleDeleteManga}
                      disabled={actionLoading === "delete"}
                      className="px-5 py-3 rounded-xl border border-red-700 text-red-200 hover:bg-red-500/10 transition disabled:opacity-50"
                    >
                      {actionLoading === "delete" ? "Excluindo..." : "Excluir mangá"}
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

                <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                  <span className="text-zinc-400">Prévia banner:</span>
                  {previewBanner ? (
                    <img
                      src={previewBanner}
                      alt="Banner"
                      className="mt-3 rounded-xl w-full h-40 object-cover"
                    />
                  ) : (
                    <div className="mt-3 rounded-xl w-full h-40 bg-zinc-800 flex items-center justify-center text-zinc-500">
                      Sem banner
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === "importar" && (
          <>
            {!hasSelectedManga ? (
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

        {tab === "descobrir" && (
          <section>
            <DiscoveryManager />
          </section>
        )}
      </div>
    </main>
  );
}