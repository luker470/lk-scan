import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

export const metadata = {
  title: "LK-Scan",
  description: "Leitor de mangás",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-br">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}