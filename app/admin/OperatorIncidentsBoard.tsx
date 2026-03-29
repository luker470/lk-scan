"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type IncidentItem = {
  id: string;
  title: string;
  type: string;
  severity: string;
  resolved?: boolean;
  createdAt?: any;
  updatedAt?: any;
  resolvedAt?: any;
  reopenedAt?: any;
  resolutionNote?: string;
  lastError?: string;
  meta?: Record<string, any>;
};

type IncidentsResponse = {
  ok: boolean;
  items: IncidentItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  summary?: {
    total: number;
    open: number;
    resolved: number;
    critical: number;
    high: number;
    warning: number;
    info: number;
    byType?: {
      site?: number;
      api?: number;
      source?: number;
      parser?: number;
      chapter?: number;
      sync?: number;
      queue?: number;
      backup?: number;
      comment?: number;
      operator?: number;
      unknown?: number;
    };
  };
  executive?: {
    health?: string;
    message?: string;
  };
  filters?: {
    q?: string;
    severity?: string;
    type?: string;
    status?: string;
  };
  error?: string;
};

function severityClass(severity?: string) {
  if (severity === "critical") {
    return "border-red-700 bg-red-500/10 text-red-300";
  }
  if (severity === "high") {
    return "border-orange-700 bg-orange-500/10 text-orange-300";
  }
  if (severity === "warning") {
    return "border-yellow-700 bg-yellow-500/10 text-yellow-300";
  }
  return "border-cyan-700 bg-cyan-500/10 text-cyan-300";
}

function statusClass(resolved?: boolean) {
  return resolved
    ? "border-emerald-700 bg-emerald-500/10 text-emerald-300"
    : "border-yellow-700 bg-yellow-500/10 text-yellow-300";
}

function executiveClass(health?: string) {
  if (health === "critical") {
    return "border-red-800 bg-red-500/10 text-red-300";
  }
  if (health === "warning") {
    return "border-yellow-800 bg-yellow-500/10 text-yellow-300";
  }
  return "border-emerald-800 bg-emerald-500/10 text-emerald-300";
}

function severityWeight(severity?: string) {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function typeLabel(type?: string) {
  if (!type) return "desconhecido";
  if (type === "chapter") return "capítulo";
  if (type === "source") return "fonte";
  if (type === "parser") return "parser";
  if (type === "sync") return "sync";
  if (type === "operator") return "operador";
  if (type === "comment") return "comentário";
  if (type === "queue") return "fila";
  if (type === "backup") return "backup";
  if (type === "site") return "site";
  if (type === "api") return "api";
  return type;
}

function toDate(v: any) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const parsed = new Date(v);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (v?.seconds) return new Date(v.seconds * 1000);
  if (v?._seconds) return new Date(v._seconds * 1000);
  const parsed = new Date(v);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(v: any) {
  const d = toDate(v);
  if (!d) return "Sem data";
  return d.toLocaleString("pt-BR");
}

function relativeTime(v: any) {
  const d = toDate(v);
  if (!d) return "Sem data";

  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min atrás`;
  if (hours < 24) return `${hours} h atrás`;
  return `${days} dia(s) atrás`;
}

function compactText(value: unknown, max = 180) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function metaPreview(meta?: Record<string, any>) {
  if (!meta) return "";
  if (Array.isArray(meta?.brokenChapters)) {
    return `${meta.brokenChapters.length} capítulos amostrados`;
  }
  const keys = Object.keys(meta);
  if (keys.length === 0) return "";
  return keys.slice(0, 4).join(" • ");
}

function aiHint(item: IncidentItem) {
  if (item.type === "chapter") {
    return item.resolved
      ? "Capítulo já tratado. O operador pode validar o resultado final e observar reincidência."
      : "Prioridade para recovery, validação, reimportação ou fallback de fonte.";
  }

  if (item.type === "source") {
    return item.resolved
      ? "Fonte estabilizada. Monitorar score, trust e reincidência."
      : "Revalidar host, reduzir dependência e revisar resolução/fallback.";
  }

  if (item.type === "parser") {
    return item.resolved
      ? "Pipeline estabilizado temporariamente."
      : "Executar diagnóstico de discovery/importação e revisar parsing.";
  }

  if (item.type === "sync") {
    return item.resolved
      ? "Fluxo de sync voltou ao normal."
      : "Verificar auto sync, fila, fontes e baixa entrada de capítulos.";
  }

  if (item.type === "comment") {
    return item.resolved
      ? "Sinal da comunidade já tratado."
      : "Cruzar com comentários, fila e reader para reduzir reincidência.";
  }

  if (item.type === "queue") {
    return item.resolved
      ? "Fila estabilizada."
      : "O operador deve esvaziar tasks críticas/erro antes de crescer a automação.";
  }

  if (item.type === "operator") {
    return item.resolved
      ? "O núcleo do operador voltou ao normal."
      : "Verificar cron, cycle, memória, autonomia e integração do core.";
  }

  return item.resolved
    ? "Incidente encerrado, manter monitoramento."
    : "Revisão operacional recomendada.";
}

function countByType(summary?: IncidentsResponse["summary"]) {
  const byType = summary?.byType || {};
  return [
    { key: "chapter", label: "capítulo", value: byType.chapter || 0 },
    { key: "source", label: "fonte", value: byType.source || 0 },
    { key: "parser", label: "parser", value: byType.parser || 0 },
    { key: "sync", label: "sync", value: byType.sync || 0 },
    { key: "comment", label: "comentário", value: byType.comment || 0 },
    { key: "operator", label: "operador", value: byType.operator || 0 },
    { key: "queue", label: "fila", value: byType.queue || 0 },
    { key: "backup", label: "backup", value: byType.backup || 0 },
    { key: "site", label: "site", value: byType.site || 0 },
    { key: "api", label: "api", value: byType.api || 0 },
    { key: "unknown", label: "unknown", value: byType.unknown || 0 },
  ].filter((item) => item.value > 0);
}

export default function OperatorIncidentsBoard() {
  const { user } = useAuth();

  const [items, setItems] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState<string>("");
  const [runningOperator, setRunningOperator] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">(
    "all"
  );
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "critical" | "high" | "warning" | "info"
  >("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [summary, setSummary] = useState<IncidentsResponse["summary"]>();
  const [pagination, setPagination] = useState<IncidentsResponse["pagination"]>();
  const [executive, setExecutive] = useState<{
    health?: string;
    message?: string;
  } | null>(null);
  const [feedback, setFeedback] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const typeOptions = useMemo(() => {
    const known = new Set<string>([
      "site",
      "api",
      "source",
      "parser",
      "chapter",
      "sync",
      "queue",
      "backup",
      "comment",
      "operator",
      "unknown",
    ]);

    items.forEach((item) => {
      if (item.type) known.add(item.type);
    });

    return ["all", ...Array.from(known).sort()];
  }, [items]);

  async function load(customPage?: number, showLoader = true) {
    if (!user?.uid) return;

    const targetPage = customPage ?? page;

    if (showLoader) setLoading(true);
    setFeedback("");

    try {
      const params = new URLSearchParams();
      params.set("page", String(targetPage));
      params.set("pageSize", String(pageSize));
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);

      const res = await fetch(`/api/admin/operator/incidents?${params.toString()}`, {
        headers: { "x-user-id": user.uid },
        cache: "no-store",
      });

      const json: IncidentsResponse = await res.json();

      if (json?.ok) {
        const nextItems = Array.isArray(json.items) ? json.items : [];

        setItems(nextItems);
        setSummary(json.summary);
        setPagination(json.pagination);
        setExecutive(json.executive || null);
        setPage(json.pagination?.page || targetPage);
      } else {
        setItems([]);
        setExecutive(null);
        setFeedback(json?.error || "Erro ao carregar incidentes.");
      }
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao carregar incidentes.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function updateIncident(
    action: "resolve" | "reopen",
    incidentId: string,
    resolutionNote?: string
  ) {
    if (!user?.uid) return;

    setMutating(incidentId);
    setFeedback("");

    try {
      const payload =
        action === "resolve"
          ? {
              action,
              id: incidentId,
              resolutionNote:
                resolutionNote || "Resolvido manualmente no painel.",
            }
          : {
              action,
              id: incidentId,
              reopenReason:
                resolutionNote || "Reaberto manualmente para nova revisão.",
            };

      const res = await fetch("/api/admin/operator/incidents", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!json?.ok) {
        setFeedback(json?.error || "Não foi possível atualizar o incidente.");
        return;
      }

      setFeedback(
        action === "resolve"
          ? "Incidente resolvido com sucesso."
          : "Incidente reaberto com sucesso."
      );

      await load(undefined, false);
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao atualizar incidente.");
    } finally {
      setMutating("");
    }
  }

  async function runOperatorNow() {
    if (!user?.uid) return;

    setRunningOperator(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/run", {
        method: "POST",
        headers: {
          "x-user-id": user.uid,
        },
      });

      const json = await res.json().catch(() => null);

      if (!json?.ok && !json?.summary) {
        setFeedback(json?.error || "Falha ao executar operador.");
      } else {
        setFeedback(
          json?.summary?.message || "Operador executado com sucesso."
        );
      }

      await load(undefined, false);
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao executar operador.");
    } finally {
      setRunningOperator(false);
    }
  }

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, statusFilter, severityFilter, typeFilter, pageSize]);

  useEffect(() => {
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, debouncedQuery, statusFilter, severityFilter, typeFilter, pageSize]);

  useEffect(() => {
    if (!autoRefresh || !user?.uid) return;
    const timer = setInterval(() => {
      load(undefined, false);
    }, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, user?.uid, page, pageSize, debouncedQuery, statusFilter, severityFilter, typeFilter]);

  const stats = useMemo(() => {
    return {
      total: summary?.total ?? 0,
      open: summary?.open ?? 0,
      resolved: summary?.resolved ?? 0,
      critical: summary?.critical ?? 0,
      high: summary?.high ?? 0,
      warning: summary?.warning ?? 0,
      info: summary?.info ?? 0,
    };
  }, [summary]);

  const openCritical = useMemo(() => {
    return items.filter(
      (item) => !item.resolved && item.severity === "critical"
    ).length;
  }, [items]);

  const riskLabel = useMemo(() => {
    if (stats.critical > 0) return { text: "ALTO", cls: "text-red-400" };
    if (stats.open > 5 || stats.high > 0) {
      return { text: "MÉDIO", cls: "text-yellow-400" };
    }
    return { text: "BAIXO", cls: "text-emerald-400" };
  }, [stats]);

  const typeStats = useMemo(() => countByType(summary), [summary]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-cyan-400">🚨 Incidentes</h2>
            <div className="text-sm text-zinc-500">
              Painel conectado ao LK AI Operator para monitorar, priorizar e resolver falhas.
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto refresh
            </label>

            <button
              onClick={() => load(undefined, true)}
              className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300"
            >
              Atualizar
            </button>

            <button
              onClick={runOperatorNow}
              disabled={runningOperator}
              className="rounded-xl border border-red-700 px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
            >
              {runningOperator ? "Executando..." : "Executar operador"}
            </button>
          </div>
        </div>

        {feedback ? (
          <div className="rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
            {feedback}
          </div>
        ) : null}

        {executive ? (
          <div className={`rounded-xl border px-3 py-3 text-sm ${executiveClass(executive.health)}`}>
            <b>Visão do operador:</b> {executive.message}
          </div>
        ) : null}

        {openCritical > 0 ? (
          <div className="rounded-xl border border-red-800 bg-red-500/10 px-3 py-3 text-sm text-red-300">
            Existem <b>{openCritical}</b> incidente(s) crítico(s) abertos. O assistente do site deve
            priorizar recovery, validação e fallback antes de tarefas secundárias.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-xs text-zinc-500">Total</div>
            <div className="text-xl font-bold text-zinc-100">{stats.total}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-xs text-zinc-500">Abertos</div>
            <div className="text-xl font-bold text-yellow-300">{stats.open}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-xs text-zinc-500">Resolvidos</div>
            <div className="text-xl font-bold text-emerald-300">{stats.resolved}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-xs text-zinc-500">Críticos</div>
            <div className="text-xl font-bold text-red-300">{stats.critical}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-xs text-zinc-500">High</div>
            <div className="text-xl font-bold text-orange-300">{stats.high}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-xs text-zinc-500">Warning</div>
            <div className="text-xl font-bold text-yellow-200">{stats.warning}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-xs text-zinc-500">Info</div>
            <div className="text-xl font-bold text-cyan-300">{stats.info}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3 text-sm">
            <div className="text-xs text-zinc-500">Risco operacional</div>
            <div className={`text-xl font-bold ${riskLabel.cls}`}>{riskLabel.text}</div>
          </div>
        </div>

        {typeStats.length > 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="mb-2 text-xs text-zinc-500">Distribuição por tipo</div>
            <div className="flex flex-wrap gap-2">
              {typeStats.map((item) => (
                <span
                  key={item.key}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-2 py-1 text-xs text-zinc-300"
                >
                  {item.label}: <b>{item.value}</b>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por título, tipo, resolução, erro ou meta..."
            className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none focus:border-cyan-400"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none focus:border-cyan-400"
          >
            <option value="all">Todos status</option>
            <option value="open">Abertos</option>
            <option value="resolved">Resolvidos</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none focus:border-cyan-400"
          >
            <option value="all">Todas severidades</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none focus:border-cyan-400"
          >
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type === "all" ? "Todos tipos" : type}
              </option>
            ))}
          </select>

          <select
            value={String(pageSize)}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none focus:border-cyan-400"
          >
            <option value="10">10 / página</option>
            <option value="20">20 / página</option>
            <option value="30">30 / página</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4 text-zinc-400">
          Carregando incidentes...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-4 text-zinc-500">
          Nenhum incidente encontrado.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-zinc-800 bg-black/20 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold text-zinc-200">
                      {compactText(item.title, 240)}
                    </div>

                    <div className="text-xs text-zinc-500">
                      Criado em: {formatDate(item.createdAt)} • {relativeTime(item.createdAt)}
                    </div>

                    {item.updatedAt ? (
                      <div className="text-xs text-zinc-600">
                        Atualizado em: {formatDate(item.updatedAt)}
                      </div>
                    ) : null}

                    {item.resolvedAt ? (
                      <div className="text-xs text-zinc-500">
                        Resolvido em: {formatDate(item.resolvedAt)}
                      </div>
                    ) : null}

                    {item.reopenedAt ? (
                      <div className="text-xs text-zinc-500">
                        Reaberto em: {formatDate(item.reopenedAt)}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${severityClass(
                        item.severity
                      )}`}
                    >
                      {item.severity || "info"}
                    </span>

                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(
                        item.resolved
                      )}`}
                    >
                      {item.resolved ? "resolvido" : "aberto"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1">
                    tipo: {typeLabel(item.type)}
                  </span>

                  {metaPreview(item.meta) ? (
                    <span className="rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-1">
                      {metaPreview(item.meta)}
                    </span>
                  ) : null}

                  {item.lastError ? (
                    <span className="rounded-lg border border-red-900 bg-red-500/5 px-2 py-1 text-red-300">
                      erro: {compactText(item.lastError, 80)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 rounded-xl border border-cyan-900 bg-cyan-500/5 p-3 text-sm text-cyan-200">
                  <b>Leitura do assistente:</b> {aiHint(item)}
                </div>

                {item.resolutionNote ? (
                  <div className="mt-3 rounded-xl border border-emerald-800 bg-emerald-500/5 p-3 text-sm text-emerald-300">
                    <b>Nota:</b> {item.resolutionNote}
                  </div>
                ) : null}

                {item.meta ? (
                  <pre className="mt-3 max-h-44 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs text-zinc-500 whitespace-pre-wrap break-words">
                    {JSON.stringify(item.meta, null, 2)}
                  </pre>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  {!item.resolved ? (
                    <button
                      onClick={() =>
                        updateIncident(
                          "resolve",
                          item.id,
                          "Resolvido manualmente no painel."
                        )
                      }
                      disabled={mutating === item.id}
                      className="rounded-xl border border-emerald-700 px-3 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10 disabled:opacity-50"
                    >
                      {mutating === item.id ? "Salvando..." : "Resolver"}
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        updateIncident(
                          "reopen",
                          item.id,
                          "Reaberto para nova revisão."
                        )
                      }
                      disabled={mutating === item.id}
                      className="rounded-xl border border-yellow-700 px-3 py-2 text-sm text-yellow-300 transition hover:bg-yellow-500/10 disabled:opacity-50"
                    >
                      {mutating === item.id ? "Salvando..." : "Reabrir"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-zinc-500">
              Página {pagination?.page || 1} de {pagination?.totalPages || 1} •{" "}
              {pagination?.total || items.length} incidente(s)
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (pagination?.hasPrevPage) {
                    const nextPage = (pagination?.page || 1) - 1;
                    setPage(nextPage);
                    load(nextPage, true);
                  }
                }}
                disabled={!pagination?.hasPrevPage}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-40"
              >
                Anterior
              </button>

              <button
                onClick={() => {
                  if (pagination?.hasNextPage) {
                    const nextPage = (pagination?.page || 1) + 1;
                    setPage(nextPage);
                    load(nextPage, true);
                  }
                }}
                disabled={!pagination?.hasNextPage}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}