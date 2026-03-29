"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type ChatItem = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt?: string;
  highlights?: string[];
  warnings?: string[];
  recommendations?: string[];
  status?: "sending" | "sent" | "error";
};

type ChatApiResponse = {
  ok: boolean;
  reply?: {
    answer?: string;
    highlights?: string[];
    warnings?: string[];
    recommendations?: string[];
  };
  error?: string;
};

const QUICK_QUESTIONS = [
  "Me dê um relatório executivo do site",
  "Como está a saúde do sistema agora?",
  "Quais são as prioridades mais urgentes?",
  "Existem incidentes importantes em aberto?",
  "Como está a automação do operador?",
  "Quais problemas a IA vê com mais recorrência?",
  "Como estão as fontes e quais são as mais arriscadas?",
  "Como está a fila do operador neste momento?",
  "A automação já está 100%?",
  "O que você recomenda melhorar agora?",
];

function nowLabel() {
  return new Date().toLocaleTimeString("pt-BR");
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function compactText(value: unknown, max = 220) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3)}...`;
}

function PanelCard({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "warning" | "highlight" | "success";
}) {
  const cls =
    tone === "warning"
      ? "border-yellow-900 bg-yellow-500/5"
      : tone === "highlight"
      ? "border-cyan-900 bg-cyan-500/5"
      : tone === "success"
      ? "border-emerald-900 bg-emerald-500/5"
      : "border-zinc-800 bg-black/20";

  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="mb-2 text-xs font-bold text-zinc-400">{title}</div>
      {children}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status?: "sending" | "sent" | "error";
}) {
  if (status === "sending") {
    return (
      <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold text-yellow-300">
        enviando
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="rounded-full border border-red-500/20 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-300">
        erro
      </span>
    );
  }

  return (
    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">
      ok
    </span>
  );
}

export default function OperatorChat() {
  const { user } = useAuth();
  const listRef = useRef<HTMLDivElement | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: makeId(),
      role: "assistant",
      text:
        "LK AI Operator online. Pergunte sobre saúde do site, relatórios, incidentes, fontes, prioridades, automação, memória operacional, comentários e mudanças necessárias.",
      createdAt: nowLabel(),
      status: "sent",
      highlights: [
        "Leio saúde do sistema",
        "Resumo fila, incidentes e fontes",
        "Aponto prioridades operacionais",
      ],
      warnings: [
        "Mudanças estruturais no site devem ser aprovadas por você antes de aplicação."
      ],
      recommendations: [
        "Pergunte por prioridades, gargalos, automação e status do catálogo."
      ],
    },
  ]);

  const canSend = useMemo(
    () => !!text.trim() && !!user?.uid && !sending,
    [text, user?.uid, sending]
  );

  const chatStats = useMemo(() => {
    const assistantCount = messages.filter((m) => m.role === "assistant").length;
    const userCount = messages.filter((m) => m.role === "user").length;
    const warningCount = messages.reduce(
      (acc, item) => acc + (Array.isArray(item.warnings) ? item.warnings.length : 0),
      0
    );
    const recommendationCount = messages.reduce(
      (acc, item) =>
        acc + (Array.isArray(item.recommendations) ? item.recommendations.length : 0),
      0
    );

    return {
      total: messages.length,
      assistantCount,
      userCount,
      warningCount,
      recommendationCount,
    };
  }, [messages]);

  function scrollToBottom(force = false) {
    requestAnimationFrame(() => {
      if (!listRef.current) return;
      if (!autoScroll && !force) return;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }

  function appendMessage(message: ChatItem) {
    setMessages((prev) => [...prev, message]);
  }

  function updateMessage(id: string, patch: Partial<ChatItem>) {
    setMessages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function send(customText?: string) {
    const t = (customText ?? text).trim();
    if (!t || !user?.uid) return;

    setSending(true);
    setFeedback("");

    const userMessageId = makeId();
    const assistantMessageId = makeId();

    appendMessage({
      id: userMessageId,
      role: "user",
      text: t,
      createdAt: nowLabel(),
      status: "sent",
    });

    appendMessage({
      id: assistantMessageId,
      role: "assistant",
      text: "Pensando na operação atual do sistema...",
      createdAt: nowLabel(),
      status: "sending",
    });

    if (!customText) {
      setText("");
    }

    scrollToBottom(true);

    try {
      const res = await fetch("/api/admin/operator/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": user.uid,
        },
        body: JSON.stringify({ question: t }),
      });

      const data: ChatApiResponse = await res.json();

      if (!data?.ok) {
        const errorText = data?.error || "Não consegui responder agora.";
        setFeedback(errorText);

        updateMessage(assistantMessageId, {
          text: errorText,
          status: "error",
          highlights: [],
          warnings: [],
          recommendations: [],
        });

        return;
      }

      updateMessage(assistantMessageId, {
        text: data?.reply?.answer || "Não consegui responder agora.",
        createdAt: nowLabel(),
        status: "sent",
        highlights: data?.reply?.highlights || [],
        warnings: data?.reply?.warnings || [],
        recommendations: data?.reply?.recommendations || [],
      });
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao conversar com o operador.");

      updateMessage(assistantMessageId, {
        text: "Erro ao conversar com o operador.",
        createdAt: nowLabel(),
        status: "error",
        highlights: [],
        warnings: [],
        recommendations: [],
      });
    } finally {
      setSending(false);
      scrollToBottom(true);
    }
  }

  function handleClearChat() {
    setMessages([
      {
        id: makeId(),
        role: "assistant",
        text:
          "Histórico visual limpo. O LK AI Operator continua pronto para responder sobre saúde, fila, fontes, automação, memória e prioridades.",
        createdAt: nowLabel(),
        status: "sent",
        recommendations: [
          "Pergunte pelo status atual do sistema para reconstruir o contexto."
        ],
      },
    ]);
    setFeedback("");
    scrollToBottom(true);
  }

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-xl font-bold text-cyan-400">🗣️ Chat do Operador</h2>
          <p className="text-sm text-zinc-400">
            Converse com o assistente operacional sobre relatórios, saúde do site,
            mudanças, prioridades, automação, fontes, fila, memória e incidentes.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[420px]">
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-[11px] text-zinc-500">Mensagens</div>
            <div className="mt-1 text-lg font-bold text-zinc-100">
              {chatStats.total}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-[11px] text-zinc-500">Warnings</div>
            <div className="mt-1 text-lg font-bold text-yellow-300">
              {chatStats.warningCount}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-[11px] text-zinc-500">Recomendações</div>
            <div className="mt-1 text-lg font-bold text-emerald-300">
              {chatStats.recommendationCount}
            </div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-3">
            <div className="text-[11px] text-zinc-500">Status</div>
            <div className="mt-1 text-lg font-bold text-cyan-300">
              {sending ? "Ativo" : "Pronto"}
            </div>
          </div>
        </div>
      </div>

      {feedback ? (
        <div className="rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {feedback}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
          />
          auto scroll
        </label>

        <button
          onClick={handleClearChat}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-300 transition hover:border-cyan-400 hover:text-cyan-300"
        >
          Limpar visual
        </button>

        <div className="rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-500">
          Use este chat para leitura operacional, não para alterar o site sem aprovação.
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((item) => (
          <button
            key={item}
            onClick={() => send(item)}
            disabled={sending}
            className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
          >
            {item}
          </button>
        ))}
      </div>

      <div
        ref={listRef}
        className="max-h-[560px] overflow-y-auto rounded-2xl border border-zinc-800 bg-black/20 p-4 space-y-4"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-2">
            <div
              className={`rounded-xl border p-3 text-sm ${
                msg.role === "assistant"
                  ? "border-cyan-500/20 bg-cyan-500/10 text-zinc-100"
                  : "border-zinc-700 bg-zinc-800/70 text-zinc-200"
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs opacity-80">
                <div className="flex items-center gap-2">
                  <span>{msg.role === "assistant" ? "Operador" : "Você"}</span>
                  <StatusBadge status={msg.status} />
                </div>
                <span>{msg.createdAt || "agora"}</span>
              </div>

              <div className="whitespace-pre-wrap leading-6">{msg.text}</div>
            </div>

            {msg.role === "assistant" ? (
              <div className="grid gap-3 xl:grid-cols-3">
                {Array.isArray(msg.highlights) && msg.highlights.length > 0 ? (
                  <PanelCard title="Highlights" tone="highlight">
                    <div className="space-y-2 text-xs text-zinc-200">
                      {msg.highlights.map((line, index) => (
                        <div key={index}>• {compactText(line, 220)}</div>
                      ))}
                    </div>
                  </PanelCard>
                ) : null}

                {Array.isArray(msg.warnings) && msg.warnings.length > 0 ? (
                  <PanelCard title="Warnings" tone="warning">
                    <div className="space-y-2 text-xs text-zinc-200">
                      {msg.warnings.map((line, index) => (
                        <div key={index}>• {compactText(line, 220)}</div>
                      ))}
                    </div>
                  </PanelCard>
                ) : null}

                {Array.isArray(msg.recommendations) &&
                msg.recommendations.length > 0 ? (
                  <PanelCard title="Recomendações" tone="success">
                    <div className="space-y-2 text-xs text-zinc-200">
                      {msg.recommendations.map((line, index) => (
                        <div key={index}>• {compactText(line, 220)}</div>
                      ))}
                    </div>
                  </PanelCard>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: me dê um relatório do site, como está a fila, quais riscos a IA vê agora..."
          className="min-h-[96px] rounded-xl border border-zinc-700 bg-zinc-800/70 p-3 outline-none focus:border-cyan-400"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />

        <div className="flex flex-col gap-2">
          <button
            onClick={() => send()}
            disabled={!canSend}
            className="rounded-xl bg-cyan-500 px-4 py-3 font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50"
          >
            {sending ? "Enviando..." : "Enviar"}
          </button>

          <div className="rounded-xl border border-zinc-700 bg-black/20 p-3 text-xs text-zinc-500">
            Enter envia
            <br />
            Shift + Enter quebra linha
          </div>
        </div>
      </div>
    </section>
  );
}