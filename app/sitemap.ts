import type { MetadataRoute } from "next";
import { getAdminDb } from "@/lib/firebaseAdmin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const db = getAdminDb();

  const urls: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/catalog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/latest`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/favorites`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/history`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];

  try {
    const mangasSnap = await db.collection("mangas").get();

    for (const mangaDoc of mangasSnap.docs) {
      const mangaData = mangaDoc.data() as any;

      urls.push({
        url: `${baseUrl}/manga/${mangaDoc.id}`,
        lastModified: mangaData.updatedAt?.toDate?.() || new Date(),
        changeFrequency: "daily",
        priority: 0.8,
      });

      const chaptersSnap = await db
        .collection("mangas")
        .doc(mangaDoc.id)
        .collection("chapters")
        .get();

      for (const chapterDoc of chaptersSnap.docs) {
        urls.push({
          url: `${baseUrl}/manga/${mangaDoc.id}/chapter/${chapterDoc.id}`,
          lastModified: new Date(),
          changeFrequency: "daily",
          priority: 0.7,
        });
      }
    }
  } catch (e) {
    console.error("Erro ao gerar sitemap:", e);
  }

  return urls;
}