"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type QueueStats = {
  total: number;
  queued: number;
  running: number;
  success: number;
  warning: number;
  error: number;
  critical: number;
  high: number;
};

type OperatorStatusResponse = {
  ok: boolean;
  generatedAt: string;
  health: "healthy" | "warning" | "critical";
  currentJobStatus: string;
  error?: string;
  metrics: {
    totalMangas: number;
    totalChapters: number;
    totalViews: number;
    dayViews: number;
    weekViews: number;
    monthViews: number;
    totalUsers: number;
    totalFavorites: number;
    totalFollowing: number;
    totalHistoryEntries: number;
    totalBrokenChapters: number;
    autoSyncActive: number;
    sourcesHealthy: number;
    sourcesWarning: number;
    sourcesCritical: number;
    last24hImportedChapters: number;
    last24hIncidents: number;
  };
  learning: Array<{
    host: string;
    score: number;
    successRate: number;
    errorRate: number;
    recommendedPriority: number;
    health: string;
  }>;
  latestIncidents: Array<{
    id: string;
    title: string;
    type: string;
    severity: string;
    resolved?: boolean;
    createdAt?: any;
  }>;
  latestActions: Array<{
    id: string;
    type: string;
    status: string;
    message: string;
    createdAt?: any;
  }>;
  latestReports?: Array<{
    id: string;
    summary: string;
    generatedAt?: any;
  }>;
  queue?: QueueStats;
  queuePreview?: Array<{
    id?: string;
    title?: string;
    type?: string;
    status?: string;
    priority?: string;
    updatedAt?: any;
  }>;
  center?: {
    summary?: {
      totalMangas: number;
      totalChapters: number;
      totalViews: number;
      dayViews: number;
      weekViews: number;
      monthViews: number;
      totalBrokenChapters: number;
      totalUsers: number;
      totalFavorites: number;
      totalFollowing: number;
      totalHistoryEntries: number;
      autoSyncActive: number;
      last24hImportedChapters: number;
      last24hIncidents: number;
      unresolvedIncidents: number;
      automationNot100?: boolean;
    };
    operator?: {
      health: string;
      currentJobStatus: string;
      lastRunStartedAt?: any;
      lastRunFinishedAt?: any;
      lastRunError?: string;
      lastRunReportSummary?: string;
      lastBrokenChaptersCount?: number;
      lastReportId?: string;
    };
  };
};

type Tone = "cyan" | "emerald" | "yellow" | "red" | "zinc";

function healthClass(health?: string) {
  if (health === "healthy") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (health === "critical") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
}

function toneValueClass(tone: Tone) {
  if (tone === "emerald") return "text-emerald-300";
  if (tone === "yellow") return "text-yellow-300";
  if (tone === "red") return "text-red-300";
  if (tone === "zinc") return "text-zinc-100";
  return "text-cyan-300";
}

function cardBorderClass(tone: Tone) {
  if (tone === "emerald") return "border-emerald-500/20";
  if (tone === "yellow") return "border-yellow-500/20";
  if (tone === "red") return "border-red-500/20";
  if (tone === "zinc") return "border-zinc-700";
  return "border-cyan-500/20";
}

function severityClass(severity?: string) {
  if (severity === "critical") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (severity === "high") {
    return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  }
  if (severity === "warning") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  }
  return "border-cyan-500/30 bg-cyan-500/10 text-cyan-300";
}

function actionStatusClass(status?: string) {
  if (status === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (status === "warning") {
    return "border-yellow-500/30 bg-yellow-500/10 text-yellow-300";
  }
  return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
}

function formatAnyDate(v: any) {
  if (!v) return "Sem data";
  if (v instanceof Date) return v.toLocaleString("pt-BR");
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString("pt-BR");
  }
  if (v?.seconds) return new Date(v.seconds * 1000).toLocaleString("pt-BR");
  if (v?._seconds) return new Date(v._seconds * 1000).toLocaleString("pt-BR");
  return "Sem data";
}

function compactText(value: unknown, max = 160) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function StatCard({
  label,
  value,
  tone = "cyan",
  helper,
}: {
  label: string;
  value: string | number;
  tone?: Tone;
  helper?: string;
}) {
  return (
    <div
      className={`rounded-2xl border ${cardBorderClass(
        tone
      )} bg-black/20 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]`}
    >
      <div className="text-sm text-zinc-500">{label}</div>
      <div className={`mt-2 text-2xl font-extrabold ${toneValueClass(tone)}`}>
        {value}
      </div>
      {helper ? <div className="mt-2 text-xs text-zinc-500">{helper}</div> : null}
    </div>
  );
}

function SourceBar({ score }: { score: number }) {
  const safe = Math.max(0, Math.min(100, Number(score || 0)));

  return (
    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
      <div
        className="h-full rounded-full bg-cyan-400"
        style={{ width: `${safe}%` }}
      />
    </div>
  );
}

export default function OperatorDashboard() {
  const { user } = useAuth();

  const [data, setData] = useState<OperatorStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [feedback, setFeedback] = useState("");

  async function loadStatus(showLoader = true) {
    if (!user?.uid) return;

    if (showLoader) setLoading(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/status", {
        headers: {
          "x-user-id": user.uid,
        },
        cache: "no-store",
      });

      const json = await res.json();
      setData(json);

      if (!json?.ok && json?.error) {
        setFeedback(json.error);
      }
    } catch (e) {
      console.error("Erro ao carregar status do operador:", e);
      setFeedback("Erro ao carregar status do operador.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function runOperator() {
    if (!user?.uid) return;
    setRunning(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/run", {
        method: "POST",
        headers: {
          "x-user-id": user.uid,
        },
      });

      const json = await res.json().catch(() => null);

      if (!json?.ok && json?.error) {
        setFeedback(json.error);
      } else {
        setFeedback(
          json?.summary?.message || "Operador executado com sucesso."
        );
      }

      await loadStatus(false);
    } catch (e) {
      console.error("Erro ao rodar operador:", e);
      setFeedback("Erro ao rodar operador.");
    } finally {
      setRunning(false);
    }
  }

  async function generateReport() {
    if (!user?.uid) return;
    setReporting(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/report", {
        method: "POST",
        headers: {
          "x-user-id": user.uid,
        },
      });

      const json = await res.json().catch(() => null);

      if (!json?.ok && json?.error) {
        setFeedback(json.error);
      } else {
        setFeedback("Relatório gerado com sucesso.");
      }

      await loadStatus(false);
    } catch (e) {
      console.error("Erro ao gerar relatório:", e);
      setFeedback("Erro ao gerar relatório.");
    } finally {
      setReporting(false);
    }
  }

  useEffect(() => {
    loadStatus(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!autoRefresh || !user?.uid) return;

    const timer = setInterval(() => {
      loadStatus(false);
    }, 30000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, user?.uid]);

  const metrics = data?.metrics;
  const centerSummary = data?.center?.summary;
  const centerOperator = data?.center?.operator;
  const queue = data?.queue || {
    total: 0,
    queued: 0,
    running: 0,
    success: 0,
    warning: 0,
    error: 0,
    critical: 0,
    high: 0,
  };
  const queuePreview = data?.queuePreview || [];
  const automationNot100 = !!centerSummary?.automationNot100;

  const summary = useMemo(() => {
    if (!data || !metrics) {
      return {
        title: "Sem dados",
        text: "Ainda não há informações do operador carregadas.",
      };
    }

    if (data.health === "critical") {
      return {
        title: "Atenção crítica",
        text: `O sistema precisa de ação rápida. Existem ${metrics.totalBrokenChapters} capítulos problemáticos, ${metrics.sourcesCritical} fontes críticas, ${centerSummary?.unresolvedIncidents ?? 0} incidentes em aberto e ${queue.queued} task(s) pendentes.`,
      };
    }

    if (data.health === "warning") {
      return {
        title: "Operação em alerta",
        text: `O site está funcionando, mas exige ajustes. Há ${metrics.totalBrokenChapters} capítulos com problema, ${metrics.last24hIncidents} incidentes recentes e ${queue.queued} task(s) aguardando execução.`,
      };
    }

    return {
      title: "Operação saudável",
      text: `O operador está estável. ${metrics.last24hImportedChapters} capítulos foram processados nas últimas 24h, ${metrics.sourcesHealthy} fontes estão saudáveis e a fila atual tem ${queue.queued} task(s) pendentes.`,
    };
  }, [data, metrics, centerSummary?.unresolvedIncidents, queue.queued]);

  const topSources = useMemo(() => {
  const learning = Array.isArray(data?.learning) ? data.learning : [];

  return [...learning]
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))
    .slice(0, 8);
}, [data]);

  const priorities = useMemo(() => {
    if (!metrics || !centerSummary) return [];

    const list: string[] = [];

    if (metrics.totalBrokenChapters > 0) {
      list.push(
        `Tratar ${metrics.totalBrokenChapters} capítulo(s) quebrado(s) com recovery, validate e reimport quando necessário.`
      );
    }

    if (metrics.sourcesCritical > 0) {
      list.push(
        `Reduzir dependência de ${metrics.sourcesCritical} fonte(s) crítica(s) e reforçar fallback das fontes saudáveis.`
      );
    }

    if (queue.critical > 0 || queue.error > 0) {
      list.push(
        `Resolver fila crítica/erro: ${queue.critical} crítica(s) e ${queue.error} com erro.`
      );
    }

    if (centerSummary.unresolvedIncidents > 0) {
      list.push(
        `Baixar os ${centerSummary.unresolvedIncidents} incidente(s) em aberto para estabilizar a operação.`
      );
    }

    if (automationNot100) {
      list.push(
        "Fechar o ciclo discovery → importação → validação → recovery para aproximar a automação de 100%."
      );
    }

    if (list.length === 0) {
      list.push("Operação estável. Foco em manutenção preventiva, escala e expansão do catálogo.");
    }

    return list.slice(0, 5);
  }, [metrics, centerSummary, queue, automationNot100]);

  return (
    <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-bold text-cyan-400">🧠 LK AI Operator</h2>
          <p className="text-sm text-zinc-400">
            Centro operacional unificado: saúde, incidentes, fontes, fila,
            relatórios, automação e prioridade do catálogo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => loadStatus(true)}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300"
          >
            Atualizar
          </button>

          <button
            onClick={runOperator}
            disabled={running}
            className="rounded-xl bg-cyan-500 px-4 py-2 font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50"
          >
            {running ? "Executando..." : "Rodar operador"}
          </button>

          <button
            onClick={generateReport}
            disabled={reporting}
            className="rounded-xl border border-cyan-500/40 px-4 py-2 text-cyan-300 transition hover:bg-cyan-500/10 disabled:opacity-50"
          >
            {reporting ? "Gerando..." : "Gerar relatório"}
          </button>

          <label className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            auto
          </label>
        </div>
      </div>

      {feedback ? (
        <div className="rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {feedback}
        </div>
      ) : null}

      {automationNot100 ? (
        <div className="rounded-2xl border border-yellow-700 bg-yellow-500/10 p-4">
          <div className="text-sm font-bold text-yellow-300">
            ⚠ Automação ainda não está 100%
          </div>
          <div className="mt-2 text-sm leading-6 text-yellow-100/90">
            O sistema automático de descoberta, identificação, importação, validação
            e correção de mangás/capítulos ainda está evoluindo. O Operator já
            monitora, enfileira e executa parte desse fluxo automaticamente.
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-zinc-800 bg-black/20 p-6 text-zinc-400">
          Carregando status do operador...
        </div>
      ) : !data || !metrics ? (
        <div className="rounded-2xl border border-zinc-800 bg-black/20 p-6 text-zinc-500">
          Sem dados do operador ainda.
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${healthClass(
                    data.health
                  )}`}
                >
                  saúde: {data.health}
                </span>

                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300">
                  job: {data.currentJobStatus}
                </span>

                <span className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300">
                  atualizado: {formatAnyDate(data.generatedAt)}
                </span>
              </div>

              <div className="mt-4">
                <div className="text-lg font-bold text-zinc-100">{summary.title}</div>
                <div className="mt-1 text-sm leading-6 text-zinc-300">
                  {summary.text}
                </div>
              </div>

              {centerOperator ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300">
                    <div className="text-xs text-zinc-500">Último início</div>
                    <div className="mt-1">{formatAnyDate(centerOperator.lastRunStartedAt)}</div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300">
                    <div className="text-xs text-zinc-500">Último fim</div>
                    <div className="mt-1">{formatAnyDate(centerOperator.lastRunFinishedAt)}</div>
                  </div>
                </div>
              ) : null}

              {centerOperator?.lastRunError ? (
                <div className="mt-4 rounded-xl border border-red-800 bg-red-500/5 p-3 text-sm text-red-300">
                  <b>Último erro:</b> {centerOperator.lastRunError}
                </div>
              ) : null}

              {centerOperator?.lastRunReportSummary ? (
                <div className="mt-4 rounded-xl border border-cyan-900 bg-cyan-500/5 p-3 text-sm text-cyan-200">
                  <b>Resumo do último ciclo:</b> {centerOperator.lastRunReportSummary}
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-5">
              <div className="text-sm text-zinc-500">Resumo rápido</div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  Fontes saudáveis:{" "}
                  <b className="text-emerald-300">{metrics.sourcesHealthy}</b>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  Fontes críticas:{" "}
                  <b className="text-red-300">{metrics.sourcesCritical}</b>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  Incidentes 24h:{" "}
                  <b className="text-yellow-300">{metrics.last24hIncidents}</b>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  Em aberto:{" "}
                  <b className="text-orange-300">
                    {centerSummary?.unresolvedIncidents ?? 0}
                  </b>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  Fila pendente:{" "}
                  <b className="text-cyan-300">{queue.queued}</b>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
                  Fila rodando:{" "}
                  <b className="text-emerald-300">{queue.running}</b>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Mangás" value={metrics.totalMangas} />
            <StatCard label="Capítulos" value={metrics.totalChapters} />
            <StatCard label="Usuários" value={metrics.totalUsers} />
            <StatCard
              label="Capítulos com problema"
              value={metrics.totalBrokenChapters}
              tone={metrics.totalBrokenChapters > 0 ? "red" : "emerald"}
              helper="pagesCount zerado ou suspeito"
            />
            <StatCard label="Favoritos" value={metrics.totalFavorites} />
            <StatCard label="Seguindo" value={metrics.totalFollowing} />
            <StatCard label="Histórico" value={metrics.totalHistoryEntries} tone="zinc" />
            <StatCard label="Views totais" value={metrics.totalViews.toLocaleString()} tone="zinc" />
            <StatCard label="Views dia" value={metrics.dayViews.toLocaleString()} />
            <StatCard label="Views semana" value={metrics.weekViews.toLocaleString()} />
            <StatCard label="Views mês" value={metrics.monthViews.toLocaleString()} />
            <StatCard label="Tasks fila" value={queue.total} tone="cyan" />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
            <h3 className="mb-3 font-bold text-cyan-300">🎯 Prioridades operacionais</h3>
            <div className="grid gap-3 xl:grid-cols-2">
              {priorities.map((item, index) => (
                <div
                  key={`${index}-${item}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-200"
                >
                  <span className="mr-2 font-bold text-cyan-300">#{index + 1}</span>
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <h3 className="mb-3 font-bold text-cyan-300">⚙️ Fontes e aprendizado</h3>

              <div className="space-y-3">
                {topSources.length === 0 ? (
                  <div className="text-sm text-zinc-500">Sem aprendizado ainda.</div>
                ) : (
                  topSources.map((item, index) => (
                    <div
                      key={item.host}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                              #{index + 1}
                            </span>
                            <div className="line-clamp-1 font-semibold text-zinc-100">
                              {item.host}
                            </div>
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            prioridade sugerida: {item.recommendedPriority}
                          </div>
                        </div>

                        <div
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${healthClass(
                            item.health
                          )}`}
                        >
                          {item.health}
                        </div>
                      </div>

                      <SourceBar score={item.score} />

                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-zinc-400">
                        <span>score: {item.score}</span>
                        <span>sucesso: {item.successRate}%</span>
                        <span>erro: {item.errorRate}%</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <h3 className="mb-3 font-bold text-cyan-300">📦 Preview da fila</h3>

              <div className="space-y-3">
                {queuePreview.length === 0 ? (
                  <div className="text-sm text-zinc-500">Sem preview da fila.</div>
                ) : (
                  queuePreview.map((item, index) => (
                    <div
                      key={item.id || `${item.type}-${index}`}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="font-semibold text-zinc-200">
                        {item.title || item.type || "Task"}
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {item.type || "—"} • {item.priority || "—"} • {item.status || "—"}
                      </div>
                      {item.updatedAt ? (
                        <div className="mt-1 text-[11px] text-zinc-600">
                          atualização: {formatAnyDate(item.updatedAt)}
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <h3 className="mb-3 font-bold text-cyan-300">📝 Últimos relatórios</h3>

              <div className="space-y-3">
                {!data.latestReports?.length ? (
                  <div className="text-sm text-zinc-500">Sem relatórios recentes.</div>
                ) : (
                  data.latestReports.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="font-semibold text-zinc-200">
                        {compactText(item.summary, 180)}
                      </div>
                      <div className="mt-2 text-sm text-zinc-500">
                        {formatAnyDate(item.generatedAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <h3 className="mb-3 font-bold text-cyan-300">🚨 Incidentes recentes</h3>

              <div className="space-y-3">
                {data.latestIncidents.length === 0 ? (
                  <div className="text-sm text-zinc-500">Sem incidentes recentes.</div>
                ) : (
                  data.latestIncidents.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-zinc-200">
                          {compactText(item.title, 180)}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${severityClass(
                            item.severity
                          )}`}
                        >
                          {item.severity}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-zinc-500">
                        {item.type} • {item.resolved ? "resolvido" : "aberto"}
                        {item.createdAt ? ` • ${formatAnyDate(item.createdAt)}` : ""}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <h3 className="mb-3 font-bold text-cyan-300">📌 Ações recentes</h3>

              <div className="space-y-3">
                {data.latestActions.length === 0 ? (
                  <div className="text-sm text-zinc-500">
                    Sem ações registradas ainda.
                  </div>
                ) : (
                  data.latestActions.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-zinc-200">{item.type}</div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${actionStatusClass(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <div className="mt-2 text-sm text-zinc-400">
                        {compactText(item.message, 180)}
                      </div>

                      {item.createdAt ? (
                        <div className="mt-2 text-[11px] text-zinc-600">
                          {formatAnyDate(item.createdAt)}
                        </div>
                      ) : null}
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