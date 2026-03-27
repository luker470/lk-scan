"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type CommentItem = {
  id: string;
  path: string;
  text: string;
  authorName?: string;
  mangaTitle?: string;
  mangaId?: string;
  chapterId?: string;
  aiResponded?: boolean;
  aiResponse?: string;
  aiClassification?: string;
  aiPriority?: number;
  aiSentiment?: "positive" | "neutral" | "negative";
  needsReview?: boolean;
  moderationStatus?: string;
  createdAt?: any;
};

type Stats = {
  total: number;
  pending: number;
  review: number;
  bug: number;
  question: number;
  request: number;
  praise: number;
  toxic: number;
  spoiler: number;
};

type ApiResponse = {
  ok: boolean;
  items?: CommentItem[];
  stats?: Stats;
  total?: number;
  success?: number;
  skipped?: number;
  error?: string;
};

function badgeClass(type?: string) {
  switch (type) {
    case "bug":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    case "question":
      return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
    case "request":
      return "border-purple-500/20 bg-purple-500/10 text-purple-300";
    case "praise":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "toxic":
      return "border-red-700 bg-red-500/20 text-red-200";
    case "spoiler":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
    default:
      return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
  }
}

function sentimentClass(type?: string) {
  switch (type) {
    case "positive":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "negative":
      return "border-red-500/20 bg-red-500/10 text-red-300";
    default:
      return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
  }
}

function toDate(v: any) {
  if (!v) return null;
  if (v instanceof Date) return v;
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

function aiReading(item: CommentItem) {
  switch (item.aiClassification) {
    case "bug":
      return "Esse comentário deve virar sinal operacional: validar capítulo/mangá, revisar reader e observar reincidência.";
    case "question":
      return "Esse comentário é candidato para resposta automática do assistente e redução de suporte manual.";
    case "request":
      return "Esse comentário deve influenciar discovery, catálogo e prioridade de importação.";
    case "praise":
      return "Esse comentário ajuda a medir satisfação da comunidade e aceitação da obra.";
    case "toxic":
      return "Esse comentário precisa de revisão de moderação e possível ocultação.";
    case "spoiler":
      return "Esse comentário precisa de revisão antes de permanecer visível para outros leitores.";
    default:
      return "Comentário útil para leitura de sentimento e contexto da comunidade.";
  }
}

function smallPath(path: string) {
  if (!path) return "";
  if (path.length <= 80) return path;
  return `${path.slice(0, 28)} ... ${path.slice(-42)}`;
}

const EMPTY_STATS: Stats = {
  total: 0,
  pending: 0,
  review: 0,
  bug: 0,
  question: 0,
  request: 0,
  praise: 0,
  toxic: 0,
  spoiler: 0,
};

export default function AICommentCenter() {
  const { user } = useAuth();

  const [items, setItems] = useState<CommentItem[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);

  const [loading, setLoading] = useState(true);
  const [processingPath, setProcessingPath] = useState("");
  const [processingAll, setProcessingAll] = useState(false);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [feedback, setFeedback] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  async function loadComments(showLoader = true) {
    if (!user?.uid) return;
    if (showLoader) setLoading(true);
    setFeedback("");

    try {
      const params = new URLSearchParams();
      params.set("limit", "120");
      if (filter !== "all") params.set("filter", filter);
      if (query.trim()) params.set("search", query.trim());

      const res = await fetch(`/api/admin/operator/comments?${params.toString()}`, {
        headers: {
          "x-user-id": user.uid,
        },
        cache: "no-store",
      });

      const json: ApiResponse = await res.json();

      if (json?.ok) {
        setItems(Array.isArray(json.items) ? json.items : []);
        setStats(json.stats || EMPTY_STATS);
      } else {
        setItems([]);
        setStats(EMPTY_STATS);
        setFeedback(json?.error || "Erro ao carregar comentários.");
      }
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao carregar comentários.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function analyzeSingle(path: string, force = false) {
    if (!user?.uid) return;
    setProcessingPath(path);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({ path, force }),
      });

      const json = await res.json().catch(() => null);

      if (!json?.ok) {
        setFeedback(json?.error || "Não foi possível analisar o comentário.");
      } else if (json?.skipped) {
        setFeedback("Comentário já analisado anteriormente.");
      } else {
        setFeedback("Comentário analisado com sucesso.");
      }

      await loadComments(false);
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao analisar comentário.");
    } finally {
      setProcessingPath("");
    }
  }

  async function analyzePendingBatch(force = false) {
    if (!user?.uid) return;

    setProcessingAll(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({
          action: "analyze-batch",
          limit: 15,
          filter: force ? "" : "pending",
          force,
        }),
      });

      const json: ApiResponse = await res.json();

      if (!json?.ok) {
        setFeedback(json?.error || "Erro ao processar lote.");
      } else {
        setFeedback(
          `Lote concluído: ${json.total || 0} item(ns), ${json.success || 0} sucesso(s), ${json.skipped || 0} ignorado(s).`
        );
      }

      await loadComments(false);
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao processar lote de comentários.");
    } finally {
      setProcessingAll(false);
    }
  }

  useEffect(() => {
    loadComments(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, filter]);

  useEffect(() => {
    if (!autoRefresh || !user?.uid) return;
    const timer = setInterval(() => {
      loadComments(false);
    }, 30000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, user?.uid, filter, query]);

  useEffect(() => {
    setPage(1);
  }, [query, filter, pageSize]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...items]
      .filter((item) => {
        if (!q) return true;

        const haystack = [
          item.text,
          item.authorName,
          item.path,
          item.mangaTitle,
          item.mangaId,
          item.chapterId,
          item.aiClassification,
          item.aiResponse,
          item.aiSentiment,
          item.moderationStatus,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(q);
      })
      .sort((a, b) => {
        const ad = toDate(a.createdAt)?.getTime() || 0;
        const bd = toDate(b.createdAt)?.getTime() || 0;
        return bd - ad;
      });
  }, [items, query]);

  const pagination = useMemo(() => {
    const total = filteredItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const pageItems = filteredItems.slice(start, start + pageSize);

    return {
      total,
      totalPages,
      page: safePage,
      pageItems,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
    };
  }, [filteredItems, page, pageSize]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-cyan-400">💬 AI Comment Center</h2>
          <p className="text-sm text-zinc-400">
            Centro de leitura, classificação, resposta sugerida, revisão e sinal operacional dos comentários.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto refresh
          </label>

          <button
            onClick={() => loadComments(true)}
            className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            Atualizar
          </button>

          <button
            onClick={() => analyzePendingBatch(false)}
            disabled={processingAll}
            className="px-4 py-2 rounded-xl border border-cyan-700 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition disabled:opacity-50"
          >
            {processingAll ? "Processando..." : "Analisar pendentes"}
          </button>

          <button
            onClick={() => analyzePendingBatch(true)}
            disabled={processingAll}
            className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition disabled:opacity-50"
          >
            {processingAll ? "Reprocessando..." : "Reprocessar lote"}
          </button>
        </div>
      </div>

      {feedback ? (
        <div className="rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {feedback}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-9">
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Total</div>
          <div className="text-xl font-bold text-zinc-100">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Pendentes</div>
          <div className="text-xl font-bold text-yellow-300">{stats.pending}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Revisão</div>
          <div className="text-xl font-bold text-orange-300">{stats.review}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Bugs</div>
          <div className="text-xl font-bold text-red-300">{stats.bug}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Dúvidas</div>
          <div className="text-xl font-bold text-cyan-300">{stats.question}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Pedidos</div>
          <div className="text-xl font-bold text-purple-300">{stats.request}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Elogios</div>
          <div className="text-xl font-bold text-emerald-300">{stats.praise}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Tóxicos</div>
          <div className="text-xl font-bold text-rose-300">{stats.toxic}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Spoiler</div>
          <div className="text-xl font-bold text-yellow-200">{stats.spoiler}</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por texto, autor, obra, classificação, resposta da IA..."
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm outline-none focus:border-cyan-400"
        />

        <div className="flex flex-wrap gap-2">
          {[
            ["all", "Todos"],
            ["pending", "Pendentes"],
            ["review", "Revisão"],
            ["bug", "Bugs"],
            ["question", "Dúvidas"],
            ["request", "Pedidos"],
            ["praise", "Elogios"],
            ["toxic", "Tóxicos"],
            ["spoiler", "Spoiler"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-3 py-2 rounded-xl border text-sm transition ${
                filter === value
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                  : "border-zinc-700 text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={String(pageSize)}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-3 text-sm text-zinc-200 outline-none"
        >
          <option value="10">10 / página</option>
          <option value="20">20 / página</option>
          <option value="30">30 / página</option>
        </select>
      </div>

      {loading ? (
        <div className="text-zinc-400">Carregando comentários...</div>
      ) : pagination.pageItems.length === 0 ? (
        <div className="text-zinc-500">Nenhum comentário encontrado.</div>
      ) : (
        <>
          <div className="space-y-4">
            {pagination.pageItems.map((item) => (
              <div
                key={item.path}
                className="rounded-xl border border-zinc-800 bg-black/20 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 space-y-1">
                    <div className="font-semibold text-zinc-200">
                      {item.authorName || "Usuário"}
                    </div>

                    <div className="text-xs text-zinc-500">
                      {item.mangaTitle ? (
                        <span className="text-cyan-300">{item.mangaTitle}</span>
                      ) : (
                        <span>Sem obra</span>
                      )}
                      {item.chapterId ? (
                        <span> • capítulo {item.chapterId}</span>
                      ) : null}
                    </div>

                    <div className="text-xs text-zinc-600 break-all">
                      {smallPath(item.path)}
                    </div>

                    <div className="text-xs text-zinc-600">
                      {formatDate(item.createdAt)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    {item.aiClassification ? (
                      <span
                        className={`px-2 py-1 rounded-full border text-xs font-semibold ${badgeClass(
                          item.aiClassification
                        )}`}
                      >
                        {item.aiClassification}
                      </span>
                    ) : null}

                    {item.aiSentiment ? (
                      <span
                        className={`px-2 py-1 rounded-full border text-xs font-semibold ${sentimentClass(
                          item.aiSentiment
                        )}`}
                      >
                        {item.aiSentiment}
                      </span>
                    ) : null}

                    {item.needsReview ? (
                      <span className="px-2 py-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 text-yellow-300 text-xs font-semibold">
                        revisão necessária
                      </span>
                    ) : null}

                    {item.aiResponded ? (
                      <span className="px-2 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-semibold">
                        analisado
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full border border-zinc-700 text-zinc-400 text-xs font-semibold">
                        pendente
                      </span>
                    )}

                    {typeof item.aiPriority === "number" && item.aiPriority > 0 ? (
                      <span className="px-2 py-1 rounded-full border border-zinc-700 text-zinc-300 text-xs font-semibold">
                        prioridade {item.aiPriority}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-zinc-300 whitespace-pre-wrap">
                  {item.text || "Comentário vazio"}
                </div>

                <div className="rounded-xl border border-cyan-900 bg-cyan-500/5 p-3">
                  <div className="text-xs text-cyan-300 mb-1">Leitura do assistente</div>
                  <div className="text-sm text-zinc-200">{aiReading(item)}</div>
                </div>

                {item.aiResponse ? (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                    <div className="text-xs text-cyan-300 mb-1">
                      Resposta sugerida pela IA
                    </div>
                    <div className="text-sm text-zinc-200 whitespace-pre-wrap">
                      {item.aiResponse}
                    </div>
                  </div>
                ) : null}

                {item.moderationStatus ? (
                  <div className="text-xs text-zinc-500">
                    moderação:{" "}
                    <span className="text-zinc-300">{item.moderationStatus}</span>
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 flex-wrap">
                  <button
                    onClick={() => analyzeSingle(item.path, false)}
                    disabled={processingPath === item.path || processingAll}
                    className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition disabled:opacity-50"
                  >
                    {processingPath === item.path ? "Analisando..." : "Analisar"}
                  </button>

                  <button
                    onClick={() => analyzeSingle(item.path, true)}
                    disabled={processingPath === item.path || processingAll}
                    className="px-4 py-2 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {processingPath === item.path ? "Reprocessando..." : "Reprocessar IA"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="text-sm text-zinc-500">
              Página {pagination.page} de {pagination.totalPages} • {pagination.total} item(ns)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrev}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasNext}
                className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40"
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