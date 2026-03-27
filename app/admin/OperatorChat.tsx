"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

type ChatItem = {
  role: "user" | "assistant";
  text: string;
  createdAt?: string;
  highlights?: string[];
  warnings?: string[];
  recommendations?: string[];
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
  "Me dê um relatório do site",
  "Como está a saúde do sistema?",
  "Quais mudanças você recomenda agora?",
  "Como estão as fontes?",
  "Existem incidentes importantes?",
  "Como está a fila do operador?",
  "A automação já está 100%?",
  "Quais são as prioridades agora?",
];

function nowLabel() {
  return new Date().toLocaleTimeString("pt-BR");
}

export default function OperatorChat() {
  const { user } = useAuth();
  const listRef = useRef<HTMLDivElement | null>(null);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      role: "assistant",
      text:
        "LK AI Operator online. Pergunte sobre saúde do site, relatórios, incidentes, fontes, prioridades, automação, comentários e mudanças necessárias.",
      createdAt: nowLabel(),
    },
  ]);

  const canSend = useMemo(() => !!text.trim() && !!user?.uid && !sending, [text, user?.uid, sending]);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      if (!listRef.current) return;
      listRef.current.scrollTop = listRef.current.scrollHeight;
    });
  }

  async function send(customText?: string) {
    const t = (customText ?? text).trim();
    if (!t || !user?.uid) return;

    setSending(true);
    setFeedback("");

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        text: t,
        createdAt: nowLabel(),
      },
    ]);

    if (!customText) {
      setText("");
    }

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
        setFeedback(data?.error || "Não consegui responder agora.");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: data?.error || "Não consegui responder agora.",
            createdAt: nowLabel(),
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: data?.reply?.answer || "Não consegui responder agora.",
          createdAt: nowLabel(),
          highlights: data?.reply?.highlights || [],
          warnings: data?.reply?.warnings || [],
          recommendations: data?.reply?.recommendations || [],
        },
      ]);
    } catch (e) {
      console.error(e);
      setFeedback("Erro ao conversar com o operador.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Erro ao conversar com o operador.",
          createdAt: nowLabel(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-cyan-400">🗣️ Chat do Operador</h2>
        <p className="text-sm text-zinc-400">
          Converse com o assistente operacional sobre relatórios, saúde do site,
          mudanças, prioridades, automação, fontes e incidentes.
        </p>
      </div>

      {feedback ? (
        <div className="rounded-xl border border-cyan-700 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300">
          {feedback}
        </div>
      ) : null}

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
        className="max-h-[460px] overflow-y-auto rounded-2xl border border-zinc-800 bg-black/20 p-4 space-y-3"
      >
        {messages.map((msg, idx) => (
          <div key={idx} className="space-y-2">
            <div
              className={`rounded-xl border p-3 text-sm ${
                msg.role === "assistant"
                  ? "border-cyan-500/20 bg-cyan-500/10 text-zinc-100"
                  : "border-zinc-700 bg-zinc-800/70 text-zinc-200"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs opacity-70">
                <span>{msg.role === "assistant" ? "Operador" : "Você"}</span>
                <span>{msg.createdAt || "agora"}</span>
              </div>

              <div className="whitespace-pre-wrap leading-6">{msg.text}</div>
            </div>

            {msg.role === "assistant" ? (
              <div className="grid gap-3 xl:grid-cols-3">
                {Array.isArray(msg.highlights) && msg.highlights.length > 0 ? (
                  <div className="rounded-xl border border-cyan-900 bg-cyan-500/5 p-3">
                    <div className="mb-2 text-xs font-bold text-cyan-300">
                      Highlights
                    </div>
                    <div className="space-y-2 text-xs text-zinc-200">
                      {msg.highlights.map((line, index) => (
                        <div key={index}>• {line}</div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(msg.warnings) && msg.warnings.length > 0 ? (
                  <div className="rounded-xl border border-yellow-900 bg-yellow-500/5 p-3">
                    <div className="mb-2 text-xs font-bold text-yellow-300">
                      Warnings
                    </div>
                    <div className="space-y-2 text-xs text-zinc-200">
                      {msg.warnings.map((line, index) => (
                        <div key={index}>• {line}</div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {Array.isArray(msg.recommendations) &&
                msg.recommendations.length > 0 ? (
                  <div className="rounded-xl border border-emerald-900 bg-emerald-500/5 p-3">
                    <div className="mb-2 text-xs font-bold text-emerald-300">
                      Recomendações
                    </div>
                    <div className="space-y-2 text-xs text-zinc-200">
                      {msg.recommendations.map((line, index) => (
                        <div key={index}>• {line}</div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex: me dê um relatório do site"
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800/70 p-3 outline-none focus:border-cyan-400"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          onClick={() => send()}
          disabled={!canSend}
          className="rounded-xl bg-cyan-500 px-4 font-bold text-black transition hover:bg-cyan-400 disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </div>
    </section>
  );
}