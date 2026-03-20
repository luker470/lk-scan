"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type SyncStatusResponse = {
  ok: boolean;
  summary?: {
    totalMangas: number;
    autoSyncCount: number;
    activeCount: number;
    errorCount: number;
  };
  errorItems?: Array<{
    id: string;
    title: string;
    lastSyncError: string;
    syncStatus: string;
  }>;
  recentItems?: Array<{
    id: string;
    title: string;
    chaptersCount: number;
    lastChapterNumber: number;
    latestChapter: string;
    syncStatus: string;
    syncImportedLastRun: number;
    syncSkippedLastRun: number;
    syncFoundLastRun: number;
  }>;
  error?: string;
};

export default function SyncStatusBoard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SyncStatusResponse | null>(null);

  async function loadStatus() {
    if (!user?.uid) {
      setData({
        ok: false,
        error: "Usuário não autenticado.",
      });
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/sync-status", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
      });

      const raw = await res.text();

      let json: SyncStatusResponse | null = null;

      try {
        json = JSON.parse(raw) as SyncStatusResponse;
      } catch {
        setData({
          ok: false,
          error:
            "A rota /api/admin/sync-status não retornou JSON. Verifique se o arquivo app/api/admin/sync-status/route.ts existe corretamente.",
        });
        return;
      }

      setData(json);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao carregar status.";
      setData({ ok: false, error: message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [user?.uid]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-cyan-400">📊 Status do sync</h2>

        <button
          onClick={loadStatus}
          className="px-4 py-2 rounded-xl border border-zinc-700 hover:border-cyan-400 hover:text-cyan-300 transition"
        >
          Atualizar status
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-400">Carregando status...</div>
      ) : !data?.ok ? (
        <div className="rounded-xl border border-red-800 bg-red-500/10 p-4 text-sm text-red-300">
          {data?.error || "Erro ao carregar status."}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-sm text-zinc-400">Total de mangás</div>
              <div className="mt-2 text-2xl font-extrabold text-cyan-400">
                {data.summary?.totalMangas ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-sm text-zinc-400">Auto sync</div>
              <div className="mt-2 text-2xl font-extrabold text-cyan-400">
                {data.summary?.autoSyncCount ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-sm text-zinc-400">Ativos</div>
              <div className="mt-2 text-2xl font-extrabold text-cyan-400">
                {data.summary?.activeCount ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <div className="text-sm text-zinc-400">Com erro</div>
              <div className="mt-2 text-2xl font-extrabold text-red-400">
                {data.summary?.errorCount ?? 0}
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-5">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">⚠️ Últimos erros</h3>

              <div className="space-y-3">
                {(data.errorItems || []).length === 0 ? (
                  <div className="text-sm text-zinc-500">Sem erros recentes.</div>
                ) : (
                  data.errorItems?.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="font-semibold text-zinc-100">{item.title}</div>
                      <div className="text-xs text-zinc-400 mt-1 break-words">
                        {item.lastSyncError || item.syncStatus}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-5">
              <h3 className="text-lg font-bold text-cyan-400 mb-4">🕒 Últimos syncs</h3>

              <div className="space-y-3">
                {(data.recentItems || []).length === 0 ? (
                  <div className="text-sm text-zinc-500">Sem dados recentes.</div>
                ) : (
                  data.recentItems?.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="font-semibold text-zinc-100">{item.title}</div>
                      <div className="mt-1 text-xs text-zinc-400">
                        capítulos: {item.chaptersCount} | último nº: {item.lastChapterNumber}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        encontrados: {item.syncFoundLastRun} | importados: {item.syncImportedLastRun} | pulados: {item.syncSkippedLastRun}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        status: {item.syncStatus || "—"}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        último capítulo: {item.latestChapter || "—"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}