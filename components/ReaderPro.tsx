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

function resolvePageUrl(page: ReaderPageInput): string {
  if (typeof page === "string") return page;

  return (
    String(page?.mirrorUrl || "").trim() ||
    String(page?.storageUrl || "").trim() ||
    String(page?.url || "").trim() ||
    String(page?.src || "").trim()
  );
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
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  const proxied = useMemo(() => {
    return pages
      .map((page, originalIndex) => {
        const raw = resolvePageUrl(page);
        if (!raw) return null;

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
      .filter(
        (
          item
        ): item is {
          raw: string;
          src: string;
          originalIndex: number;
          pageNumber: number;
          isMirror: boolean;
        } => item !== null
      );
  }, [pages]);

  useEffect(() => {
    if (!storageKey) return;
    const v = localStorage.getItem(storageKey);
    const n = v ? Number(v) : 0;
    if (n && n >= 1 && n <= proxied.length) setCurrent(n);
  }, [storageKey, proxied.length]);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, String(current));
  }, [current, storageKey]);

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
        setCurrent(idx);
      },
      { threshold: [0.2, 0.4, 0.6, 0.8] }
    );

    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [proxied.length]);

  function scrollToPage(n: number) {
    const safePage = Math.max(1, Math.min(n, proxied.length || 1));
    const el = refs.current[safePage - 1];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (proxied.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-zinc-300">
        Nenhuma página válida encontrada para este capítulo.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="sticky top-[72px] z-10 rounded-2xl border border-zinc-800 bg-black/70 backdrop-blur p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-zinc-300">
          Página <b className="text-zinc-100">{current}</b> / {proxied.length}
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
        </div>
      </div>

      <div className="space-y-4">
        {proxied.map((item, i) => {
          const idx = i + 1;

          return (
            <div
              key={`${item.src}-${i}`}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-idx={idx}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
            >
              <div className="px-3 py-2 text-xs text-zinc-400 border-b border-zinc-800 flex items-center justify-between gap-2">
                <span>Página {item.pageNumber}</span>
                {item.isMirror ? (
                  <span className="text-cyan-400 font-semibold">Mirror</span>
                ) : null}
              </div>

              <div className="flex justify-center bg-black">
                <img
                  src={item.src}
                  alt={`Página ${item.pageNumber}`}
                  loading={idx <= 2 ? "eager" : "lazy"}
                  className={
                    mode === "fitWidth"
                      ? "w-full h-auto"
                      : "h-[85vh] w-auto object-contain"
                  }
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement;
                    const old = img.src;

                    if (old.includes("retry=1")) return;

                    img.src = old.includes("?") ? `${old}&retry=1` : `${old}?retry=1`;
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}