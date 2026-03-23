"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import ReaderPro from "@/components/ReaderPro";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { proxifyImage } from "@/lib/imgProxy";

type ChapterClientProps = {
  mangaId: string;
  chapterId: string;
};

type ChapterPageInput =
  | string
  | {
      url?: string;
      src?: string;
      mirrorUrl?: string;
      storageUrl?: string;
    };

type MangaDoc = {
  title?: string;
  cover?: string;
  banner?: string;
  genre?: string;
  description?: string;
  synopsis?: string;
  views?: number;
};

type ChapterDoc = {
  id: string;
  title?: string;
  number?: number;
  slug?: string;
  sourceUrl?: string;
  pages?: ChapterPageInput[];
  images?: ChapterPageInput[];
  pagesCount?: number;
  pageCount?: number;
  createdAt?: any;
  updatedAt?: any;
};

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildChapterTitle(chapter: ChapterDoc | null) {
  if (!chapter) return "Capítulo";

  if (chapter.title?.trim()) return chapter.title.trim();

  const n = safeNumber(chapter.number, NaN);
  if (Number.isFinite(n)) return `Capítulo ${n}`;

  return "Capítulo";
}

function resolvePages(chapter: ChapterDoc | null): ChapterPageInput[] {
  if (!chapter) return [];

  if (Array.isArray(chapter.pages) && chapter.pages.length > 0) {
    return chapter.pages;
  }

  if (Array.isArray(chapter.images) && chapter.images.length > 0) {
    return chapter.images;
  }

  return [];
}

function getChapterPagesCount(chapter: ChapterDoc | null) {
  if (!chapter) return 0;
  return safeNumber(chapter.pagesCount ?? chapter.pageCount ?? resolvePages(chapter).length, 0);
}

export default function ChapterClient({
  mangaId,
  chapterId,
}: ChapterClientProps) {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [manga, setManga] = useState<MangaDoc | null>(null);
  const [chapter, setChapter] = useState<ChapterDoc | null>(null);
  const [allChapters, setAllChapters] = useState<ChapterDoc[]>([]);

  const chapterTitle = useMemo(() => buildChapterTitle(chapter), [chapter]);
  const pages = useMemo(() => resolvePages(chapter), [chapter]);

  const orderedChapters = useMemo(() => {
    return [...allChapters].sort((a, b) => {
      const an = safeNumber(a.number, 0);
      const bn = safeNumber(b.number, 0);

      if (an !== bn) return an - bn;

      return String(a.id).localeCompare(String(b.id));
    });
  }, [allChapters]);

  const currentIndex = useMemo(() => {
    return orderedChapters.findIndex((item) => item.id === chapterId);
  }, [orderedChapters, chapterId]);

  const prevChapter =
    currentIndex > 0 ? orderedChapters[currentIndex - 1] : null;

  const nextChapter =
    currentIndex >= 0 && currentIndex < orderedChapters.length - 1
      ? orderedChapters[currentIndex + 1]
      : null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!db) {
        setError("Firebase não inicializado.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const mangaRef = doc(db, "mangas", mangaId);
        const chapterRef = doc(db, "mangas", mangaId, "chapters", chapterId);

        const [mangaSnap, chapterSnap, chaptersSnap] = await Promise.all([
          getDoc(mangaRef),
          getDoc(chapterRef),
          getDocs(
            query(
              collection(db, "mangas", mangaId, "chapters"),
              orderBy("number", "asc")
            )
          ).catch(async () => {
            return getDocs(collection(db, "mangas", mangaId, "chapters"));
          }),
        ]);

        if (cancelled) return;

        if (!mangaSnap.exists()) {
          setError("Mangá não encontrado.");
          setLoading(false);
          return;
        }

        if (!chapterSnap.exists()) {
          setError("Capítulo não encontrado.");
          setLoading(false);
          return;
        }

        const mangaData = mangaSnap.data() as MangaDoc;

        const chapterData = {
          id: chapterSnap.id,
          ...(chapterSnap.data() as Omit<ChapterDoc, "id">),
        };

        const chaptersData = chaptersSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<ChapterDoc, "id">),
        }));

        setManga(mangaData);
        setChapter(chapterData);
        setAllChapters(chaptersData);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Erro ao carregar capítulo.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [mangaId, chapterId]);

  useEffect(() => {
    let cancelled = false;

    async function registerViewAndHistory() {
      if (!mangaId || !chapterId || !chapter || !manga) return;

      try {
        await fetch("/api/views", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mangaId,
            chapterId,
            uid: user?.uid || "",
          }),
        });

        if (user?.uid) {
          await fetch("/api/history", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              uid: user.uid,
              mangaId,
              chapterId,
              mangaTitle: manga.title || "",
              mangaCover: manga.cover || "",
              chapterTitle,
              chapterNumber: safeNumber(chapter.number, 0),
            }),
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erro ao registrar leitura:", err);
        }
      }
    }

    if (!loading && !error && chapter && manga) {
      registerViewAndHistory();
    }

    return () => {
      cancelled = true;
    };
  }, [loading, error, chapter, manga, mangaId, chapterId, chapterTitle, user?.uid]);

  const bannerSrc = proxifyImage(manga?.banner || manga?.cover);
  const pagesCount = getChapterPagesCount(chapter);
  const descriptionText = manga?.description?.trim() || manga?.synopsis?.trim() || "";

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-zinc-300">
            Carregando capítulo...
          </div>
        </div>
      </main>
    );
  }

  if (error || !chapter || !manga) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-6xl px-4 py-8 space-y-4">
          <div className="rounded-2xl border border-red-800 bg-red-500/10 p-6 text-red-300">
            {error || "Não foi possível carregar o capítulo."}
          </div>

          <Link
            href={mangaId ? `/manga/${mangaId}` : "/"}
            className="inline-flex rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            Voltar
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-3 py-4 md:px-4 md:py-6 space-y-5">
        <section className="rounded-3xl overflow-hidden border border-zinc-800 bg-zinc-900/50">
          {bannerSrc ? (
            <div className="relative h-36 md:h-52 w-full overflow-hidden">
              <img
                src={bannerSrc}
                alt={manga.title || "Mangá"}
                className="h-full w-full object-cover opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
            </div>
          ) : null}

          <div className="p-4 md:p-6 space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <Link
                  href={`/manga/${mangaId}`}
                  className="inline-flex text-sm text-cyan-300 hover:text-cyan-200 transition"
                >
                  ← Voltar para a obra
                </Link>

                <h1 className="text-xl md:text-3xl font-extrabold text-cyan-400">
                  {manga.title || "Mangá"}
                </h1>

                <div className="text-sm md:text-base text-zinc-300">
                  {chapterTitle}
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="rounded-full border border-zinc-700 px-3 py-1">
                    {pagesCount} páginas
                  </span>

                  {typeof chapter.number !== "undefined" ? (
                    <span className="rounded-full border border-zinc-700 px-3 py-1">
                      Cap. {chapter.number}
                    </span>
                  ) : null}

                  {manga.genre ? (
                    <span className="rounded-full border border-zinc-700 px-3 py-1">
                      {manga.genre}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {prevChapter ? (
                  <Link
                    href={`/manga/${mangaId}/chapter/${prevChapter.id}`}
                    className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
                  >
                    ◀ Capítulo anterior
                  </Link>
                ) : null}

                {nextChapter ? (
                  <Link
                    href={`/manga/${mangaId}/chapter/${nextChapter.id}`}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-black hover:bg-cyan-400 transition"
                  >
                    Próximo capítulo ▶
                  </Link>
                ) : null}
              </div>
            </div>

            {descriptionText ? (
              <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4 text-sm text-zinc-300 leading-6">
                {descriptionText}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-3 md:p-4">
          <ReaderPro
            pages={pages}
            storageKey={`lk-reader:${mangaId}:${chapterId}`}
          />
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-zinc-400">
              Navegação rápida entre capítulos
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/manga/${mangaId}`}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Ver obra
              </Link>

              {prevChapter ? (
                <Link
                  href={`/manga/${mangaId}/chapter/${prevChapter.id}`}
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
                >
                  ◀ Anterior
                </Link>
              ) : null}

              {nextChapter ? (
                <Link
                  href={`/manga/${mangaId}/chapter/${nextChapter.id}`}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-black hover:bg-cyan-400 transition"
                >
                  Próximo ▶
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}