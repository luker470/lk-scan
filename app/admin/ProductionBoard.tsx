"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type ReportSummary = {
  totalMangas: number;
  autoSyncCount: number;
  syncEnabledCount: number;
  backupEnabledCount: number;
  mirrorEnabledCount: number;
  healthyCount: number;
  warningCount: number;
  activeCount: number;
  errorCount: number;
};

export default function ProductionBoard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const res = await fetch("/api/admin/system-report", {
          headers: {
            "x-user-id": user.uid,
          },
        });

        const data = await res.json();

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || "Erro ao carregar relatório.");
        }

        setSummary(data.summary || null);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erro ao carregar relatório.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user?.uid]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-cyan-400">📊 Painel de produção</h2>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-400">Carregando relatório...</div>
      ) : error ? (
        <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      ) : !summary ? (
        <div className="text-sm text-zinc-400">Sem dados.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card label="Mangás totais" value={summary.totalMangas} />
          <Card label="Auto sync" value={summary.autoSyncCount} />
          <Card label="Sync habilitado" value={summary.syncEnabledCount} />
          <Card label="Backup habilitado" value={summary.backupEnabledCount} />
          <Card label="Mirror habilitado" value={summary.mirrorEnabledCount} />
          <Card label="Fontes saudáveis" value={summary.healthyCount} />
          <Card label="Fontes em alerta" value={summary.warningCount} />
          <Card label="Sync ativo" value={summary.activeCount} />
          <Card label="Erros" value={summary.errorCount} />
        </div>
      )}
    </section>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="mt-2 text-3xl font-extrabold text-cyan-400">{value}</div>
    </div>
  );
}