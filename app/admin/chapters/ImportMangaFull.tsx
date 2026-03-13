"use client";

import { useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/admin";

function pad3(n: number) {
  return String(n).padStart(3, "0");
}

type ExistsMode = "skip" | "overwrite";

type ExtractChapterEntry = {
  number: number | null;
  title: string;
  url: string;
};

type ExtractPage = {
  index: number;
  url: string;
};

export default function ImportMangaFull({ mangaId }: { mangaId: string }) {
  const { user, loading: authLoading } = useAuth();

  const [mangaUrl, setMangaUrl] = useState("");
  const [existsMode, setExistsMode] = useState<ExistsMode>("skip");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const [detectedTitle, setDetectedTitle] = useState("");
  const [detectedCover, setDetectedCover] = useState("");
  const [detectedGenre, setDetectedGenre] = useState("");
  const [chapters, setChapters] = useState<ExtractChapterEntry[]>([]);

  const canImport = useMemo(() => {
    return Boolean(mangaId && mangaUrl.trim() && chapters.length > 0);
  }, [mangaId, mangaUrl, chapters.length]);

  async function analyzeManga() {
    setErr(null);
    setOk(null);
    setProgress(null);

    if (authLoading) {
      setErr("⏳ Aguarde, verificando login...");
      return;
    }

    if (!user) {
      setErr("❌ Login necessário.");
      return;
    }

    if (!isAdmin(user.uid)) {
      setErr("❌ Apenas administrador pode usar essa função.");
      return;
    }

    if (!mangaUrl.trim()) {
      setErr("❌ Cole a URL do mangá.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/admin/extract-manga", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mangaUrl: mangaUrl.trim(),
        }),
      });

      const text = await res.text();
      let data: any = null;

      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (!res.ok || !data?.ok) {
        throw new Error(
          data?.error ||
            `Falha ao analisar a obra. Status ${res.status}. Resposta: ${text || "vazia"}`
        );
      }

      setDetectedTitle(data.title || "");
      setDetectedCover(data.cover || "");
      setDetectedGenre(data.genre || "");
      setChapters((data.chapters || []) as ExtractChapterEntry[]);

      setOk(
        `✅ Obra analisada com sucesso. ${data.chaptersCount || 0} capítulos encontrados.`
      );
    } catch (e: unknown) {
      console.error(e);
      const message =
        e instanceof Error ? e.message : "Falha ao analisar o mangá.";
      setErr(`❌ ${message}`);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  }

  async function saveMangaBase() {
    if (!db) {
      throw new Error("Firebase não inicializado.");
    }

    const mangaRef = doc(db, "mangas", mangaId);
    const mangaSnap = await getDoc(mangaRef);

    const payload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
      title: detectedTitle || "Sem título",
      cover: detectedCover || "",
      genre: detectedGenre || "",
      sourceUrl: mangaUrl.trim(),
      sourceHost: (() => {
        try {
          return new URL(mangaUrl.trim()).hostname;
        } catch {
          return "";
        }
      })(),
      autoSync: true,
      syncStatus: "active",
      lastSyncAt: serverTimestamp(),
      lastSyncError: "",
    };

    if (!mangaSnap.exists()) {
      payload.createdAt = serverTimestamp();
      payload.views = 0;
      payload.weekViews = 0;
      payload.dayViews = 0;
      payload.monthViews = 0;
      payload.chaptersCount = 0;
      payload.lastChapterNumber = 0;
    }

    await setDoc(mangaRef, payload, { merge: true });
  }

  async function saveImportedChapterClient(params: {
    mangaId: string;
    chapterNumber: number;
    chapterUrl: string;
    chapterTitle?: string;
    overwriteExisting: boolean;
    pages: ExtractPage[];
  }) {
    const {
      mangaId,
      chapterNumber,
      chapterUrl,
      chapterTitle,
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
      return {
        skipped: true,
        chapterId,
        pagesCount: 0,
      };
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
        return {
          skipped: true,
          chapterId,
          pagesCount: 0,
        };
      }
    }

    const existingData = existingChapterSnap.exists()
      ? existingChapterSnap.data()
      : null;

    await setDoc(
      chapterRef,
      {
        number: chapterNumber,
        title: chapterTitle || `Capítulo ${chapterId}`,
        pagesCount: pages.length,
        pages,
        sourceUrl: chapterUrl,
        views: existingData?.views ?? 0,
        weekViews: existingData?.weekViews ?? 0,
        dayViews: existingData?.dayViews ?? 0,
        monthViews: existingData?.monthViews ?? 0,
        ...(existingChapterSnap.exists()
          ? {}
          : {
              createdAt: serverTimestamp(),
            }),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return {
      skipped: false,
      chapterId,
      pagesCount: pages.length,
    };
  }

  async function importAll() {
    setErr(null);
    setOk(null);
    setProgress(null);

    if (authLoading) {
      setErr("⏳ Aguarde, verificando login...");
      return;
    }

    if (!user) {
      setErr("❌ Login necessário.");
      return;
    }

    if (!isAdmin(user.uid)) {
      setErr("❌ Apenas administrador pode importar capítulos.");
      return;
    }

    if (!db) {
      setErr("❌ Firebase não inicializado.");
      return;
    }

    if (!mangaId) {
      setErr("❌ mangaId ausente.");
      return;
    }

    if (!mangaUrl.trim()) {
      setErr("❌ Cole a URL do mangá.");
      return;
    }

    if (chapters.length === 0) {
      setErr("❌ Analise a obra primeiro.");
      return;
    }

    setLoading(true);

    try {
      await saveMangaBase();

      let importedChapters = 0;
      let skippedChapters = 0;
      let totalPages = 0;
      let maxChapter = 0;

      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        const chapterNumber =
          chapter.number !== null && Number.isFinite(chapter.number)
            ? Math.trunc(chapter.number)
            : i + 1;

        if (!chapterNumber || chapterNumber < 1) {
          skippedChapters++;
          continue;
        }

        setProgress(
          `Importando capítulo ${pad3(chapterNumber)} (${i + 1}/${chapters.length})`
        );

        const extractRes = await fetch("/api/admin/extract-chapter", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chapterUrl: chapter.url,
          }),
        });

        const extractText = await extractRes.text();
        let extractData: any = null;

        try {
          extractData = JSON.parse(extractText);
        } catch {
          extractData = null;
        }

        if (!extractRes.ok || !extractData?.ok) {
          throw new Error(
            `Erro ao extrair ${chapter.title || chapter.url}: ${
              extractData?.error ||
              `status ${extractRes.status} - ${extractText || "resposta vazia"}`
            }`
          );
        }

        const pages = (extractData.pages || []) as ExtractPage[];

        if (!pages.length) {
          skippedChapters++;
          continue;
        }

        const saved = await saveImportedChapterClient({
          mangaId,
          chapterNumber,
          chapterUrl: chapter.url,
          chapterTitle: chapter.title,
          overwriteExisting: existsMode === "overwrite",
          pages,
        });

        if (saved.skipped) {
          skippedChapters++;
          continue;
        }

        importedChapters++;
        totalPages += saved.pagesCount;
        maxChapter = Math.max(maxChapter, chapterNumber);
      }

      const after = await getDocs(collection(db, "mangas", mangaId, "chapters"));
      const realCount = after.size;

      await updateDoc(doc(db, "mangas", mangaId), {
        updatedAt: serverTimestamp(),
        chaptersCount: realCount,
        lastChapterNumber: maxChapter || 0,
        title: detectedTitle || "Sem título",
        cover: detectedCover || "",
        genre: detectedGenre || "",
        sourceUrl: mangaUrl.trim(),
        sourceHost: (() => {
          try {
            return new URL(mangaUrl.trim()).hostname;
          } catch {
            return "";
          }
        })(),
        autoSync: true,
        syncStatus: "active",
        lastSyncAt: serverTimestamp(),
        lastSyncError: "",
      }).catch(() => {});

      setOk(
        `✅ Importação concluída. ${importedChapters} capítulos importados, ${skippedChapters} pulados, ${totalPages} páginas salvas.`
      );
      setProgress(null);
    } catch (e: unknown) {
      console.error(e);
      const message =
        e instanceof Error ? e.message : "Erro ao importar a obra.";
      setErr(`❌ ${message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="text-lg font-semibold">📚 Importar obra por URL</div>

      <label className="block text-sm text-zinc-300">
        URL do mangá
        <input
          value={mangaUrl}
          onChange={(e) => setMangaUrl(e.target.value)}
          placeholder="https://mangaonline.red/manga/the-infinite-mage/"
          className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/70 p-2 outline-none focus:border-cyan-400"
        />
      </label>

      <label className="block text-sm text-zinc-300">
        Se capítulo já existir
        <select
          value={existsMode}
          onChange={(e) => setExistsMode(e.target.value as ExistsMode)}
          className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-800/70 p-2 outline-none focus:border-cyan-400"
        >
          <option value="skip">Pular</option>
          <option value="overwrite">Sobrescrever</option>
        </select>
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <button
          onClick={analyzeManga}
          disabled={loading || authLoading}
          className="w-full rounded-xl border border-cyan-400 bg-transparent p-3 font-bold text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
        >
          {loading ? "Analisando..." : "Analisar obra"}
        </button>

        <button
          onClick={importAll}
          disabled={loading || authLoading || !canImport}
          className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50"
        >
          {loading ? "Importando..." : "Importar tudo agora"}
        </button>
      </div>

      {(detectedTitle || detectedCover || detectedGenre || chapters.length > 0) && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-3">
          <div className="text-sm text-zinc-300">Prévia detectada</div>

          <div className="mt-3 flex gap-4">
            {detectedCover ? (
              <img
                src={detectedCover}
                alt={detectedTitle || "Capa"}
                className="h-28 w-20 rounded-lg object-cover border border-zinc-700"
              />
            ) : (
              <div className="flex h-28 w-20 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-xs text-zinc-500">
                Sem capa
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <div className="text-xs text-zinc-500">Título</div>
                <div className="font-semibold text-zinc-100">
                  {detectedTitle || "Sem título"}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Gênero</div>
                <div className="text-sm text-zinc-300">
                  {detectedGenre || "Não detectado"}
                </div>
              </div>

              <div>
                <div className="text-xs text-zinc-500">Capítulos encontrados</div>
                <div className="text-sm font-semibold text-cyan-300">
                  {chapters.length}
                </div>
              </div>
            </div>
          </div>

          {chapters.length > 0 && (
            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900/40 p-2">
              {chapters.slice(0, 50).map((chapter, index) => {
                const chapterNumber =
                  chapter.number !== null && Number.isFinite(chapter.number)
                    ? Math.trunc(chapter.number)
                    : index + 1;

                return (
                  <div
                    key={`${chapter.url}-${index}`}
                    className="rounded-md border border-zinc-800 bg-black/20 p-2 text-sm"
                  >
                    <div className="font-medium text-zinc-100">
                      {chapter.title || `Capítulo ${pad3(chapterNumber)}`}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {chapter.url}
                    </div>
                  </div>
                );
              })}

              {chapters.length > 50 && (
                <div className="text-xs text-zinc-500">
                  Mostrando 50 de {chapters.length} capítulos detectados.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {progress && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-2 text-sm text-cyan-300">
          {progress}
        </div>
      )}

      {err && (
        <div className="rounded-xl bg-red-500/15 p-2 text-sm text-red-200">
          {err}
        </div>
      )}

      {ok && (
        <div className="rounded-xl bg-green-500/15 p-2 text-sm text-green-200">
          {ok}
        </div>
      )}

      <div className="text-xs text-zinc-400">
        Cole a URL da obra. O sistema vai detectar os capítulos, extrair as
        páginas de cada um e salvar tudo no Firestore usando o usuário admin
        logado.
      </div>
    </div>
  );
}