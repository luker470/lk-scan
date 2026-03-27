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
  error?: string;
};

function formatDate(v: any) {
  if (!v) return "agora";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "agora" : d.toLocaleTimeString("pt-BR");
}

function roleBubble(role: string) {
  if (role === "assistant") {
    return "mr-auto border-cyan-700 bg-cyan-500/10 text-cyan-100";
  }
  if (role === "system") {
    return "mx-auto border-amber-700 bg-amber-500/10 text-amber-100";
  }
  return "ml-auto border-zinc-700 bg-zinc-800 text-zinc-100";
}

function roleLabel(role: string) {
  if (role === "assistant") return "Operator";
  if (role === "system") return "Sistema";
  return "Você";
}

function healthDot(health?: string) {
  if (health === "healthy") return "bg-emerald-400";
  if (health === "critical") return "bg-red-400";
  return "bg-yellow-400";
}

export default function OperatorFloatingChat() {
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [status, setStatus] = useState<any>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  const quickPrompts = useMemo(
    () => [
      "Como está a saúde do site?",
      "Como está a fila do operador?",
      "Existem capítulos quebrados?",
      "Como estão os comentários pendentes da IA?",
      "Quais são as prioridades agora?",
      "Quais fontes estão mais fortes?",
    ],
    []
  );

  const quickActions = useMemo(
    () => [
      { key: "run-operator", label: "Rodar operador" },
      { key: "run-recovery", label: "Recovery" },
      { key: "refresh-queue", label: "Fila" },
      { key: "clear", label: "Limpar" },
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
      const res = await fetch("/api/admin/operator/chat?limit=24", {
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
        setFeedback(json?.error || "Erro ao enviar.");
        return;
      }

      setMessages(Array.isArray(json.messages) ? json.messages : []);
      setStatus(json.status || null);
      setFeedback("");
      scrollToBottom(true);
    } catch (error) {
      console.error(error);
      setFeedback("Erro ao enviar.");
    } finally {
      setSending(false);
    }
  }

  async function sendMessage(custom?: string) {
    const message = (custom ?? input).trim();
    if (!message) return;

    if (!custom) {
      setInput("");
    }

    await sendRequest({ message });
  }

  async function runAction(action: string) {
    await sendRequest({ action });
  }

  useEffect(() => {
    if (open) {
      loadMessages(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.uid]);

  useEffect(() => {
    if (!open || !autoRefresh || !user?.uid) return;

    const timer = setInterval(() => {
      loadMessages(false);
    }, 25000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoRefresh, user?.uid]);

  const currentHealth = status?.health || "warning";

  return (
    <>
      <button
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-4 font-bold text-black shadow-2xl transition hover:bg-cyan-400"
      >
        <span className={`h-2.5 w-2.5 rounded-full ${healthDot(currentHealth)}`} />
        {open ? "Fechar IA" : "IA do Site"}
      </button>

      {open ? (
        <div className="fixed bottom-20 right-4 z-50 w-[92vw] max-w-[430px] rounded-3xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div>
              <div className="flex items-center gap-2 font-bold text-cyan-400">
                <span className={`h-2.5 w-2.5 rounded-full ${healthDot(currentHealth)}`} />
                LK AI Operator
              </div>
              <div className="text-xs text-zinc-500">
                Chat operacional rápido do site
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                Auto
              </label>

              <button
                onClick={() => setOpen(false)}
                className="rounded-xl border border-zinc-700 px-3 py-1 text-sm text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
              >
                X
              </button>
            </div>
          </div>

          {status ? (
            <div className="grid grid-cols-3 gap-2 px-3 pt-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                <div className="text-[10px] uppercase text-zinc-500">Saúde</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">
                  {currentHealth === "healthy"
                    ? "Saudável"
                    : currentHealth === "critical"
                    ? "Crítica"
                    : "Atenção"}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                <div className="text-[10px] uppercase text-zinc-500">Fila</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">
                  {status?.queue?.total ?? 0}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
                <div className="text-[10px] uppercase text-zinc-500">Pendências IA</div>
                <div className="mt-1 text-sm font-bold text-zinc-100">
                  {status?.commentsAi?.pending ??
                    status?.commentsAi?.totalPending ??
                    status?.commentsAi?.open ??
                    0}
                </div>
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div className="mx-3 mt-3 rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
              {feedback}
            </div>
          ) : null}

          <div className="px-3 pt-3 flex flex-wrap gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                disabled={sending}
                className="rounded-full border border-zinc-700 px-3 py-2 text-[11px] text-zinc-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="px-3 pt-3 flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.key}
                onClick={() => runAction(action.key)}
                disabled={sending}
                className="rounded-xl border border-amber-700 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
          </div>

          <div
            ref={listRef}
            className="max-h-[420px] min-h-[250px] overflow-y-auto px-3 py-3 space-y-3"
          >
            {loading ? (
              <div className="text-sm text-zinc-400">Carregando...</div>
            ) : messages.length === 0 ? (
              <div className="text-sm text-zinc-500">
                Pergunte algo para a IA do site.
              </div>
            ) : (
              messages.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div
                    className={`max-w-[90%] rounded-2xl border p-3 text-sm ${roleBubble(
                      item.role
                    )}`}
                  >
                    <div className="mb-1 text-[10px] uppercase opacity-70">
                      {roleLabel(item.role)} • {formatDate(item.createdAt)}
                    </div>

                    <div className="whitespace-pre-wrap">{item.content}</div>
                  </div>

                  {item.role === "assistant" && item.meta ? (
                    <div className="space-y-2">
                      {Array.isArray(item.meta.highlights) &&
                      item.meta.highlights.length > 0 ? (
                        <div className="rounded-xl border border-cyan-900 bg-cyan-500/5 p-3">
                          <div className="mb-2 text-[11px] font-bold text-cyan-300">
                            Highlights
                          </div>
                          <div className="space-y-1 text-[11px] text-zinc-200">
                            {item.meta.highlights.slice(0, 3).map((line, index) => (
                              <div key={index}>• {line}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {Array.isArray(item.meta.warnings) &&
                      item.meta.warnings.length > 0 ? (
                        <div className="rounded-xl border border-yellow-900 bg-yellow-500/5 p-3">
                          <div className="mb-2 text-[11px] font-bold text-yellow-300">
                            Warnings
                          </div>
                          <div className="space-y-1 text-[11px] text-zinc-200">
                            {item.meta.warnings.slice(0, 3).map((line, index) => (
                              <div key={index}>• {line}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {Array.isArray(item.meta.recommendations) &&
                      item.meta.recommendations.length > 0 ? (
                        <div className="rounded-xl border border-emerald-900 bg-emerald-500/5 p-3">
                          <div className="mb-2 text-[11px] font-bold text-emerald-300">
                            Recomendações
                          </div>
                          <div className="space-y-1 text-[11px] text-zinc-200">
                            {item.meta.recommendations.slice(0, 3).map((line, index) => (
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

          <div className="border-t border-zinc-800 p-3 space-y-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte sobre saúde, fila, incidentes, comentários, automação..."
              className="min-h-[95px] w-full rounded-2xl border border-zinc-700 bg-black/30 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-cyan-400"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />

            <div className="flex gap-2">
              <button
                onClick={() => runAction("clear")}
                disabled={sending}
                className="rounded-xl border border-red-700 px-4 py-3 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                Limpar
              </button>

              <button
                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-3 font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>

            <div className="text-[10px] text-zinc-500">
              Use Ctrl + Enter para enviar mais rápido.
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}