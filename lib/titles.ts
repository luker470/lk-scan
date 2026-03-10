export function getTitleByLevel(level: number) {
  if (level >= 99) return "Deus da Leitura";
  if (level >= 80) return "Lenda dos Manhwas";
  if (level >= 60) return "Monarca da Leitura";
  if (level >= 40) return "Lorde dos Mangás";
  if (level >= 20) return "Veterano da Biblioteca";
  if (level >= 10) return "Caçador de Capítulos";
  return "Leitor Iniciante";
}

export function getVipBadge(vipTier?: string | null) {
  if (!vipTier) return null;

  if (vipTier === "founder") return "Founder";
  if (vipTier === "diamond") return "VIP Diamond";
  if (vipTier === "gold") return "VIP Gold";
  if (vipTier === "bronze") return "VIP Bronze";

  return "VIP";
}
