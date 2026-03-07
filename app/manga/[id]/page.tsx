import type { Metadata } from "next";
import MangaClient from "./MangaClient";
import { getAdminDb } from "@/lib/firebaseAdmin";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;

  try {
    const db = getAdminDb();
    const snap = await db.collection("mangas").doc(id).get();

    if (!snap.exists) {
      return {
        title: "Mangá não encontrado",
        description: "Esse mangá não foi encontrado no LK-Scan.",
      };
    }

    const manga = snap.data() as any;
    const title = manga.title || "Mangá";
    const description =
      manga.description || `Leia ${title} online no LK-Scan.`;
    const image = manga.cover || "/logo.png";

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
      title: "Mangá",
      description: "Leia mangás online no LK-Scan.",
    };
  }
}

export default async function MangaPage({ params }: PageProps) {
  const { id } = await params;
  return <MangaClient id={id} />;
}