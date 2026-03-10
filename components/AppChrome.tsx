"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/admin";

export default function AppChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    try {
      await logout();
      router.push("/");
    } catch (error) {
      console.error(error);
      alert("Não consegui sair.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black">
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-black/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
            <Link href="/" className="flex items-center gap-3 w-fit">
              <img
                src="/logo.png"
                alt="LK-Scan"
                className="h-10 w-auto drop-shadow-[0_0_12px_#00ffff]"
              />
              <div className="flex flex-col leading-tight">
                <span className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_8px_#00ffff]">
                  LK-Scan
                </span>
                <span className="text-[11px] text-zinc-400">
                  Mangás e manhwas online
                </span>
              </div>
            </Link>

            <nav className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/"
                className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Home
              </Link>

              <Link
                href="/catalog"
                className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Catálogo
              </Link>

              <Link
                href="/latest"
                className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Atualizados
              </Link>

              {!loading && !user && (
                <>
                  <Link
                    href="/login"
                    className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
                  >
                    Entrar
                  </Link>

                  <Link
                    href="/register"
                    className="px-3 py-2 rounded-xl bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition"
                  >
                    Cadastrar
                  </Link>
                </>
              )}

              {!loading && user && (
                <>
                  <Link
                    href="/favorites"
                    className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-pink-400 hover:text-pink-300 transition"
                  >
                    Favoritos
                  </Link>

                  <Link
                    href="/history"
                    className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
                  >
                    Histórico
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-red-400 hover:text-red-300 transition"
                  >
                    Sair
                  </button>
                </>
              )}

              {!loading && user && isAdmin(user.uid) && (
                <Link
                  href="/admin"
                  className="px-3 py-2 rounded-xl bg-cyan-500 text-black font-semibold hover:bg-cyan-400 transition"
                >
                  Admin
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main className="min-h-[calc(100vh-140px)]">{children}</main>

      <footer className="border-t border-zinc-800/80 bg-black/60">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-400">
            © {new Date().getFullYear()} LK-Scan. Todos os direitos reservados.
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <Link href="/" className="hover:text-cyan-300 transition">
              Home
            </Link>
            <Link href="/catalog" className="hover:text-cyan-300 transition">
              Catálogo
            </Link>
            <Link href="/latest" className="hover:text-cyan-300 transition">
              Atualizados
            </Link>
            {!loading && user && (
              <>
                <Link href="/favorites" className="hover:text-pink-300 transition">
                  Favoritos
                </Link>
                <Link href="/history" className="hover:text-cyan-300 transition">
                  Histórico
                </Link>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}