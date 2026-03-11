export type LevelData = {
  level: number;
  currentLevelXp: number;
  xpToNext: number;
  progressPercent: number;
};

export function xpRequiredForLevel(level: number) {
  if (level <= 1) return 0;

  let total = 0;

  for (let lv = 1; lv < level; lv++) {
    total += 100 + (lv - 1) * 25;
  }

  return total;
}

export function getLevelFromXp(xpTotal: number): LevelData {
  const cappedXp = Math.max(0, xpTotal);

  let level = 1;

  while (level < 99 && cappedXp >= xpRequiredForLevel(level + 1)) {
    level++;
  }

  const levelStart = xpRequiredForLevel(level);
  const nextLevelStart =
    level >= 99 ? levelStart : xpRequiredForLevel(level + 1);
  const currentLevelXp = cappedXp - levelStart;
  const xpToNext = level >= 99 ? 0 : nextLevelStart - cappedXp;
  const neededThisLevel = level >= 99 ? 1 : nextLevelStart - levelStart;
  const progressPercent =
    level >= 99
      ? 100
      : Math.max(0, Math.min(100, (currentLevelXp / neededThisLevel) * 100));

  return {
    level,
    currentLevelXp,
    xpToNext,
    progressPercent,
  };
}

export function xpGainForChapter(isVip = false) {
  return isVip ? 15 : 10;
}