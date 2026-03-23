"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { proxifyImage } from "@/lib/imgProxy";

type ReaderPageInput =
  | string
  | {
      url?: string;
      src?: string;
      mirrorUrl?: string;
      storageUrl?: string;
    };

type ResolvedReaderPage = {
  raw: string;
  src: string;
  originalIndex: number;
  pageNumber: number;
  isMirror: boolean;
};

function resolvePageUrl(page: ReaderPageInput): string {
  if (typeof page === "string") return page.trim();

  return (
    String(page?.mirrorUrl || "").trim() ||
    String(page?.storageUrl || "").trim() ||
    String(page?.url || "").trim() ||
    String(page?.src || "").trim()
  );
}

function normalizeUrl(url: string) {
  return url
    .trim()
    .replace(/^http:\/\//i, "https://")
    .replace(/[?#].*$/, "");
}

function buildResolvedPages(pages: ReaderPageInput[]): ResolvedReaderPage[] {
  const seen = new Set<string>();

  return pages
    .map((page, originalIndex) => {
      const raw = resolvePageUrl(page);
      if (!raw) return null;

      const uniqueKey = normalizeUrl(raw);
      if (!uniqueKey || seen.has(uniqueKey)) return null;
      seen.add(uniqueKey);

      const src = proxifyImage(raw);
      if (!src) return null;

      return {
        raw,
        src,
        originalIndex,
        pageNumber: originalIndex + 1,
        isMirror:
          raw.includes("storage.googleapis.com") ||
          raw.includes("firebasestorage.googleapis.com"),
      };
    })
    .filter((item): item is ResolvedReaderPage => item !== null);
}

export default function ReaderPro({
  pages,
  storageKey,
}: {
  pages: ReaderPageInput[];
  storageKey?: string;
}) {
  const [mode, setMode] = useState<"fitWidth" | "fitHeight">("fitWidth");
  const [current, setCurrent] = useState(1);
  const [hiddenPages, setHiddenPages] = useState<number[]>([]);
  const [failedPages, setFailedPages] = useState<number[]>([]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const proxied = useMemo(() => buildResolvedPages(pages), [pages]);

  const visiblePages = useMemo(() => {
    return proxied.filter((_, index) => !hiddenPages.includes(index + 1));
  }, [proxied, hiddenPages]);

  useEffect(() => {
    if (!storageKey) return;

    const v = localStorage.getItem(storageKey);
    const n = v ? Number(v) : 0;

    if (n && n >= 1 && n <= Math.max(visiblePages.length, 1)) {
      setCurrent(n);
    } else {
      setCurrent(1);
    }
  }, [storageKey, visiblePages.length]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, String(current));
  }, [current, storageKey]);

  useEffect(() => {
    refs.current = refs.current.slice(0, visiblePages.length);
  }, [visiblePages.length]);

  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLDivElement[];
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];

        if (!vis) return;

        const idx = Number((vis.target as HTMLElement).dataset.idx || 1);
        if (idx >= 1) setCurrent(idx);
      },
      {
        threshold: [0.2, 0.4, 0.6, 0.8],
        rootMargin: "0px 0px -10% 0px",
      }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [visiblePages.length]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        scrollToPage(current - 1);
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        scrollToPage(current + 1);
      }

      if (e.key.toLowerCase() === "w") {
        e.preventDefault();
        setMode("fitWidth");
      }

      if (e.key.toLowerCase() === "h") {
        e.preventDefault();
        setMode("fitHeight");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, visiblePages.length]);

  function scrollToPage(n: number) {
    const safePage = Math.max(1, Math.min(n, visiblePages.length || 1));
    const el = refs.current[safePage - 1];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setCurrent(safePage);
    }
  }

  function hidePage(pageIndex: number) {
    setHiddenPages((prev) => {
      if (prev.includes(pageIndex)) return prev;
      const next = [...prev, pageIndex].sort((a, b) => a - b);
      return next;
    });
  }

  function restoreAllHiddenPages() {
    setHiddenPages([]);
    setFailedPages([]);
    setTimeout(() => scrollToPage(1), 50);
  }

  function markPageAsFailed(pageIndex: number) {
    setFailedPages((prev) => (prev.includes(pageIndex) ? prev : [...prev, pageIndex]));
  }

  function unmarkPageAsFailed(pageIndex: number) {
    setFailedPages((prev) => prev.filter((item) => item !== pageIndex));
  }

  if (proxied.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-300">
        Nenhuma página válida encontrada para este capítulo.
      </div>
    );
  }

  if (visiblePages.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-300">
          Todas as páginas foram ocultadas. Você pode restaurar tudo abaixo.
        </div>

        <button
          onClick={restoreAllHiddenPages}
          className="px-4 py-3 rounded-xl border border-cyan-400 text-cyan-300 hover:bg-cyan-500/10 transition font-semibold"
        >
          Restaurar páginas ocultadas
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="sticky top-[72px] z-10 rounded-2xl border border-zinc-800 bg-black/70 backdrop-blur p-3 flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-300">
            Página <b className="text-zinc-100">{current}</b> / {visiblePages.length}
            <span className="ml-2 text-zinc-500">
              ({proxied.length} capturadas{hiddenPages.length ? ` • ${hiddenPages.length} ocultadas` : ""})
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setMode("fitWidth")}
              className={`px-3 py-2 rounded-xl border text-sm font-semibold transition ${
                mode === "fitWidth"
                  ? "border-cyan-400 text-cyan-300 bg-cyan-500/10"
                  : "border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
              }`}
            >
              Ajustar largura
            </button>

            <button
              onClick={() => setMode("fitHeight")}
              className={`px-3 py-2 rounded-xl border text-sm font-semibold transition ${
                mode === "fitHeight"
                  ? "border-cyan-400 text-cyan-300 bg-cyan-500/10"
                  : "border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300"
              }`}
            >
              Ajustar altura
            </button>

            <button
              onClick={() => scrollToPage(current - 1)}
              className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition text-sm font-semibold"
            >
              ◀︎ Anterior
            </button>

            <button
              onClick={() => scrollToPage(current + 1)}
              className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition text-sm font-semibold"
            >
              Próxima ▶︎
            </button>

            {hiddenPages.length > 0 ? (
              <button
                onClick={restoreAllHiddenPages}
                className="px-3 py-2 rounded-xl border border-amber-600 text-amber-300 hover:bg-amber-500/10 transition text-sm font-semibold"
              >
                Restaurar ocultadas
              </button>
            ) : null}
          </div>
        </div>

        <div className="text-xs text-zinc-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>Teclas: ← / → para navegar</span>
          <span>W = largura</span>
          <span>H = altura</span>
        </div>
      </div>

      <div className="space-y-4">
        {visiblePages.map((item, i) => {
          const visibleIndex = i + 1;
          const originalIndex = item.originalIndex + 1;
          const failed = failedPages.includes(visibleIndex);

          return (
            <div
              key={`${item.src}-${i}`}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-idx={visibleIndex}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
            >
              <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-wrap items-center gap-2">
                  <span>Página {visibleIndex}</span>

                  {originalIndex !== visibleIndex ? (
                    <span className="rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400">
                      original {originalIndex}
                    </span>
                  ) : null}

                  {item.isMirror ? (
                    <span className="text-cyan-400 font-semibold">Mirror</span>
                  ) : null}

                  {failed ? (
                    <span className="text-red-400 font-semibold">Falha detectada</span>
                  ) : null}
                </div>

                <button
                  onClick={() => hidePage(visibleIndex)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-amber-500 hover:text-amber-300 transition"
                >
                  Ocultar página
                </button>
              </div>

              <div className="flex justify-center bg-black">
                <img
                  src={item.src}
                  alt={`Página ${visibleIndex}`}
                  loading={visibleIndex <= 2 ? "eager" : "lazy"}
                  className={
                    mode === "fitWidth"
                      ? "w-full h-auto"
                      : "h-[85vh] w-auto object-contain"
                  }
                  onLoad={() => unmarkPageAsFailed(visibleIndex)}
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    const old = img.src;

                    if (!old.includes("retry=1")) {
                      img.src = old.includes("?") ? `${old}&retry=1` : `${old}?retry=1`;
                      return;
                    }

                    markPageAsFailed(visibleIndex);
                  }}
                />
              </div>

              {failed ? (
                <div className="border-t border-zinc-800 bg-red-500/5 px-3 py-3 text-sm text-red-300 flex flex-wrap gap-2 items-center justify-between">
                  <span>Essa página falhou no carregamento. Você pode ocultá-la ou tentar recarregar a página.</span>
                  <button
                    onClick={() => hidePage(visibleIndex)}
                    className="rounded-lg border border-red-700 px-3 py-1 text-xs font-semibold hover:bg-red-500/10 transition"
                  >
                    Ocultar página com erro
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}