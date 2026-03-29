"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type ProposalStatus = "pending" | "approved" | "rejected" | "applied" | "archived";

type ProposalType =
  | "ui-change"
  | "layout-change"
  | "reader-change"
  | "new-page"
  | "branding-change"
  | "public-text-change"
  | "code-architecture-change"
  | "database-schema-change"
  | "content-strategy-change"
  | "seo-structure-change"
  | "navigation-change";

type ProposalItem = {
  id: string;
  type: ProposalType;
  title: string;
  description: string;
  rationale: string;
  impact: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  status: ProposalStatus;
  proposedBy: "lk-ai-operator";
  requiresExplicitUserApproval: boolean;
  relatedFiles: string[];
  generatedText?: string;
  generatedImagePrompt?: string;
  meta?: Record<string, any>;
  createdAt?: string;
  updatedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  appliedAt?: string;
  rejectedReason?: string;
};

type ProposalResponse = {
  ok: boolean;
  items?: ProposalItem[];
  summary?: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    applied: number;
  };
  policy?: {
    version: number;
    autoCount: number;
    approvalCount: number;
    autoActions: string[];
    approvalActions: string[];
  };
  error?: string;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value?: string) {
  if (!value) return "Sem data";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("pt-BR");
}

function compactText(value: unknown, max = 180) {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function statusClass(status?: ProposalStatus) {
  switch (status) {
    case "approved":
      return "border-emerald-700 bg-emerald-500/10 text-emerald-300";
    case "rejected":
      return "border-red-700 bg-red-500/10 text-red-300";
    case "applied":
      return "border-cyan-700 bg-cyan-500/10 text-cyan-300";
    case "archived":
      return "border-zinc-700 bg-zinc-800/80 text-zinc-400";
    default:
      return "border-yellow-700 bg-yellow-500/10 text-yellow-300";
  }
}

function impactClass(value?: string) {
  if (value === "high") return "text-red-300";
  if (value === "medium") return "text-yellow-300";
  return "text-emerald-300";
}

function riskClass(value?: string) {
  if (value === "high") return "text-red-300";
  if (value === "medium") return "text-yellow-300";
  return "text-emerald-300";
}

function typeLabel(type?: ProposalType) {
  switch (type) {
    case "ui-change":
      return "Mudança de UI";
    case "layout-change":
      return "Mudança de layout";
    case "reader-change":
      return "Mudança no reader";
    case "new-page":
      return "Nova página";
    case "branding-change":
      return "Mudança de marca";
    case "public-text-change":
      return "Texto público";
    case "code-architecture-change":
      return "Arquitetura";
    case "database-schema-change":
      return "Banco de dados";
    case "content-strategy-change":
      return "Estratégia de conteúdo";
    case "seo-structure-change":
      return "SEO / estrutura";
    case "navigation-change":
      return "Navegação";
    default:
      return type || "Tipo";
  }
}

const DEFAULT_FORM = {
  type: "ui-change" as ProposalType,
  title: "",
  description: "",
  rationale: "",
  impact: "medium" as "low" | "medium" | "high",
  risk: "medium" as "low" | "medium" | "high",
  relatedFiles: "",
  generatedText: "",
  generatedImagePrompt: "",
};

export default function OperatorIdeasStudio() {
  const { user } = useAuth();

  const [items, setItems] = useState<ProposalItem[]>([]);
  const [expandedId, setExpandedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const [filterStatus, setFilterStatus] = useState<ProposalStatus | "all">("all");
  const [filterType, setFilterType] = useState<ProposalType | "all">("all");
  const [search, setSearch] = useState("");
  const [policy, setPolicy] = useState<ProposalResponse["policy"]>();

  const [form, setForm] = useState(DEFAULT_FORM);

  async function loadIdeas(showLoader = true) {
    if (!user?.uid) return;
    if (showLoader) setLoading(true);
    setFeedback("");

    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterType !== "all") params.set("type", filterType);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/operator/proposals?${params.toString()}`, {
        headers: {
          "x-user-id": user.uid,
        },
        cache: "no-store",
      });

      const json: ProposalResponse = await res.json();

      if (!json?.ok) {
        setItems([]);
        setFeedback(json?.error || "Erro ao carregar propostas.");
        return;
      }

      const nextItems = Array.isArray(json.items) ? json.items : [];
      setItems(nextItems);
      setPolicy(json.policy);

      if (!expandedId && nextItems.length > 0) {
        setExpandedId(nextItems[0].id);
      }
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao carregar propostas.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function createIdea() {
    if (!user?.uid) return;

    const title = normalizeText(form.title);
    const description = normalizeText(form.description);
    const rationale = normalizeText(form.rationale);

    if (!title || !description || !rationale) {
      setFeedback("Preencha título, descrição e rationale.");
      return;
    }

    setCreating(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          type: form.type,
          title,
          description,
          rationale,
          impact: form.impact,
          risk: form.risk,
          relatedFiles: form.relatedFiles
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean),
          generatedText: form.generatedText,
          generatedImagePrompt: form.generatedImagePrompt,
          meta: {
            origin: "operator-ideas-studio",
          },
        }),
      });

      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        setFeedback(json?.error || "Erro ao criar proposta.");
        return;
      }

      setFeedback("Proposta criada com sucesso.");
      setForm(DEFAULT_FORM);
      await loadIdeas(false);

      if (json?.id) {
        setExpandedId(json.id);
      }
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao criar proposta.");
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(
    id: string,
    status: ProposalStatus,
    rejectedReason = ""
  ) {
    if (!user?.uid) return;

    setUpdatingId(id);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/proposals", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          id,
          status,
          rejectedReason,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        setFeedback(json?.error || "Erro ao atualizar proposta.");
        return;
      }

      setFeedback(`Proposta atualizada para ${status}.`);
      await loadIdeas(false);
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao atualizar proposta.");
    } finally {
      setUpdatingId("");
    }
  }

  useEffect(() => {
    loadIdeas(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, filterStatus, filterType]);

  useEffect(() => {
    if (!autoRefresh || !user?.uid) return;
    const timer = setInterval(() => {
      loadIdeas(false);
    }, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, user?.uid, filterStatus, filterType, search]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((item) => {
      if (!q) return true;

      return [
        item.title,
        item.description,
        item.rationale,
        item.generatedText,
        item.generatedImagePrompt,
        item.type,
        item.status,
        ...(Array.isArray(item.relatedFiles) ? item.relatedFiles : []),
        JSON.stringify(item.meta || {}),
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [items, search]);

  const current = useMemo(
    () => filteredItems.find((item) => item.id === expandedId) || filteredItems[0] || null,
    [filteredItems, expandedId]
  );

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-bold text-cyan-400">💡 Operator Ideas Studio</h2>
          <p className="text-sm text-zinc-400">
            Estúdio de propostas da IA para melhorias visuais, estruturais, funcionais e estratégicas.
          </p>
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
            onClick={() => loadIdeas(true)}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300"
          >
            Atualizar
          </button>
        </div>
      </div>

      {feedback ? (
        <div className="rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {feedback}
        </div>
      ) : null}

      {policy ? (
        <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
          <div className="text-sm font-bold text-cyan-300">Política da IA</div>
          <div className="mt-2 grid gap-3 md:grid-cols-2 text-sm">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-zinc-300">
              <div className="text-xs text-zinc-500">Ações automáticas permitidas</div>
              <div className="mt-1 font-semibold">{policy.autoCount}</div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-zinc-300">
              <div className="text-xs text-zinc-500">Tipos que exigem aprovação</div>
              <div className="mt-1 font-semibold">{policy.approvalCount}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4 space-y-4">
            <div className="text-sm font-bold text-cyan-300">Nova proposta da IA</div>

            <div className="grid gap-3">
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    type: e.target.value as ProposalType,
                  }))
                }
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              >
                <option value="ui-change">Mudança de UI</option>
                <option value="layout-change">Mudança de layout</option>
                <option value="reader-change">Mudança no reader</option>
                <option value="new-page">Nova página</option>
                <option value="branding-change">Mudança de marca</option>
                <option value="public-text-change">Texto público</option>
                <option value="code-architecture-change">Arquitetura</option>
                <option value="database-schema-change">Banco de dados</option>
                <option value="content-strategy-change">Estratégia de conteúdo</option>
                <option value="seo-structure-change">SEO / estrutura</option>
                <option value="navigation-change">Navegação</option>
              </select>

              <input
                value={form.title}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Título da proposta"
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              />

              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Descrição da melhoria"
                rows={4}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              />

              <textarea
                value={form.rationale}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, rationale: e.target.value }))
                }
                placeholder="Rationale: por que essa melhoria faz sentido"
                rows={4}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={form.impact}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      impact: e.target.value as "low" | "medium" | "high",
                    }))
                  }
                  className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
                >
                  <option value="low">Impacto baixo</option>
                  <option value="medium">Impacto médio</option>
                  <option value="high">Impacto alto</option>
                </select>

                <select
                  value={form.risk}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      risk: e.target.value as "low" | "medium" | "high",
                    }))
                  }
                  className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
                >
                  <option value="low">Risco baixo</option>
                  <option value="medium">Risco médio</option>
                  <option value="high">Risco alto</option>
                </select>
              </div>

              <textarea
                value={form.relatedFiles}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, relatedFiles: e.target.value }))
                }
                placeholder={"Arquivos afetados\nEx:\napp/admin/page.tsx\ncomponents/ReaderPro.tsx"}
                rows={5}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              />

              <textarea
                value={form.generatedText}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, generatedText: e.target.value }))
                }
                placeholder="Texto da IA explicando a ideia"
                rows={5}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              />

              <textarea
                value={form.generatedImagePrompt}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    generatedImagePrompt: e.target.value,
                  }))
                }
                placeholder="Prompt visual para mockup/imagem conceitual"
                rows={4}
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              />

              <button
                onClick={createIdea}
                disabled={creating}
                className="rounded-xl bg-cyan-500 px-4 py-3 font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {creating ? "Criando..." : "Criar proposta"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4 space-y-3">
            <div className="text-sm font-bold text-cyan-300">Filtros</div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proposta"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value as ProposalStatus | "all")
                }
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              >
                <option value="all">Todos status</option>
                <option value="pending">Pendente</option>
                <option value="approved">Aprovada</option>
                <option value="rejected">Rejeitada</option>
                <option value="applied">Aplicada</option>
                <option value="archived">Arquivada</option>
              </select>

              <select
                value={filterType}
                onChange={(e) =>
                  setFilterType(e.target.value as ProposalType | "all")
                }
                className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none"
              >
                <option value="all">Todos tipos</option>
                <option value="ui-change">UI</option>
                <option value="layout-change">Layout</option>
                <option value="reader-change">Reader</option>
                <option value="new-page">Nova página</option>
                <option value="branding-change">Marca</option>
                <option value="public-text-change">Texto público</option>
                <option value="code-architecture-change">Arquitetura</option>
                <option value="database-schema-change">Banco</option>
                <option value="content-strategy-change">Conteúdo</option>
                <option value="seo-structure-change">SEO</option>
                <option value="navigation-change">Navegação</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
          {loading ? (
            <div className="text-zinc-400">Carregando propostas...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-zinc-500">Nenhuma proposta encontrada.</div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
              <div className="space-y-3">
                {filteredItems.map((item) => {
                  const active = current?.id === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => setExpandedId(item.id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${
                        active
                          ? "border-cyan-500/40 bg-cyan-500/10"
                          : "border-zinc-800 bg-zinc-950/50 hover:border-cyan-500/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="line-clamp-2 font-semibold text-zinc-100">
                            {item.title}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {typeLabel(item.type)}
                          </div>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass(
                            item.status
                          )}`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <div className="mt-3 text-sm text-zinc-400">
                        {compactText(item.description, 110)}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        <span className={impactClass(item.impact)}>
                          impacto: {item.impact}
                        </span>
                        <span className={riskClass(item.risk)}>
                          risco: {item.risk}
                        </span>
                      </div>

                      <div className="mt-2 text-[11px] text-zinc-600">
                        {formatDate(item.updatedAt || item.createdAt)}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div>
                {!current ? null : (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-bold text-cyan-300">
                            {current.title}
                          </h3>
                          <div className="mt-1 text-sm text-zinc-500">
                            {typeLabel(current.type)} • criada em{" "}
                            {formatDate(current.createdAt)}
                          </div>
                        </div>

                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClass(
                            current.status
                          )}`}
                        >
                          {current.status}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                        <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                          <div className="text-xs text-zinc-500">Impacto</div>
                          <div className={`mt-1 font-semibold ${impactClass(current.impact)}`}>
                            {current.impact}
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                          <div className="text-xs text-zinc-500">Risco</div>
                          <div className={`mt-1 font-semibold ${riskClass(current.risk)}`}>
                            {current.risk}
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-800 bg-black/30 p-3">
                          <div className="text-xs text-zinc-500">Aprovação necessária</div>
                          <div className="mt-1 font-semibold text-zinc-200">
                            {current.requiresExplicitUserApproval ? "Sim" : "Não"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="text-sm font-bold text-cyan-300">Descrição</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                        {current.description}
                      </div>
                    </div>

                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                      <div className="text-sm font-bold text-cyan-300">Rationale</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                        {current.rationale}
                      </div>
                    </div>

                    {current.generatedText ? (
                      <div className="rounded-xl border border-emerald-900 bg-emerald-500/5 p-4">
                        <div className="text-sm font-bold text-emerald-300">
                          Texto gerado pela IA
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                          {current.generatedText}
                        </div>
                      </div>
                    ) : null}

                    {current.generatedImagePrompt ? (
                      <div className="rounded-xl border border-purple-900 bg-purple-500/5 p-4">
                        <div className="text-sm font-bold text-purple-300">
                          Prompt visual / mockup
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                          {current.generatedImagePrompt}
                        </div>
                      </div>
                    ) : null}

                    {Array.isArray(current.relatedFiles) && current.relatedFiles.length > 0 ? (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                        <div className="text-sm font-bold text-cyan-300">
                          Arquivos afetados
                        </div>
                        <div className="mt-3 space-y-2">
                          {current.relatedFiles.map((file, index) => (
                            <div
                              key={`${file}-${index}`}
                              className="rounded-lg border border-zinc-800 bg-black/20 px-3 py-2 text-sm text-zinc-300"
                            >
                              {file}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {current.meta ? (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                        <div className="text-sm font-bold text-zinc-300">Metadados</div>
                        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-500">
                          {JSON.stringify(current.meta, null, 2)}
                        </pre>
                      </div>
                    ) : null}

                    {current.rejectedReason ? (
                      <div className="rounded-xl border border-red-900 bg-red-500/5 p-4">
                        <div className="text-sm font-bold text-red-300">
                          Motivo da rejeição
                        </div>
                        <div className="mt-2 text-sm text-zinc-200">
                          {current.rejectedReason}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2">
                      {current.status !== "approved" && current.status !== "applied" ? (
                        <button
                          onClick={() => updateStatus(current.id, "approved")}
                          disabled={updatingId === current.id}
                          className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
                        >
                          {updatingId === current.id ? "Salvando..." : "Aprovar"}
                        </button>
                      ) : null}

                      {current.status !== "rejected" ? (
                        <button
                          onClick={() => {
                            const reason = prompt("Motivo da rejeição:");
                            updateStatus(current.id, "rejected", reason || "");
                          }}
                          disabled={updatingId === current.id}
                          className="rounded-xl border border-red-700 px-4 py-3 text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                        >
                          {updatingId === current.id ? "Salvando..." : "Rejeitar"}
                        </button>
                      ) : null}

                      {current.status === "approved" ? (
                        <button
                          onClick={() => updateStatus(current.id, "applied")}
                          disabled={updatingId === current.id}
                          className="rounded-xl border border-cyan-700 px-4 py-3 text-cyan-300 transition hover:bg-cyan-500/10 disabled:opacity-50"
                        >
                          {updatingId === current.id ? "Salvando..." : "Marcar como aplicada"}
                        </button>
                      ) : null}

                      {current.status !== "archived" ? (
                        <button
                          onClick={() => updateStatus(current.id, "archived")}
                          disabled={updatingId === current.id}
                          className="rounded-xl border border-zinc-700 px-4 py-3 text-zinc-300 transition hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {updatingId === current.id ? "Salvando..." : "Arquivar"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}