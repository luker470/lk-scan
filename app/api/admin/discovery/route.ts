import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { discoverFromSource } from "@/lib/discoveryScraper";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { slugify, type DiscoverySourceKey } from "@/lib/discovery";
import { ADMIN_UID } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthed(req: NextRequest) {
  const uid = req.headers.get("x-user-id");
  const token = req.headers.get("x-admin-token");
  const envToken = process.env.ADMIN_SYNC_TOKEN;

  if (uid && uid === ADMIN_UID) return true;
  if (token && envToken && token === envToken) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const snap = await db
      .collection("discovered_mangas")
      .orderBy("updatedAt", "desc")
      .limit(200)
      .get();

    const items = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ items });
  } catch (error: unknown) {
    console.error("GET /api/admin/discovery error:", error);

    const message =
      error instanceof Error ? error.message : "Erro ao listar descobertos.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const source = body?.source as DiscoverySourceKey | undefined;

    if (!source) {
      return NextResponse.json(
        { error: "Fonte não informada." },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    if (!db) {
      return NextResponse.json(
        { error: "Firebase Admin não configurado." },
        { status: 500 }
      );
    }

    const discovered = await discoverFromSource(source);

    let saved = 0;

    for (const item of discovered) {
      const id = `${item.source}__${slugify(item.title)}__${slugify(item.url)}`.slice(
        0,
        180
      );

      const existing = await db.collection("discovered_mangas").doc(id).get();

      const payload = {
        source: item.source,
        title: item.title,
        url: item.url,
        cover: item.cover || "",
        latestChapter: item.latestChapter || "",
        description: item.description || "",
        genres: item.genres || [],
        approved: existing.data()?.approved || false,
        createdAt: existing.exists
          ? existing.data()?.createdAt || FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await db.collection("discovered_mangas").doc(id).set(payload, { merge: true });
      saved++;
    }

    return NextResponse.json({
      ok: true,
      totalFound: discovered.length,
      totalSaved: saved,
    });
  } catch (error: unknown) {
    console.error("POST /api/admin/discovery error:", error);

    const message =
      error instanceof Error ? error.message : "Erro na descoberta automática.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
