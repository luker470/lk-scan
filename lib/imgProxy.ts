export function proxifyImage(url?: string | null) {
  const clean = typeof url === "string" ? url.trim() : "";

  if (!clean) return null;

  if (
    clean.startsWith("/api/img?url=") ||
    clean.startsWith("/") ||
    clean.startsWith("data:") ||
    clean.startsWith("blob:")
  ) {
    return clean;
  }

  return `/api/img?url=${encodeURIComponent(clean)}`;
}