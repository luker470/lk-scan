import { getLevelFromXp } from "@/lib/levels";
import { getTitleByLevel } from "@/lib/titles";

export function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getDayKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function buildUpdatedUserProgress(currentData: any, earnedXp: number) {
  const currentXpTotal = safeNumber(currentData?.xpTotal, 0);
  const currentChaptersRead = safeNumber(currentData?.chaptersRead, 0);
  const currentMangaStarted = safeNumber(currentData?.mangaStarted, 0);
  const currentMangaCompleted = safeNumber(currentData?.mangaCompleted, 0);

  const xpTotal = currentXpTotal + safeNumber(earnedXp, 0);
  const chaptersRead = currentChaptersRead + 1;

  const levelData = getLevelFromXp(xpTotal);
  const title = getTitleByLevel(levelData.level);

  return {
    xpTotal,
    xp: levelData.currentLevelXp,
    level: levelData.level,
    xpToNext: levelData.xpToNext,
    progressPercent: levelData.progressPercent,
    chaptersRead,
    mangaStarted: currentMangaStarted,
    mangaCompleted: currentMangaCompleted,
    rankScore: xpTotal,
    title,
  };
}