"use client";

import { useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

function isImageUrl(u: string) {
  return /\.(jpe?g|png|webp|gif)(\?.*)?$/i.test(u);
}

function extractUrls(raw: string) {
  const matches = raw.match(/https?:\/\/[^\s"'<>]+/g) || [];
  return matches.map((s) => s.trim());
}

function sortByTrailingNumber(urls: string[]) {
  const num = (u: string) => {
    const clean = u.split("?")[0];
    const m = clean.match(/(\d+)\.(jpe?g|png|webp|gif)$/i);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
  };
  return [...urls].sort((a, b) => {
    const na = num(a);
    const nb = num(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  });
}

function normalizeChapterId(rawId: string) {
  const m = rawId.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 0;
  if (!n) return null;
  return String(n).padStart(3, "0");
}

type ParsedChapter = { chapterId: string; title?: string; urls: string[] };

function parseManual(text: string): ParsedChapter[] {
  const blocks = text.split(/#CHAPTER/i).map((b) => b.trim()).filter(Boolean);
  const result: ParsedChapter[] = [];

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).map((l) => l.trim());
    const header = lines[0] || "";
    const chapterId = normalizeChapterId(header);
    if (!chapterId) continue;

    const rest = lines.slice(1).join("\n");
    const urls = sortByTrailingNumber(Array.from(new Set(extractUrls(rest).filter(isImageUrl))));
    if (urls.length === 0) continue;

    result.push({ chapterId, title: header || `Capítulo ${chapterId}`, urls });
  }

  return result;
}

function groupKeyByFolder(url: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    parts.pop();
    return `${u.origin}${parts.join("/")}`;
  } catch {
    const i = url.lastIndexOf("/");
    return i > 8 ? url.slice(0, i) : url;
  }
}

function parseAuto(text: string, startChapter: number): ParsedChapter[] {
  const urls = extractUrls(text)
    .filter((u) => u.startsWith("http://") || u.startsWith("https://"))
    .filter(isImageUrl);

  const unique = Array.from(new Set(urls));

  const map = new Map<string, string[]>();
  for (const u of unique) {
    const key = groupKeyByFolder(u);
    const list = map.get(key) || [];
    list.push(u);
    map.set(key, list);
  }

  const folders = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));

  const result: ParsedChapter[] = [];
  folders.forEach((folder, idx) => {
    const chapterNum = startChapter + idx;
    const chapterId = pad3(chapterNum);

    const sortedUrls = sortByTrailingNumber(map.get(folder) || []);
    if (sortedUrls.length === 0) return;

    result.push({ chapterId, title: `Capítulo ${chapterId}`, urls: sortedUrls });
  });

  return result;
}

type Mode = "auto" | "manual";
type ExistsMode = "skip" | "overwrite";

export default function ImportMangaFull({ mangaId }: { mangaId: string }) {
  const [mode, setMode] = useState<Mode>("auto");
  const [existsMode, setExistsMode] = useState<ExistsMode>("skip");
  const [startChapter, setStartChapter] = useState(1);

  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const chapters = useMemo(() => {
    if (mode === "manual") return parseManual(raw);
    return parseAuto(raw, startChapter);
  }, [raw, mode, startChapter]);

  async function getExistingChapterIds() {
    const snap = await getDocs(collection(db, "mangas", mangaId, "chapters"));
    return new Set(snap.docs.map((d) => d.id));
  }

  async function saveAll() {
    setOk(null);
    setErr(null);

    if (!mangaId) return setErr("mangaId ausente.");
    if (chapters.length === 0) {
      return setErr(
        mode === "manual"
          ? "Nenhum capítulo detectado. Use #CHAPTER 001 etc."
          : "Nenhum link válido detectado (precisa ser link direto .jpg/.png/.webp)."
      );
    }

    setLoading(true);
    try {
      const existing = await getExistingChapterIds();

      let totalPages = 0;
      let importedChapters = 0;
      let maxChapter = 0;

      for (const ch of chapters) {
        const exists = existing.has(ch.chapterId);
        if (exists && existsMode === "skip") continue;

        const pages = ch.urls.map((url, i) => ({ index: i + 1, url }));
        totalPages += pages.length;
        importedChapters += 1;

        const number = parseInt(ch.chapterId, 10);
        maxChapter = Math.max(maxChapter, number);

        await setDoc(
          doc(db, "mangas", mangaId, "chapters", ch.chapterId),
          {
            number,
            title: ch.title || `Capítulo ${ch.chapterId}`,
            pagesCount: pages.length,
            pages,
            ...(exists ? {} : { createdAt: serverTimestamp() }),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      // Recalcula chaptersCount real
      const after = await getDocs(collection(db, "mangas", mangaId, "chapters"));
      const realCount = after.size;

      await updateDoc(doc(db, "mangas", mangaId), {
        updatedAt: serverTimestamp(),
        chaptersCount: realCount,
        lastChapterNumber: maxChapter || 0,
      }).catch(() => {});

      setOk(`✅ Importado: ${importedChapters} capítulos / ${totalPages} páginas. (Total no mangá: ${realCount})`);
      setRaw("");
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Erro ao importar capítulos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-lg font-semibold">📚 Importar tudo</div>

      <div className="grid gap-3">
        <label className="text-sm text-zinc-300">
          Modo:
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="mt-2 w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
          >
            <option value="auto">✅ Automático — agrupa por pasta</option>
            <option value="manual">Manual — usar #CHAPTER 001</option>
          </select>
        </label>

        <label className="text-sm text-zinc-300">
          Se capítulo já existir:
          <select
            value={existsMode}
            onChange={(e) => setExistsMode(e.target.value as ExistsMode)}
            className="mt-2 w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
          >
            <option value="skip">Pular (não mexe)</option>
            <option value="overwrite">Sobrescrever (atualiza páginas)</option>
          </select>
        </label>

        {mode === "auto" && (
          <label className="text-sm text-zinc-300">
            Começar no capítulo:
            <input
              type="number"
              min={1}
              value={startChapter}
              onChange={(e) => setStartChapter(Number(e.target.value))}
              className="mt-2 w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
            />
            <div className="mt-1 text-xs text-zinc-500">Se começar em 1, cria 001, 002, 003... (um capítulo por pasta)</div>
          </label>
        )}

        {mode === "manual" && (
          <div className="text-xs text-zinc-400">
            Formato:
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-800/70 p-2 border border-zinc-700">
{`#CHAPTER 001
https://.../1.jpg
https://.../2.jpg

#CHAPTER 002
https://.../1.jpg
https://.../2.jpg`}
            </pre>
          </div>
        )}
      </div>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={12}
        placeholder="Cole aqui TODOS os links (pode vir misturado com texto)."
        className="w-full rounded-xl bg-zinc-800/70 p-2 outline-none border border-zinc-700 focus:border-cyan-400"
      />

      <div className="text-xs text-zinc-400">
        Capítulos detectados: <b className="text-zinc-200">{chapters.length}</b>
      </div>

      {err && <div className="rounded-xl bg-red-500/15 p-2 text-sm text-red-200">{err}</div>}
      {ok && <div className="rounded-xl bg-green-500/15 p-2 text-sm text-green-200">{ok}</div>}

      <button
        onClick={saveAll}
        disabled={loading}
        className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50 transition"
      >
        {loading ? "Importando..." : "Importar tudo agora"}
      </button>
    </div>
  );
}