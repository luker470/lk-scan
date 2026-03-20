import { type Firestore } from "firebase-admin/firestore";
import { slugify, sanitizeMangaTitle } from "@/lib/discovery";

export type MangaIdentityInput = {
  title?: string | null;
  sourceUrl?: string | null;
};

export function normalizeTitleForIdentity(title?: string | null) {
  return sanitizeMangaTitle(title || "", "").toLowerCase().trim();
}

export function buildMangaIdentity(input: MangaIdentityInput) {
  const cleanTitle = sanitizeMangaTitle(input.title || "", input.sourceUrl || "");
  const normalizedTitle = normalizeTitleForIdentity(cleanTitle);
  const slug = slugify(cleanTitle || "sem-titulo");

  return {
    cleanTitle,
    normalizedTitle,
    slug,
    sourceUrl: String(input.sourceUrl || "").trim(),
  };
}

function sameUrl(a?: string | null, b?: string | null) {
  return String(a || "").trim() !== "" && String(a || "").trim() === String(b || "").trim();
}

function sameNormalizedTitle(a?: string | null, b?: string | null) {
  return normalizeTitleForIdentity(a) !== "" && normalizeTitleForIdentity(a) === normalizeTitleForIdentity(b);
}

export async function findExistingMangaByIdentity(
  db: Firestore,
  input: MangaIdentityInput
) {
  const identity = buildMangaIdentity(input);

  const bySlugSnap = await db
    .collection("mangas")
    .where("slug", "==", identity.slug)
    .limit(10)
    .get();

  for (const doc of bySlugSnap.docs) {
    const data = doc.data() as Record<string, any>;

    if (
      sameUrl(data?.sourceUrl, identity.sourceUrl) ||
      sameUrl(data?.primarySourceUrl, identity.sourceUrl) ||
      sameNormalizedTitle(data?.title, identity.cleanTitle) ||
      sameNormalizedTitle(data?.normalizedTitle, identity.normalizedTitle)
    ) {
      return { id: doc.id, data };
    }
  }

  const byNormalizedTitleSnap = await db
    .collection("mangas")
    .where("normalizedTitle", "==", identity.normalizedTitle)
    .limit(20)
    .get();

  for (const doc of byNormalizedTitleSnap.docs) {
    const data = doc.data() as Record<string, any>;
    const aliases = Array.isArray(data?.aliases) ? data.aliases : [];

    const aliasMatch = aliases.some(
      (alias: string) =>
        normalizeTitleForIdentity(alias) === identity.normalizedTitle
    );

    if (
      sameUrl(data?.sourceUrl, identity.sourceUrl) ||
      sameUrl(data?.primarySourceUrl, identity.sourceUrl) ||
      sameNormalizedTitle(data?.title, identity.cleanTitle) ||
      aliasMatch
    ) {
      return { id: doc.id, data };
    }
  }

  const allSnap = await db.collection("mangas").get();

  for (const doc of allSnap.docs) {
    const data = doc.data() as Record<string, any>;
    const backupSources = Array.isArray(data?.backupSources) ? data.backupSources : [];
    const aliases = Array.isArray(data?.aliases) ? data.aliases : [];

    const hasBackupUrl = backupSources.some(
      (item: any) => sameUrl(item?.url, identity.sourceUrl)
    );

    const aliasMatch = aliases.some(
      (alias: string) =>
        normalizeTitleForIdentity(alias) === identity.normalizedTitle
    );

    if (
      sameUrl(data?.sourceUrl, identity.sourceUrl) ||
      sameUrl(data?.primarySourceUrl, identity.sourceUrl) ||
      hasBackupUrl ||
      sameNormalizedTitle(data?.title, identity.cleanTitle) ||
      sameNormalizedTitle(data?.normalizedTitle, identity.normalizedTitle) ||
      aliasMatch ||
      data?.slug === identity.slug
    ) {
      return { id: doc.id, data };
    }
  }

  return null;
}