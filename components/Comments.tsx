"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

type CommentItem = {
  id: string;
  uid: string;
  text: string;
  authorName?: string;
  authorPhotoURL?: string;
  createdAt?: any;
  updatedAt?: any;
  hidden?: boolean;
  reportedBy?: string[];
  reportedCount?: number;

  aiResponded?: boolean;
  aiResponse?: string;
  aiClassification?: string;
  aiPriority?: number;
  aiSentiment?: "positive" | "neutral" | "negative";
  needsReview?: boolean;
  toxicityScore?: number;
  moderationStatus?: string;
};

type CommentsProps = {
  mangaId: string;
  chapterId?: string;
  title?: string;
  maxItems?: number;
};

const MAX_COMMENT_LENGTH = 800;
const COMMENT_COOLDOWN_MS = 10_000;

function toDate(ts: any) {
  const seconds = ts?.seconds ?? ts?._seconds;
  if (typeof seconds === "number") {
    return new Date(seconds * 1000);
  }

  if (ts instanceof Date) return ts;

  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timeLabel(ts: any) {
  const d = toDate(ts);
  if (!d) return "Agora";
  return d.toLocaleString("pt-BR");
}

function relativeTimeLabel(ts: any) {
  const d = toDate(ts);
  if (!d) return "agora";

  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return "agora";
  if (min < 60) return `${min} min atrás`;
  if (hour < 24) return `${hour} h atrás`;
  return `${day} dia(s) atrás`;
}

function formatUserName(comment: CommentItem) {
  if (comment.authorName?.trim()) return comment.authorName.trim();
  if (comment.uid) return `${comment.uid.slice(0, 6)}…`;
  return "Usuário";
}

function sentimentClass(sentiment?: string) {
  if (sentiment === "positive") {
    return "text-emerald-300 border-emerald-500/20 bg-emerald-500/10";
  }
  if (sentiment === "negative") {
    return "text-red-300 border-red-500/20 bg-red-500/10";
  }
  return "text-zinc-300 border-zinc-500/20 bg-zinc-500/10";
}

function aiClassLabel(value?: string) {
  switch (value) {
    case "praise":
      return "elogio";
    case "bug":
      return "bug";
    case "question":
      return "dúvida";
    case "request":
      return "pedido";
    case "toxic":
      return "tóxico";
    case "spoiler":
      return "spoiler";
    default:
      return value || "";
  }
}

function aiClassStyle(value?: string) {
  switch (value) {
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

function moderationLabel(item: CommentItem) {
  if (item.hidden) return "oculto";
  if (item.moderationStatus === "pending-review" || item.needsReview) {
    return "em revisão";
  }
  if (item.moderationStatus === "approved") return "aprovado";
  if (item.moderationStatus === "pending-ai") return "analisando IA";
  return "";
}

function buildCollectionRef(mangaId: string, chapterId?: string) {
  if (!db) return null;

  if (chapterId) {
    return collection(db, "mangas", mangaId, "chapters", chapterId, "comments");
  }

  return collection(db, "mangas", mangaId, "comments");
}

function feedbackClass(type: "success" | "error" | "info") {
  if (type === "success") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
  if (type === "error") {
    return "border-red-500/20 bg-red-500/10 text-red-300";
  }
  return "border-cyan-500/20 bg-cyan-500/10 text-cyan-300";
}

export default function Comments({
  mangaId,
  chapterId,
  title = "💬 Comentários",
  maxItems = 80,
}: CommentsProps) {
  const { user } = useAuth();

  const [text, setText] = useState("");
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [actionId, setActionId] = useState("");
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | "info">("info");
  const [sortMode, setSortMode] = useState<"recent" | "oldest">("recent");

  const cooldownRef = useRef<number>(0);

  const colRef = useMemo(
    () => buildCollectionRef(mangaId, chapterId),
    [mangaId, chapterId]
  );

  const visibleItems = useMemo(() => {
    const filtered = items.filter((item) => !item.hidden);

    return [...filtered].sort((a, b) => {
      const ad = toDate(a.createdAt)?.getTime() || 0;
      const bd = toDate(b.createdAt)?.getTime() || 0;
      return sortMode === "recent" ? bd - ad : ad - bd;
    });
  }, [items, sortMode]);

  const textTrimmed = text.trim();
  const charsLeft = MAX_COMMENT_LENGTH - text.length;
  const canSend =
    !!user &&
    !!colRef &&
    !sending &&
    !!textTrimmed &&
    textTrimmed.length <= MAX_COMMENT_LENGTH &&
    cooldownLeft <= 0;

  const summary = useMemo(() => {
    return {
      total: visibleItems.length,
      review: visibleItems.filter(
        (item) =>
          item.needsReview ||
          item.moderationStatus === "pending-review"
      ).length,
      bug: visibleItems.filter((item) => item.aiClassification === "bug").length,
      ai: visibleItems.filter((item) => item.aiResponded).length,
    };
  }, [visibleItems]);

  function showFeedback(
    message: string,
    type: "success" | "error" | "info" = "info"
  ) {
    setFeedback(message);
    setFeedbackType(type);
  }

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = cooldownRef.current - Date.now();
      setCooldownLeft(diff > 0 ? Math.ceil(diff / 1000) : 0);
    }, 300);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!colRef) {
      setLoading(false);
      setItems([]);
      return;
    }

    setLoading(true);

    const q = query(colRef, orderBy("createdAt", "desc"), limit(maxItems));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CommentItem, "id">),
        }));

        setItems(next);
        setLoading(false);
      },
      (err) => {
        console.error("Erro ao ouvir comentários:", err);
        setItems([]);
        setLoading(false);
        showFeedback("Erro ao carregar comentários em tempo real.", "error");
      }
    );

    return () => unsub();
  }, [colRef, maxItems]);

  async function send() {
    if (!user) {
      showFeedback("Faça login para comentar.", "error");
      return;
    }

    if (!colRef) {
      showFeedback("Firebase não inicializado.", "error");
      return;
    }

    const cleanText = textTrimmed;

    if (!cleanText) return;

    if (cleanText.length > MAX_COMMENT_LENGTH) {
      showFeedback(`Comentário muito grande (máx ${MAX_COMMENT_LENGTH}).`, "error");
      return;
    }

    if (cooldownLeft > 0) {
      showFeedback(`Espere ${cooldownLeft}s para comentar novamente.`, "error");
      return;
    }

    setSending(true);
    setFeedback("");

    try {
      const authorName =
        user.displayName?.trim() ||
        user.email?.split("@")[0]?.trim() ||
        `user-${user.uid.slice(0, 6)}`;

      await addDoc(colRef, {
        uid: user.uid,
        text: cleanText,
        authorName,
        authorPhotoURL: user.photoURL || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        hidden: false,
        reportedBy: [],
        reportedCount: 0,
        aiResponded: false,
        aiResponse: "",
        aiClassification: "",
        aiPriority: 0,
        aiSentiment: "neutral",
        needsReview: false,
        toxicityScore: 0,
        moderationStatus: "pending-ai",
      });

      setText("");
      cooldownRef.current = Date.now() + COMMENT_COOLDOWN_MS;
      showFeedback("Comentário enviado com sucesso.", "success");
    } catch (error) {
      console.error(error);
      showFeedback("Erro ao comentar.", "error");
    } finally {
      setSending(false);
    }
  }

  async function removeComment(id: string) {
    if (!user || !db) return;

    const ok = window.confirm("Apagar comentário?");
    if (!ok) return;

    setActionId(id);
    setFeedback("");

    try {
      const ref = chapterId
        ? doc(db, "mangas", mangaId, "chapters", chapterId, "comments", id)
        : doc(db, "mangas", mangaId, "comments", id);

      await deleteDoc(ref);
      showFeedback("Comentário apagado com sucesso.", "success");
    } catch (error) {
      console.error(error);
      showFeedback("Não consegui apagar.", "error");
    } finally {
      setActionId("");
    }
  }

  async function reportComment(id: string, ownerUid: string, alreadyReported: boolean) {
    if (!user || !db) {
      showFeedback("Faça login para denunciar.", "error");
      return;
    }

    if (user.uid === ownerUid) {
      showFeedback("Você não pode denunciar seu próprio comentário.", "error");
      return;
    }

    if (alreadyReported) {
      showFeedback("Você já denunciou este comentário.", "info");
      return;
    }

    const ok = window.confirm("Denunciar este comentário para revisão?");
    if (!ok) return;

    setActionId(id);
    setFeedback("");

    try {
      const ref = chapterId
        ? doc(db, "mangas", mangaId, "chapters", chapterId, "comments", id)
        : doc(db, "mangas", mangaId, "comments", id);

      await updateDoc(ref, {
        reportedBy: arrayUnion(user.uid),
        reportedCount: increment(1),
        needsReview: true,
        moderationStatus: "pending-review",
        updatedAt: serverTimestamp(),
      });

      showFeedback("Comentário denunciado para revisão.", "success");
    } catch (error) {
      console.error(error);
      showFeedback("Não consegui denunciar o comentário.", "error");
    } finally {
      setActionId("");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="font-semibold text-lg">{title}</div>
          <div className="text-xs text-zinc-500">
            Comunidade, sinais para IA e feedback do capítulo
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-300">
            {summary.total} comentário{summary.total === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-3 py-1 text-yellow-300">
            revisão: {summary.review}
          </span>
          <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-red-300">
            bugs: {summary.bug}
          </span>
          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-cyan-300">
            IA: {summary.ai}
          </span>
        </div>
      </div>

      {feedback ? (
        <div className={`rounded-xl border px-3 py-2 text-sm ${feedbackClass(feedbackType)}`}>
          {feedback}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-800 bg-black/20 p-3 space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            user
              ? "Escreva um comentário, dúvida, bug encontrado ou pedido..."
              : "Faça login para comentar..."
          }
          rows={4}
          maxLength={MAX_COMMENT_LENGTH}
          className="w-full rounded-xl bg-zinc-800/70 border border-zinc-700 p-3 outline-none focus:border-cyan-400 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-zinc-500">
            {charsLeft >= 0 ? (
              <span>{charsLeft} caracteres restantes</span>
            ) : (
              <span className="text-red-300">Limite excedido</span>
            )}

            {cooldownLeft > 0 ? (
              <span className="ml-3 text-yellow-300">
                Aguarde {cooldownLeft}s para comentar novamente
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-xs text-zinc-500">
              Ctrl + Enter para enviar
            </div>

            <button
              onClick={send}
              disabled={!canSend}
              className="rounded-xl bg-cyan-500 px-4 py-2 font-bold text-black hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-zinc-500">
          Os comentários podem virar sinal para moderação, bug, dúvida, pedido e recovery.
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">Ordenar:</label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as "recent" | "oldest")}
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 outline-none"
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigos</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-300 text-sm">Carregando comentários...</div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4 text-zinc-400 text-sm">
          Nenhum comentário ainda. Seja o primeiro a comentar este capítulo.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((c) => {
            const isOwner = user?.uid === c.uid;
            const alreadyReported =
              !!user?.uid && (c.reportedBy || []).includes(user.uid);
            const aiLabel = aiClassLabel(c.aiClassification);
            const moderation = moderationLabel(c);

            return (
              <div
                key={c.id}
                className="rounded-xl border border-zinc-800 bg-black/30 p-3 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {c.authorPhotoURL ? (
                      <img
                        src={c.authorPhotoURL}
                        alt={formatUserName(c)}
                        className="h-10 w-10 rounded-full object-cover border border-zinc-700"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-300">
                        {formatUserName(c).slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-200 line-clamp-1">
                        {formatUserName(c)}
                      </div>

                      <div className="text-xs text-zinc-500 flex flex-wrap gap-2">
                        <span>{timeLabel(c.createdAt)}</span>
                        <span>• {relativeTimeLabel(c.createdAt)}</span>

                        {typeof c.reportedCount === "number" && c.reportedCount > 0 ? (
                          <span>• {c.reportedCount} denúncia(s)</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0 justify-end">
                    {aiLabel ? (
                      <span
                        className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${aiClassStyle(
                          c.aiClassification
                        )}`}
                      >
                        IA: {aiLabel}
                      </span>
                    ) : null}

                    {moderation ? (
                      <span className="px-2 py-1 rounded-full border border-yellow-500/20 bg-yellow-500/10 text-yellow-300 text-[11px] font-semibold">
                        {moderation}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="text-zinc-200 whitespace-pre-wrap break-words leading-6">
                  {c.text}
                </div>

                {c.aiResponse ? (
                  <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2">
                    <div className="text-xs font-semibold text-cyan-300">
                      🤖 Resposta sugerida/gerada pela IA
                    </div>

                    <div className="text-sm text-zinc-200 whitespace-pre-wrap leading-6">
                      {c.aiResponse}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {c.aiSentiment ? (
                        <span
                          className={`px-2 py-1 rounded-full border text-[11px] font-semibold ${sentimentClass(
                            c.aiSentiment
                          )}`}
                        >
                          sentimento: {c.aiSentiment}
                        </span>
                      ) : null}

                      {typeof c.aiPriority === "number" && c.aiPriority > 0 ? (
                        <span className="px-2 py-1 rounded-full border border-zinc-700 text-zinc-300 text-[11px] font-semibold">
                          prioridade: {c.aiPriority}
                        </span>
                      ) : null}

                      {typeof c.toxicityScore === "number" && c.toxicityScore > 0 ? (
                        <span className="px-2 py-1 rounded-full border border-red-500/20 bg-red-500/10 text-red-300 text-[11px] font-semibold">
                          toxicidade: {c.toxicityScore}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-2 flex-wrap">
                  {!isOwner ? (
                    <button
                      onClick={() => reportComment(c.id, c.uid, alreadyReported)}
                      disabled={actionId === c.id || alreadyReported}
                      className="text-xs px-3 py-2 rounded-xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/15 disabled:opacity-50"
                    >
                      {alreadyReported
                        ? "Já denunciado"
                        : actionId === c.id
                        ? "Enviando..."
                        : "Denunciar"}
                    </button>
                  ) : null}

                  {isOwner ? (
                    <button
                      onClick={() => removeComment(c.id)}
                      disabled={actionId === c.id}
                      className="text-xs px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15 disabled:opacity-50"
                    >
                      {actionId === c.id ? "Apagando..." : "Apagar"}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}