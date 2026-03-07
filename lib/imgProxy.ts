// lib/imgProxy.ts
export function proxifyImage(url?: string | null) {
  const clean = typeof url === "string" ? url.trim() : "";
  if (!clean) return null;
  return `/api/img?url=${encodeURIComponent(clean)}`;
}