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
    const referer = `${u.protocol}//${u.host}/`;

    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: referer,
        Origin: `${u.protocol}//${u.host}`,
      },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const mirrorUrl = searchParams.get("mirrorUrl");

  const finalUrl = (mirrorUrl || url || "").trim();

  if (!finalUrl || finalUrl === "undefined" || finalUrl === "null") {
    return new NextResponse("Missing url", { status: 400 });
  }

  if (!isAllowed(finalUrl)) {
    return new NextResponse("Host not allowed", { status: 403 });
  }

  try {
    let res = await fetchWithTimeout(finalUrl, 20000);

    if (!res.ok) {
      res = await fetchWithTimeout(finalUrl, 20000);
    }

    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.status}`, { status: 502 });
    }

    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || guessContentType(finalUrl);

    return new NextResponse(buf, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new NextResponse("Proxy fetch failed", { status: 504 });
  }
}