import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { sanitizeMangaTitle, slugify } from "@/lib/discovery";
import { fetchMangaDetails } from "@/lib/mangaDetails";
import { buildMangaIdentity, findExistingMangaByIdentity } from "@/lib/mangaIdentity";
import { buildPrimaryAndBackups, getAllCandidateSourceUrls } from "@/lib/sourceResolver";

export async function normalizeAndUpsertManga(
  db: Firestore,
  input: {
    title?: string;
    sourceUrl?: string;
    cover?: string;
    description?: string;
    genres?: string[];
    latestChapter?: string;
    sourceSite?: string;
  }
) {
  const details = input.sourceUrl
    ? await fetchMangaDetails(input.sourceUrl).catch(() => null)
    : null;

  const finalTitle = sanitizeMangaTitle(
    details?.title || input.title || "",
    input.sourceUrl || ""
  );

  const identity = buildMangaIdentity({
    title: finalTitle,
    sourceUrl: input.sourceUrl,
  });

  const existing = await findExistingMangaByIdentity(db, {
    title: finalTitle,
    sourceUrl: input.sourceUrl,
  });

  const mangaId = existing?.id || identity.slug;
  const currentData = (existing?.data || {}) as Record<string, any>;

  const allCandidateUrls = [
    ...(input.sourceUrl ? [input.sourceUrl] : []),
    ...getAllCandidateSourceUrls(currentData),
  ].filter(Boolean);

  const sourceBuild = buildPrimaryAndBackups(
    input.sourceUrl ||
      currentData?.primarySourceUrl ||
      currentData?.sourceUrl ||
      "",
    Array.isArray(currentData?.backupSources) ? currentData.backupSources : [],
    allCandidateUrls
  );

  const aliases = [
    ...(Array.isArray(currentData?.aliases) ? currentData.aliases : []),
    currentData?.title,
    finalTitle,
    input.title,
    details?.title,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  const payload = {
    title: finalTitle,
    slug: identity.slug,
    normalizedTitle: identity.normalizedTitle,
    aliases: [...new Set(aliases)],
    cover: details?.cover || input.cover || currentData?.cover || "",
    banner:
      details?.banner ||
      details?.cover ||
      input.cover ||
      currentData?.banner ||
      currentData?.cover ||
      "",
    description:
      details?.description ||
      input.description ||
      currentData?.description ||
      "",
    genre:
      (details?.genres?.length ? details.genres.join(", ") : "") ||
      (Array.isArray(input.genres) ? input.genres.join(", ") : "") ||
      currentData?.genre ||
      "",
    status: details?.status || currentData?.status || "Em andamento",
    author: details?.author || currentData?.author || "",
    artist: details?.artist || currentData?.artist || "",
    sourceUrl: input.sourceUrl || currentData?.sourceUrl || "",
    sourceSite: input.sourceSite || currentData?.sourceSite || "",
    sourceHost:
      details?.sourceHost ||
      currentData?.sourceHost ||
      (() => {
        try {
          return new URL(String(input.sourceUrl || currentData?.sourceUrl || "")).hostname;
        } catch {
          return "";
        }
      })(),
    primarySourceUrl: sourceBuild.primarySourceUrl,
    primarySourceHost: sourceBuild.primarySourceHost,
    backupSources: sourceBuild.backupSources,
    latestChapter: input.latestChapter || currentData?.latestChapter || "",
    autoSync: true,
    syncEnabled: true,
    sourceHealth: currentData?.sourceHealth || "unknown",
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = db.collection("mangas").doc(mangaId);

  if (!existing) {
    await ref.set({
      ...payload,
      views: 0,
      chaptersCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set(payload, { merge: true });
  }

  return {
    mangaId,
    created: !existing,
    payload,
  };
}

export async function normalizeAllExistingMangas(db: Firestore) {
  const snap = await db.collection("mangas").get();

  const results: Array<{
    mangaId: string;
    title: string;
    ok: boolean;
    error?: string;
  }> = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, any>;

    try {
      await normalizeAndUpsertManga(db, {
        title: String(data?.title || ""),
        sourceUrl: String(data?.sourceUrl || data?.primarySourceUrl || ""),
        cover: String(data?.cover || ""),
        description: String(data?.description || ""),
        genres:
          typeof data?.genre === "string"
            ? data.genre.split(",").map((s: string) => s.trim())
            : [],
        latestChapter: String(data?.latestChapter || ""),
        sourceSite: String(data?.sourceSite || ""),
      });

      results.push({
        mangaId: doc.id,
        title: String(data?.title || ""),
        ok: true,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Erro ao normalizar mangá.";

      results.push({
        mangaId: doc.id,
        title: String(data?.title || ""),
        ok: false,
        error: message,
      });
    }
  }

  return {
    total: results.length,
    okCount: results.filter((item) => item.ok).length,
    errorCount: results.filter((item) => !item.ok).length,
    results,
  };
}