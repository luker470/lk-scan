"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

type CommentItem = {
  id: string;
  uid: string;
  text: string;
  createdAt?: any;
};

function timeLabel(ts: any) {
  const s = ts?.seconds;
  if (!s) return "";
  const d = new Date(s * 1000);
  return d.toLocaleString();
}

export default function Comments({
  mangaId,
  chapterId,
}: {
  mangaId: string;
  chapterId: string;
}) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [items, setItems] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const colRef = useMemo(
    () => collection(db, "mangas", mangaId, "chapters", chapterId, "comments"),
    [mangaId, chapterId]
  );

  async function load() {
    setLoading(true);
    try {
      const q = query(colRef, orderBy("createdAt", "desc"), limit(50));
      const snap = await getDocs(q);
      setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mangaId, chapterId]);

  async function send() {
    if (!user) return alert("Aguardando login...");
    const t = text.trim();
    if (!t) return;
    if (t.length > 800) return alert("Comentário muito grande (máx 800).");

    setSending(true);
    try {
      await addDoc(colRef, {
        uid: user.uid,
        text: t,
        createdAt: serverTimestamp(),
      });
      setText("");
      await load();
    } catch (e) {
      console.error(e);
      alert("Erro ao comentar.");
    } finally {
      setSending(false);
    }
  }

  async function removeComment(id: string) {
    if (!user) return;
    const ok = confirm("Apagar comentário?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "mangas", mangaId, "chapters", chapterId, "comments", id));
      await load();
    } catch (e) {
      console.error(e);
      alert("Não consegui apagar.");
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="font-semibold">💬 Comentários</div>

      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escreva um comentário..."
          className="flex-1 rounded-xl bg-zinc-800/70 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
        />
        <button
          onClick={send}
          disabled={sending}
          className="rounded-xl bg-cyan-500 px-4 font-bold text-black hover:bg-cyan-600 disabled:opacity-50"
        >
          {sending ? "Enviando..." : "Enviar"}
        </button>
      </div>

      {loading ? (
        <div className="text-zinc-300 text-sm">Carregando comentários...</div>
      ) : items.length === 0 ? (
        <div className="text-zinc-400 text-sm">Nenhum comentário ainda.</div>
      ) : (
        <div className="space-y-2">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-zinc-800 bg-black/30 p-3">
              <div className="text-xs text-zinc-500 flex items-center justify-between gap-2">
                <span className="truncate">
                  {c.uid.slice(0, 6)}… • {timeLabel(c.createdAt)}
                </span>
                {user?.uid === c.uid && (
                  <button
                    onClick={() => removeComment(c.id)}
                    className="text-red-300 hover:text-red-200"
                  >
                    Apagar
                  </button>
                )}
              </div>
              <div className="text-zinc-200 mt-1 whitespace-pre-wrap">{c.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}