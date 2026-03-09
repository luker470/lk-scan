import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AppChrome from "@/components/AppChrome";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  title: {
    default: "LK-Scan",
    template: "%s | LK-Scan",
  },
  description: "Leia mangás e manhwas online no LK-Scan.",
  keywords: ["mangá", "manhwa", "lk scan", "lk-scans", "leitor online"],
  openGraph: {
    title: "LK-Scan",
    description: "Leia mangás e manhwas online no LK-Scan.",
    url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    siteName: "LK-Scan",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "LK-Scan",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "LK-Scan",
    description: "Leia mangás e manhwas online no LK-Scan.",
    images: ["/logo.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-black text-white antialiased">
        <AuthProvider>
          <AppChrome>{children}</AppChrome>
        </AuthProvider>
      </body>
    </html>
  );
}