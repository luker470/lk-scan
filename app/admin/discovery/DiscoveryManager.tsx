// app/admin/discovery/DiscoveryManager.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type DiscoveryItem = {
  id: string;
  source: string;
  title: string;
  url: string;
  cover?: string;
  latestChapter?: string;
  approved?: boolean;
  mangaId?: string;
  updatedAt?: any;
};

const SOURCES = [
  { key: "mangasonline", label: "Mangás Online" },
  { key: "mangaonlinered", label: "Manga Online Red" },
];

export default function DiscoveryManager() {
  const { user } = useAuth();

  const [source, setSource] = useState("mangasonline");
  const [loading, setLoading] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [maxChapters, setMaxChapters] = useState("30");
  const [busyId, setBusyId] = useState("");

  async function loadItems() {
    if (!user?.uid) return;

    setLoadingItems(true);
    setStatus("");

    try {
      const res = await fetch("/api/admin/discovery", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao carregar descobertos.");
      }

      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error: any) {
      setStatus(error?.message || "Erro ao carregar itens.");
    } finally {
      setLoadingItems(false);
    }
  }

  async function runDiscovery() {
    if (!user?.uid) return;

    setLoading(true);
    setStatus("");

    try {
      const res = await fetch("/api/admin/discovery", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({ source }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro na descoberta automática.");
      }

      setStatus(
        `Descoberta concluída. Encontrados: ${data.totalFound} | Salvos: ${data.totalSaved}`
      );

      await loadItems();
    } catch (error: any) {
      setStatus(error?.message || "Erro ao executar descoberta.");
    } finally {
      setLoading(false);
    }
  }

  async function approveItem(discoveredId: string) {
    if (!user?.uid) return;

    setBusyId(discoveredId);
    setStatus("");

    try {
      const res = await fetch("/api/admin/discovery/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({ discoveredId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao aprovar mangá.");
      }

      setStatus(`Mangá aprovado e criado com sucesso: ${data.title}`);
      await loadItems();
    } catch (error: any) {
      setStatus(error?.message || "Erro ao aprovar item.");
    } finally {
      setBusyId("");
    }
  }

  async function importChapters(item: DiscoveryItem) {
    if (!user?.uid) return;
    if (!item.mangaId) {
      setStatus("Esse item ainda não possui mangaId.");
      return;
    }

    setBusyId(item.id);
    setStatus("");

    try {
      const parsedMax = Number(maxChapters || 0);

      const res = await fetch("/api/admin/discovery/import-chapters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          mangaId: item.mangaId,
          sourceUrl: item.url,
          maxChapters: Number.isFinite(parsedMax) ? parsedMax : 0,
          overwrite: false,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Erro ao importar capítulos.");
      }

      setStatus(
        `Importação concluída para ${item.title}. Importados: ${data.imported} | Pulados: ${data.skipped} | Com páginas: ${data.withPages}`
      );

      await loadItems();
    } catch (error: any) {
      setStatus(error?.message || "Erro ao importar capítulos.");
    } finally {
      setBusyId("");
    }
  }

  async function approveAndImport(item: DiscoveryItem) {
    if (!user?.uid) return;

    setBusyId(item.id);
    setStatus("");

    try {
      let currentMangaId = item.mangaId;

      if (!item.approved) {
        const approveRes = await fetch("/api/admin/discovery/approve", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-id": user.uid,
          },
          body: JSON.stringify({ discoveredId: item.id }),
        });

        const approveData = await approveRes.json();

        if (!approveRes.ok) {
          throw new Error(approveData?.error || "Erro ao aprovar mangá.");
        }

        currentMangaId = approveData?.mangaId;
      }

      if (!currentMangaId) {
        throw new Error("mangaId não encontrado após aprovação.");
      }

      const parsedMax = Number(maxChapters || 0);

      const importRes = await fetch("/api/admin/discovery/import-chapters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          mangaId: currentMangaId,
          sourceUrl: item.url,
          maxChapters: Number.isFinite(parsedMax) ? parsedMax : 0,
          overwrite: false,
        }),
      });

      const importData = await importRes.json();

      if (!importRes.ok) {
        throw new Error(importData?.error || "Erro ao importar capítulos.");
      }

      setStatus(
        `Aprovação + importação concluídas para ${item.title}. Importados: ${importData.imported} | Pulados: ${importData.skipped}`
      );

      await loadItems();
    } catch (error: any) {
      setStatus(error?.message || "Erro no fluxo completo.");
    } finally {
      setBusyId("");
    }
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      return (
        item.title?.toLowerCase().includes(q) ||
        item.source?.toLowerCase().includes(q) ||
        item.latestChapter?.toLowerCase().includes(q)
      );
    });
  }, [items, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold">Descoberta automática de mangás</h2>
        <p className="mt-1 text-sm text-white/70">
          Busca obras automaticamente em sites-fonte, salva em fila de aprovação e
          permite importar capítulos completos.
        </p>

        <div className="mt-4 grid gap-3 xl:grid-cols-[220px_1fr_140px_auto]">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
          >
            {SOURCES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por título..."
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
          />

          <input
            value={maxChapters}
            onChange={(e) => setMaxChapters(e.target.value)}
            placeholder="Máx. caps"
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
          />

          <button
            onClick={runDiscovery}
            disabled={loading}
            className="rounded-xl bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500 disabled:opacity-60"
          >
            {loading ? "Descobrindo..." : "Executar descoberta"}
          </button>
        </div>

        <p className="mt-2 text-xs text-white/50">
          Em “Máx. caps”, use 0 para tentar importar tudo. Para testes, use 10 ou 30.
        </p>

        {status ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/80">
            {status}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">
            Itens descobertos ({filteredItems.length})
          </h3>

          <button
            onClick={loadItems}
            disabled={loadingItems}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm hover:bg-white/5 disabled:opacity-60"
          >
            {loadingItems ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item) => {
            const isBusy = busyId === item.id;

            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
              >
                <div className="aspect-[3/4] w-full bg-black/30">
                  {item.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/img?url=${encodeURIComponent(item.cover)}`}
                      alt={item.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-white/40">
                      Sem capa
                    </div>
                  )}
                </div>

                <div className="space-y-2 p-3">
                  <div className="text-sm text-emerald-400">{item.source}</div>
                  <h4 className="line-clamp-2 font-semibold">{item.title}</h4>

                  {item.latestChapter ? (
                    <p className="text-sm text-white/70">
                      Último capítulo detectado: {item.latestChapter}
                    </p>
                  ) : null}

                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm text-sky-400 hover:underline"
                  >
                    Ver origem
                  </a>

                  {item.approved ? (
                    <div className="rounded-xl bg-emerald-700/30 px-3 py-2 text-sm text-emerald-300">
                      Aprovado {item.mangaId ? `• ID: ${item.mangaId}` : ""}
                    </div>
                  ) : (
                    <div className="rounded-xl bg-yellow-700/20 px-3 py-2 text-sm text-yellow-300">
                      Aguardando aprovação
                    </div>
                  )}

                  <div className="grid gap-2 pt-2">
                    {!item.approved ? (
                      <>
                        <button
                          onClick={() => approveItem(item.id)}
                          disabled={isBusy}
                          className="w-full rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-60"
                        >
                          {isBusy ? "Processando..." : "Aprovar"}
                        </button>

                        <button
                          onClick={() => approveAndImport(item)}
                          disabled={isBusy}
                          className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {isBusy ? "Processando..." : "Aprovar + importar capítulos"}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => importChapters(item)}
                        disabled={isBusy}
                        className="w-full rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-60"
                      >
                        {isBusy ? "Importando..." : "Importar capítulos"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {!filteredItems.length ? (
            <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-6 text-center text-white/60">
              Nenhum item descoberto ainda.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}