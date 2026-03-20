"use client";

import Link from "next/link";

type ChapterItem = {
  id: string;
  chapterId: string;
  chapterNumber?: number | string;
  chapterTitle?: string;
};

type MangaItem = {
  id: string;
  title: string;
  cover?: string;
  slug?: string;
  latestChapters?: ChapterItem[];
};

type RankingItem = {
  id: string;
  title: string;
  cover?: string;
  views?: number;
  slug?: string;
};

type Props = {
  featured: MangaItem[];
  latestUpdates: MangaItem[];
  rankingToday: RankingItem[];
  rankingWeek: RankingItem[];
  rankingMonth: RankingItem[];
  rankingAll: RankingItem[];
};

function getChapterLabel(chapter?: ChapterItem) {
  if (!chapter) return "Cap.";
  if (chapter.chapterTitle?.trim()) return chapter.chapterTitle;
  if (chapter.chapterNumber !== undefined && chapter.chapterNumber !== null) {
    return `Cap.${chapter.chapterNumber}`;
  }
  return "Cap.";
}

export default function HomeMobileSections({
  featured,
  latestUpdates,
  rankingToday,
  rankingWeek,
  rankingMonth,
  rankingAll,
}: Props) {
  const tabs = [
    { key: "today", label: "Hoje", items: rankingToday },
    { key: "week", label: "Semana", items: rankingWeek },
    { key: "month", label: "Mês", items: rankingMonth },
    { key: "all", label: "Geral", items: rankingAll },
  ] as const;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* LANÇAMENTOS */}
      <section className="rounded-3xl border border-white/10 bg-[#140a2b] p-3 shadow-[0_0_30px_rgba(139,92,246,0.10)] md:p-5">
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">
          Lançamentos
        </h2>

        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3">
            {featured.length > 0 ? (
              featured.map((item) => (
                <Link
                  key={item.id}
                  href={`/manga/${item.id}`}
                  className="min-w-[150px] max-w-[150px] rounded-2xl border border-white/10 bg-[#1b1037] p-2 transition hover:scale-[1.02]"
                >
                  <div className="aspect-[3/4] overflow-hidden rounded-xl bg-[#24124a]">
                    {item.cover ? (
                      <img
                        src={item.cover}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                        Sem capa
                      </div>
                    )}
                  </div>

                  <div className="mt-2 line-clamp-2 min-h-[40px] text-sm font-bold text-white">
                    {item.title}
                  </div>

                  <div className="mt-2">
                    <span className="inline-flex rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white">
                      Ler
                    </span>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-zinc-400">
                Nenhum lançamento encontrado.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RANKING */}
      <section className="rounded-3xl border border-white/10 bg-[#140a2b] p-4 shadow-[0_0_30px_rgba(139,92,246,0.10)] md:p-5">
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">
          Ranking
        </h2>

        <div className="tabs tabs-boxed mb-4 flex gap-2 overflow-x-auto bg-transparent p-0">
          {tabs.map((tab, index) => (
            <input
              key={tab.key}
              type="radio"
              name="ranking_tabs"
              className="tab rounded-2xl border-0 bg-[#24124a] px-4 py-3 font-bold text-[#b89cff] [--tab-bg:#24124a] [--tab-border-color:transparent] checked:bg-violet-600 checked:text-white"
              aria-label={tab.label}
              defaultChecked={index === 0}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-white/5 bg-[#10081f] p-3">
          {rankingToday.length === 0 ? (
            <div className="py-8 text-lg text-zinc-400">Sem dados</div>
          ) : (
            <div className="space-y-3">
              {rankingToday.slice(0, 5).map((item, index) => (
                <Link
                  key={item.id}
                  href={`/manga/${item.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-[#1b1037] p-2"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-sm font-extrabold text-white">
                    {index + 1}
                  </span>

                  <div className="h-14 w-11 overflow-hidden rounded-lg bg-[#24124a]">
                    {item.cover ? (
                      <img
                        src={item.cover}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">
                        Sem capa
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-white">
                      {item.title}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {item.views ?? 0} views
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ÚLTIMAS ATUALIZAÇÕES */}
      <section>
        <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-white">
          Últimas Atualizações
        </h2>

        <div className="space-y-4">
          {latestUpdates.length > 0 ? (
            latestUpdates.map((item) => {
              const latest1 = item.latestChapters?.[0];
              const latest2 = item.latestChapters?.[1];

              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-white/10 bg-[#140a2b] p-4 shadow-[0_0_30px_rgba(139,92,246,0.08)]"
                >
                  <div className="flex gap-4">
                    <Link
                      href={`/manga/${item.id}`}
                      className="h-[150px] w-[110px] shrink-0 overflow-hidden rounded-2xl bg-[#24124a]"
                    >
                      {item.cover ? (
                        <img
                          src={item.cover}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                          Sem capa
                        </div>
                      )}
                    </Link>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/manga/${item.id}`}
                        className="line-clamp-2 text-2xl font-extrabold leading-tight text-white"
                      >
                        {item.title}
                      </Link>

                      <div className="mt-4 space-y-3">
                        {latest1 && (
                          <Link
                            href={`/manga/${item.id}/chapter/${latest1.chapterId}`}
                            className="flex items-center justify-between rounded-2xl bg-[#24124a] px-4 py-3"
                          >
                            <span className="text-lg font-bold text-white">
                              {getChapterLabel(latest1)}
                            </span>
                            <span className="rounded-xl bg-violet-600 px-3 py-1 text-sm font-extrabold text-white shadow-[0_0_20px_rgba(139,92,246,0.6)]">
                              NOVO
                            </span>
                          </Link>
                        )}

                        {latest2 && (
                          <Link
                            href={`/manga/${item.id}/chapter/${latest2.chapterId}`}
                            className="flex items-center justify-between rounded-2xl bg-[#24124a] px-4 py-3"
                          >
                            <span className="text-lg font-bold text-white">
                              {getChapterLabel(latest2)}
                            </span>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-3xl border border-white/10 bg-[#140a2b] p-4 text-zinc-400">
              Nenhuma atualização encontrada.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
