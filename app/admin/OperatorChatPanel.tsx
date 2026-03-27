"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: any;
  meta?: {
    highlights?: string[];
    warnings?: string[];
    recommendations?: string[];
    health?: string;
  };
};

type ChatResponse = {
  ok: boolean;
  messages?: ChatMessage[];
  reply?: {
    answer: string;
    highlights?: string[];
    warnings?: string[];
    recommendations?: string[];
  };
  status?: any;
  center?: any;
  queue?: any;
  queuePreview?: any[];
  commentsAi?: any;
  incidents?: any[];
  reports?: any[];
  actions?: any[];
  error?: string;
};

type Props = {
  compact?: boolean;
};

function formatDate(v: any) {
  if (!v) return "agora";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "agora" : d.toLocaleString("pt-BR");
}

function roleStyle(role: string) {
  if (role === "assistant") {
    return "border-cyan-800 bg-cyan-500/10 text-cyan-50";
  }
  if (role === "system") {
    return "border-amber-800 bg-amber-500/10 text-amber-50";
  }
  return "border-zinc-700 bg-zinc-900 text-zinc-100";
}

function roleLabel(role: string) {
  if (role === "assistant") return "Operator";
  if (role === "system") return "Sistema";
  return "Você";
}

function healthBadge(health?: string) {
  if (health === "healthy") {
    return "border-emerald-700 bg-emerald-500/10 text-emerald-300";
  }
  if (health === "critical") {
    return "border-red-700 bg-red-500/10 text-red-300";
  }
  return "border-yellow-700 bg-yellow-500/10 text-yellow-300";
}

export default function OperatorChatPanel({ compact = false }: Props) {
  const { user } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [status, setStatus] = useState<any>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const quickPrompts = useMemo(
    () => [
      "Como está a saúde do site?",
      "A automação de descoberta/importação está 100%?",
      "Quais são as prioridades agora?",
      "Como está a fila do operador?",
      "Quais fontes estão mais fortes?",
      "Existem capítulos quebrados?",
      "Como estão os comentários pendentes da IA?",
      "Existem bugs reportados pela comunidade?",
      "Quais incidentes estão mais críticos?",
      "O que devo corrigir primeiro hoje?",
    ],
    []
  );

  const quickActions = useMemo(
    () => [
      { key: "run-operator", label: "Executar operador" },
      { key: "run-recovery", label: "Executar recovery" },
      { key: "refresh-queue", label: "Atualizar fila" },
      { key: "generate-report", label: "Gerar relatório" },
      { key: "clear", label: "Limpar histórico" },
    ],
    []
  );

  function scrollToBottom(force = false) {
    requestAnimationFrame(() => {
      if (!listRef.current) return;

      const element = listRef.current;
      const nearBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight < 180;

      if (force || nearBottom) {
        element.scrollTop = element.scrollHeight;
      }
    });
  }

  async function loadMessages(showLoader = true) {
    if (!user?.uid) return;

    if (showLoader) {
      setLoading(true);
    }

    try {
      const res = await fetch("/api/admin/operator/chat?limit=60", {
        headers: {
          "x-user-id": user.uid,
        },
        cache: "no-store",
      });

      const json: ChatResponse = await res.json();

      if (json?.ok) {
        setMessages(Array.isArray(json.messages) ? json.messages : []);
        setStatus(json.status || null);
        setFeedback("");
      } else {
        setFeedback(json?.error || "Erro ao carregar chat.");
      }
    } catch (error) {
      console.error(error);
      setFeedback("Erro ao carregar chat.");
    } finally {
      if (showLoader) {
        setLoading(false);
      }
      scrollToBottom();
    }
  }

  async function sendRequest(payload: Record<string, unknown>) {
    if (!user?.uid) return;

    setSending(true);
    setFeedback("");

    try {
      const res = await fetch("/api/admin/operator/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify(payload),
      });

      const json: ChatResponse = await res.json();

      if (!json?.ok) {
        setFeedback(json?.error || "Erro ao conversar com o operador.");
        return;
      }

      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setStatus(json.status || null);
      setFeedback("");
      scrollToBottom(true);
    } catch (error) {
      console.error(error);
      setFeedback("Erro ao conversar com o operador.");
    } finally {
      setSending(false);
    }
  }

  async function sendMessage(customMessage?: string) {
    const message = (customMessage ?? input).trim();
    if (!message) return;

    if (!customMessage) {
      setInput("");
    }

    await sendRequest({ message });
  }

  async function runAction(action: string) {
    await sendRequest({ action });
  }

  useEffect(() => {
    loadMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  useEffect(() => {
    if (!autoRefresh || !user?.uid) return;

    const timer = setInterval(() => {
      loadMessages(false);
    }, 25000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, user?.uid]);

  const summaryCards = useMemo(() => {
    const metrics = status?.metrics || {};
    const queue = status?.queue || {};
    const commentsAi = status?.commentsAi || {};
    const health = status?.health || "warning";

    return [
      {
        label: "Saúde",
        value:
          health === "healthy"
            ? "Saudável"
            : health === "critical"
            ? "Crítica"
            : "Atenção",
        className: healthBadge(health),
      },
      {
        label: "Mangás",
        value: String(metrics.totalMangas ?? 0),
        className: "border-zinc-700 bg-zinc-900 text-zinc-200",
      },
      {
        label: "Capítulos",
        value: String(metrics.totalChapters ?? 0),
        className: "border-zinc-700 bg-zinc-900 text-zinc-200",
      },
      {
        label: "Fila",
        value: String(queue.total ?? 0),
        className: "border-zinc-700 bg-zinc-900 text-zinc-200",
      },
      {
        label: "Pendências IA",
        value: String(
          commentsAi.pending ??
            commentsAi.totalPending ??
            commentsAi.open ??
            0
        ),
        className: "border-zinc-700 bg-zinc-900 text-zinc-200",
      },
    ];
  }, [status]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 backdrop-blur space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className={`${compact ? "text-base" : "text-lg"} font-bold text-cyan-400`}>
            🗨️ Operator Chat Panel
          </h2>
          <p className="text-sm text-zinc-500">
            Converse com a IA operacional usando saúde do site, fila,
            automação, comentários, incidentes, relatórios e estado real do
            LK-SCAN.
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
            onClick={() => loadMessages(true)}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300"
          >
            Atualizar
          </button>
        </div>
      </div>

      {status ? (
        <div className={`grid gap-3 ${compact ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-5"}`}>
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-2xl border px-4 py-3 ${card.className}`}
            >
              <div className="text-xs uppercase tracking-wide opacity-70">
                {card.label}
              </div>
              <div className="mt-2 text-lg font-extrabold">
                {card.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {feedback}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => sendMessage(prompt)}
            disabled={sending}
            className="rounded-full border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      {!compact ? (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action.key}
              onClick={() => runAction(action.key)}
              disabled={sending}
              className="rounded-xl border border-amber-700 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        ref={listRef}
        className={`overflow-y-auto rounded-2xl border border-zinc-800 bg-black/20 p-3 space-y-3 ${
          compact ? "max-h-[360px] min-h-[220px]" : "max-h-[560px] min-h-[300px]"
        }`}
      >
        {loading ? (
          <div className="text-zinc-400">Carregando conversa...</div>
        ) : messages.length === 0 ? (
          <div className="text-zinc-500">
            Nenhuma mensagem ainda. Pergunte algo para o LK AI Operator.
          </div>
        ) : (
          messages.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl border p-3 ${roleStyle(item.role)}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs opacity-80">
                <span className="font-semibold uppercase">
                  {roleLabel(item.role)}
                </span>
                <span>{formatDate(item.createdAt)}</span>
              </div>

              <div className="mt-2 whitespace-pre-wrap text-sm leading-6">
                {item.content}
              </div>

              {item.role === "assistant" && item.meta ? (
                <div
                  className={`mt-3 grid gap-3 ${
                    compact ? "grid-cols-1" : "xl:grid-cols-3"
                  }`}
                >
                  {Array.isArray(item.meta.highlights) &&
                  item.meta.highlights.length > 0 ? (
                    <div className="rounded-xl border border-cyan-900 bg-cyan-500/5 p-3">
                      <div className="mb-2 text-xs font-bold text-cyan-300">
                        Highlights
                      </div>
                      <div className="space-y-2 text-xs text-zinc-200">
                        {item.meta.highlights.map((line, index) => (
                          <div key={index}>• {line}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {Array.isArray(item.meta.warnings) &&
                  item.meta.warnings.length > 0 ? (
                    <div className="rounded-xl border border-yellow-900 bg-yellow-500/5 p-3">
                      <div className="mb-2 text-xs font-bold text-yellow-300">
                        Warnings
                      </div>
                      <div className="space-y-2 text-xs text-zinc-200">
                        {item.meta.warnings.map((line, index) => (
                          <div key={index}>• {line}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {Array.isArray(item.meta.recommendations) &&
                  item.meta.recommendations.length > 0 ? (
                    <div className="rounded-xl border border-emerald-900 bg-emerald-500/5 p-3">
                      <div className="mb-2 text-xs font-bold text-emerald-300">
                        Recomendações
                      </div>
                      <div className="space-y-2 text-xs text-zinc-200">
                        {item.meta.recommendations.map((line, index) => (
                          <div key={index}>• {line}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte sobre saúde do site, fila, incidentes, fontes, comentários, automação, capítulos quebrados..."
          className={`rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 outline-none focus:border-cyan-400 ${
            compact ? "min-h-[90px]" : "min-h-[120px]"
          }`}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void sendMessage();
            }
          }}
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-zinc-500">
            Dica: use <span className="text-cyan-400">Ctrl + Enter</span> para enviar mais rápido.
          </div>

          <div className="flex justify-end gap-2">
            {compact ? (
              <button
                onClick={() => runAction("clear")}
                disabled={sending}
                className="rounded-xl border border-red-700 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                Limpar
              </button>
            ) : null}

            <button
              onClick={() => sendMessage()}
              disabled={sending || !input.trim()}
              className="rounded-xl bg-cyan-500 px-5 py-3 font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50"
            >
              {sending ? "Enviando..." : compact ? "Enviar" : "Enviar para o Operator"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}