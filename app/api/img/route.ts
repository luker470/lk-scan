// app/api/img/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set<string>([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",

  "via.placeholder.com",

  "mangasonline.blog",
  "www.mangasonline.blog",

  "mangaonline.red",
  "www.mangaonline.red",

  // ✅ permitir imgur (você tinha 403)
  "i.imgur.com",
  "imgur.com",

  "s.w.org",
  "secure.gravatar.com",
]);

function isAllowed(urlStr: string) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function guessContentType(urlStr: string) {
  const clean = urlStr.split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  return "image/jpeg";
}

async function fetchWithTimeout(url: string, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);

  try {
    const u = new URL(url);

    // Referer ajuda nos sites que bloqueiam hotlink
    const referer = `${u.protocol}//${u.host}/`;

    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      // ✅ não-store para sempre buscar do upstream; cache vai ser via headers na resposta
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: referer,
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  // ✅ evita /api/img?url=undefined (vira 400 e não 403)
  if (!url || url === "undefined" || url === "null") {
    return new NextResponse("Missing url", { status: 400 });
  }

  if (!isAllowed(url)) return new NextResponse("Host not allowed", { status: 403 });

  try {
    let res = await fetchWithTimeout(url, 20000);

    if (!res.ok) {
      // retry simples
      res = await fetchWithTimeout(url, 20000);
    }

    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.status}`, { status: 502 });
    }

    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || guessContentType(url);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        // ✅ cache: browser 1 dia, CDN 7 dias, revalida suave
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Proxy fetch failed", { status: 504 });
  }
}