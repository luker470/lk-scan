import type { Metadata } from "next";
import { getAdminDb } from "@/lib/firebaseAdmin";
import ChapterClient from "./ChapterClient";

type PageProps = {
  params: Promise<{
    id: string;
    chapterId: string;
  }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id, chapterId } = await params;

  try {
    const db = getAdminDb();

    if (!db) {
      return {
        title: "Capítulo",
        description: "Leia capítulos online no LK-Scan.",
      };
    }

    const mangaSnap = await db.collection("mangas").doc(id).get();
    const chapterSnap = await db
      .collection("mangas")
      .doc(id)
      .collection("chapters")
      .doc(chapterId)
      .get();

    if (!mangaSnap.exists || !chapterSnap.exists) {
      return {
        title: "Capítulo não encontrado",
        description: "Esse capítulo não foi encontrado no LK-Scan.",
      };
    }

    const manga = mangaSnap.data() as {
      title?: string;
      cover?: string;
      banner?: string;
      description?: string;
    };

    const chapter = chapterSnap.data() as {
      title?: string;
      number?: number | string;
    };

    const mangaTitle = manga.title || "Mangá";
    const chapterTitle =
      chapter.title || `Capítulo ${chapter.number ?? chapterId}`;
    const title = `${mangaTitle} - ${chapterTitle}`;

    const description =
      manga.description?.trim() ||
      `Leia ${chapterTitle} de ${mangaTitle} online no LK-Scan.`;

    const image = manga.banner || manga.cover || "/logo.png";

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        images: [image],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [image],
      },
    };
  } catch {
    return {
      title: "Capítulo",
      description: "Leia capítulos online no LK-Scan.",
    };
  }
}

export default async function ChapterPage({ params }: PageProps) {
  const { id, chapterId } = await params;

  return <ChapterClient mangaId={id} chapterId={chapterId} />;
}