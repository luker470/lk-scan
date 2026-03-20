import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { sanitizeMangaTitle, slugify } from "@/lib/discovery";

type CleanupResultItem = {
  mangaId: string;
  oldTitle: string;
  newTitle: string;
  newSlug: string;
  updated: boolean;
  reason: string;
};

function normalizeText(input?: string | null) {
  return (input || "").replace(/\s+/g, " ").trim();
}

function looksBadTitle(title?: string | null) {
  const text = normalizeText(title).toLowerCase();
  if (!text) return true;

  return (
    text.includes(".jpg") ||
    text.includes(".jpeg") ||
    text.includes(".png") ||
    text.includes(".webp") ||
    text.includes("format-webp") ||
    text.includes("ac uf") ||
    /^[a-f0-9-]{20,}$/i.test(text.replace(/\s+/g, "")) ||
    text.length < 3
  );
}

export async function cleanupBuggyMangaTitles(db: Firestore) {
  const snap = await db.collection("mangas").get();
  const results: CleanupResultItem[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, any>;
    const oldTitle = String(data?.title || "").trim();
    const sourceUrl = String(data?.sourceUrl || "").trim();

    if (!looksBadTitle(oldTitle)) {
      results.push({
        mangaId: doc.id,
        oldTitle,
        newTitle: oldTitle,
        newSlug: String(data?.slug || doc.id),
        updated: false,
        reason: "Título já parece válido.",
      });
      continue;
    }

    const newTitle = sanitizeMangaTitle(oldTitle, sourceUrl);
    const newSlug = slugify(newTitle || doc.id);

    if (!newTitle || looksBadTitle(newTitle)) {
      results.push({
        mangaId: doc.id,
        oldTitle,
        newTitle: oldTitle,
        newSlug: String(data?.slug || doc.id),
        updated: false,
        reason: "Não foi possível gerar um título limpo.",
      });
      continue;
    }

    await doc.ref.set(
      {
        title: newTitle,
        slug: newSlug,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    results.push({
      mangaId: doc.id,
      oldTitle,
      newTitle,
      newSlug,
      updated: true,
      reason: "Título corrigido com base no sourceUrl.",
    });
  }

  const updatedCount = results.filter((item) => item.updated).length;

  return {
    total: results.length,
    updatedCount,
    skippedCount: results.length - updatedCount,
    results,
  };
}