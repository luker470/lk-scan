// app/admin/chapters/ImportAutoFromUrl.tsx
"use client";

import { useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/admin";

type ExtractPage = {
  index: number;
  url: string;
};

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

export default function ImportAutoFromUrl({
  mangaId,
}: {
  mangaId: string;
}) {
  const { user, loading: authLoading } = useAuth();

  const [chapterNumber, setChapterNumber] = useState(1);
  const [linksText, setLinksText] = useState("");
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function extractUrls(text: string) {
    const matches = text.match(/https?:\/\/[^\s"'<>]+/g) || [];
    return matches.map((s) => s.trim()).filter((u) => u.startsWith("http"));
  }

  async function recalcMangaMeta(mangaId: string) {
    if (!db) throw new Error("Firebase não inicializado.");

    const mangaRef = doc(db, "mangas", mangaId);
    const chaptersSnap = await getDocs(collection(db, "mangas", mangaId, "chapters"));
    const chaptersCount = chaptersSnap.size;

    let lastChapterNumber = 0;

    chaptersSnap.forEach((docSnap) => {
      const data = docSnap.data() as { number?: number | string };
      const n = Number(data.number || 0);
      if (n > lastChapterNumber) lastChapterNumber = n;
    });

    await setDoc(
      mangaRef,
      {
        updatedAt: new Date(),
        chaptersCount,
        lastChapterNumber,
      },
      { merge: true }
    );

    return {
      chaptersCount,
      lastChapterNumber,
    };
  }

  async function saveImportedChapterClient(params: {
    mangaId: string;
    chapterNumber: number;
    chapterUrl: string;
    overwriteExisting: boolean;
    pages: ExtractPage[];
  }) {
    const {
      mangaId,
      chapterNumber,
      chapterUrl,
      overwriteExisting,
      pages,
    } = params;

    if (!db) {
      throw new Error("Firebase não inicializado.");
    }

    const chapterId = pad3(chapterNumber);
    const chapterRef = doc(db, "mangas", mangaId, "chapters", chapterId);

    const existingChapterSnap = await getDoc(chapterRef);

    if (existingChapterSnap.exists() && !overwriteExisting) {
      throw new Error(
        `Capítulo ${chapterId} já existe. Marque "Sobrescrever" para atualizar.`
      );
    }

    const duplicateSnap = await getDocs(
      query(
        collection(db, "mangas", mangaId, "chapters"),
        where("sourceUrl", "==", chapterUrl),
        limit(1)
      )
    );

    if (!duplicateSnap.empty && !overwriteExisting) {
      const dup = duplicateSnap.docs[0];
      if (dup.id !== chapterId) {
        throw new Error(`Essa sourceUrl já foi importada no capítulo ${dup.id}.`);
      }
    }

    const existingData = existingChapterSnap.exists()
      ? existingChapterSnap.data()
      : null;

    const now = new Date();

    await setDoc(
      chapterRef,
      {
        number: chapterNumber,
        title: existingData?.title || `Capítulo ${chapterId}`,
        pagesCount: pages.length,
        pages,
        sourceUrl: chapterUrl,
        views: existingData?.views ?? 0,
        dayViews: existingData?.dayViews ?? 0,
        weekViews: existingData?.weekViews ?? 0,
        monthViews: existingData?.monthViews ?? 0,
        createdAt:
          existingChapterSnap.exists() && existingData?.createdAt
            ? existingData.createdAt
            : now,
        updatedAt: now,
      },
      { merge: true }
    );

    const meta = await recalcMangaMeta(mangaId);

    return {
      chapterId,
      chaptersCount: meta.chaptersCount,
      lastChapterNumber: meta.lastChapterNumber,
      pagesCount: pages.length,
    };
  }

  async function importOneChapter(params: {
    mangaId: string;
    chapterNumber: number;
    chapterUrl: string;
    overwriteExisting: boolean;
  }) {
    const extractRes = await fetch("/api/admin/extract-chapter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chapterUrl: params.chapterUrl,
      }),
    });

    const extractData = await extractRes.json().catch(() => null);

    if (!extractRes.ok || !extractData?.ok) {
      throw new Error(extractData?.error || "Falha ao extrair capítulo.");
    }

    const pages = (extractData.pages || []) as ExtractPage[];

    if (!pages.length) {
      throw new Error("Nenhuma página encontrada para esse capítulo.");
    }

    return saveImportedChapterClient({
      mangaId: params.mangaId,
      chapterNumber: params.chapterNumber,
      chapterUrl: params.chapterUrl,
      overwriteExisting: params.overwriteExisting,
      pages,
    });
  }

  async function runImport() {
    setMsg(null);
    setProgress(null);

    if (authLoading) {
      setMsg("⏳ Aguarde, verificando login...");
      return;
    }

    if (!user) {
      setMsg("❌ Login necessário.");
      return;
    }

    if (!isAdmin(user.uid)) {
      setMsg("❌ Apenas administrador pode importar capítulos.");
      return;
    }

    if (!db) {
      setMsg("❌ Firebase não inicializado.");
      return;
    }

    if (!mangaId) {
      setMsg("❌ Defina um MangaId.");
      return;
    }

    if (!chapterNumber || chapterNumber < 1) {
      setMsg("❌ Informe um capítulo inicial válido.");
      return;
    }

    const urls = extractUrls(linksText);

    if (!urls.length) {
      setMsg("❌ Cole pelo menos 1 link de capítulo.");
      return;
    }

    setLoading(true);

    try {
      let currentChapter = chapterNumber;
      let imported = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];

        setProgress(
          `Importando capítulo ${currentChapter} (${i + 1}/${urls.length})`
        );

        try {
          await importOneChapter({
            mangaId,
            chapterNumber: currentChapter,
            chapterUrl: url,
            overwriteExisting,
          });

          imported++;
        } catch (e: unknown) {
          failed++;
          const message =
            e instanceof Error ? e.message : "Falha durante a importação.";
          errors.push(`Capítulo ${pad3(currentChapter)}: ${message}`);
        }

        currentChapter++;
      }

      setLinksText("");
      setChapterNumber(currentChapter);
      setProgress(null);

      if (failed === 0) {
        setMsg(`✅ Importados ${imported} capítulos com sucesso.`);
      } else {
        setMsg(
          `✅ Importados: ${imported}\n❌ Falhas: ${failed}\n\n${errors.join("\n")}`
        );
      }
    } catch (e: unknown) {
      console.error(e);

      const message =
        e instanceof Error ? e.message : "Falha durante a importação.";

      setMsg(`❌ ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-lg font-semibold text-cyan-400">
        ⚡ Importador Automático
      </div>

      <label className="block space-y-1">
        <div className="text-sm text-zinc-300">Capítulo inicial</div>
        <input
          type="number"
          min={1}
          value={chapterNumber}
          onChange={(e) => setChapterNumber(Number(e.target.value))}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 p-2 outline-none focus:border-cyan-400"
        />
      </label>

      <label className="block space-y-1">
        <div className="text-sm text-zinc-300">Links dos capítulos</div>
        <textarea
          value={linksText}
          onChange={(e) => setLinksText(e.target.value)}
          rows={6}
          placeholder={`Cole vários links

https://mangaonline.red/manga/titulo/capitulo-1/
https://mangaonline.red/manga/titulo/capitulo-2/
https://mangaonline.red/manga/titulo/capitulo-3/`}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-800 p-2 outline-none focus:border-cyan-400"
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={overwriteExisting}
          onChange={(e) => setOverwriteExisting(e.target.checked)}
        />
        Sobrescrever capítulos existentes
      </label>

      {progress && (
        <div className="rounded border border-cyan-500/30 bg-cyan-500/10 p-2 text-sm text-cyan-300">
          {progress}
        </div>
      )}

      {msg && (
        <div className="whitespace-pre-wrap rounded border border-zinc-700 bg-white/5 p-2 text-sm">
          {msg}
        </div>
      )}

      <button
        onClick={runImport}
        disabled={loading || authLoading}
        className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50"
      >
        {loading ? "Importando capítulos..." : "Importar capítulos"}
      </button>

      <div className="text-[11px] text-zinc-500">
        Cole vários links de capítulos. O sistema importará automaticamente em
        sequência sem depender do Firebase Admin para salvar.
      </div>
    </div>
  );
}