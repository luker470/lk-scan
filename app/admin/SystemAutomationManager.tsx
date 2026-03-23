"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type AutomationStatusResponse = {
  ok: boolean;
  config: any;
  queue: {
    queued: number;
    processing: number;
    done: number;
    failed: number;
  };
  recentLogs: any[];
  sources: any[];
  locks: any[];
  failedQueue?: any[];
};

function formatDate(ms?: number) {
  if (!ms) return "Nunca";
  return new Date(ms).toLocaleString("pt-BR");
}

export default function SystemAutomationManager() {
  const { user } = useAuth();

  const [status, setStatus] = useState<AutomationStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState("");

  async function loadStatus() {
    if (!user?.uid) return;

    setLoading(true);

    try {
      const res = await fetch("/api/admin/automation/status", {
        headers: { "x-user-id": user.uid },
        cache: "no-store",
      });

      const data = await res.json();
      setStatus(data);
    } catch {
      setResult("Erro ao carregar status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [user?.uid]);

  async function runAction(action: string, extra?: any) {
    if (!user?.uid) return;

    try {
      setRunning(action);
      setResult("Executando...");

      const res = await fetch("/api/admin/automation/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          action,
          ...extra,
        }),
      });

      const data = await res.json();

      if (!data?.ok) {
        if (data?.locked) {
          setResult("⚠️ Sistema já está rodando...");
          return;
        }

        throw new Error(
          data?.error ||
            data?.reason ||
            data?.message ||
            "Erro desconhecido"
        );
      }

      setResult(JSON.stringify(data, null, 2));
      await loadStatus();
    } catch (e: any) {
      setResult(e?.message || "Erro ao executar.");
    } finally {
      setRunning(null);
    }
  }

  async function retryTask(taskId: string) {
    await runAction("retry-one", { taskId });
  }

  async function retryAll() {
    await runAction("retry-failed");
  }

  if (!user?.uid) return null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h2 className="mb-4 text-xl font-bold text-cyan-400">
          🤖 Automação Total
        </h2>

        <div className="flex flex-wrap gap-2">
          <Btn
            active={running === "schedule"}
            onClick={() => runAction("schedule")}
          >
            Agendar
          </Btn>

          <Btn
            active={running === "process"}
            onClick={() => runAction("process")}
          >
            Processar fila
          </Btn>

          <Btn
            active={running === "retry-failed"}
            onClick={retryAll}
            className="text-yellow-300"
          >
            Reprocessar falhas
          </Btn>

          <Btn onClick={loadStatus} className="bg-cyan-500 text-black">
            {loading ? "Atualizando..." : "Atualizar"}
          </Btn>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card title="Fila" value={status?.queue?.queued} />
        <Card
          title="Processando"
          value={status?.queue?.processing}
          color="text-cyan-400"
        />
        <Card
          title="Concluído"
          value={status?.queue?.done}
          color="text-emerald-400"
        />
        <Card
          title="Falhas"
          value={status?.queue?.failed}
          color="text-red-400"
        />
      </section>

      <section className="rounded-2xl border border-red-500/30 bg-zinc-900/60 p-5">
        <div className="mb-4 flex justify-between">
          <h3 className="font-bold text-red-400">🚨 Falhas</h3>
          <span className="text-xs text-zinc-500">
            {status?.failedQueue?.length || 0} erros
          </span>
        </div>

        {(status?.failedQueue || []).length === 0 && (
          <div className="text-zinc-500">Nenhuma falha</div>
        )}

        {(status?.failedQueue || []).map((item) => (
          <div
            key={item.id}
            className="mb-3 rounded-xl border border-zinc-800 bg-black/20 p-4"
          >
            <div className="flex justify-between gap-3">
              <div className="font-bold">{item.type}</div>
              <div className="text-xs text-zinc-500">
                tentativas: {item.attempts}
              </div>
            </div>

            <div className="mt-2 text-xs text-red-300">{item.lastError}</div>

            {item.nextRetryAt ? (
              <div className="mt-1 text-xs text-zinc-500">
                Próxima tentativa: {formatDate(item.nextRetryAt)}
              </div>
            ) : null}

            {item.finishedAtMs ? (
              <div className="mt-1 text-xs text-zinc-500">
                Última falha: {formatDate(item.finishedAtMs)}
              </div>
            ) : null}

            <button
              onClick={() => retryTask(item.id)}
              className="mt-3 text-sm text-cyan-300 hover:underline"
            >
              🔁 Reprocessar
            </button>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-3 font-bold text-cyan-400">📜 Logs</h3>

        {(status?.recentLogs || []).length === 0 && (
          <div className="text-zinc-500">Nenhum log recente</div>
        )}

        {(status?.recentLogs || []).map((log) => (
          <div
            key={log.id}
            className="mb-2 rounded-xl border border-zinc-800 p-3"
          >
            <div className="flex justify-between">
              <span>{log.type}</span>
              <span
                className={`text-xs ${
                  log.status === "success"
                    ? "text-emerald-400"
                    : log.status === "error"
                    ? "text-red-400"
                    : "text-cyan-400"
                }`}
              >
                {log.status}
              </span>
            </div>

            <div className="text-xs text-zinc-400">
              {formatDate(log.startedAtMs)}
            </div>
          </div>
        ))}
      </section>

      <pre className="rounded-xl bg-black p-4 text-xs">{result}</pre>
    </div>
  );
}

function Card({ title, value, color = "text-white" }: any) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-sm text-zinc-500">{title}</div>
      <div className={`text-2xl font-bold ${color}`}>{value ?? 0}</div>
    </div>
  );
}

function Btn({ children, onClick, active, className = "" }: any) {
  return (
    <button
      onClick={onClick}
      disabled={!!active}
      className={`rounded-xl border border-zinc-700 px-4 py-2 hover:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {active ? "..." : children}
    </button>
  );
}