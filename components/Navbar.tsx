"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { isAdmin } from "@/lib/admin";

export default function Navbar() {
  const { user, loading, signOutUser } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="LK-Scan"
            className="h-12 w-12 rounded-xl object-cover"
          />
          <div>
            <div className="text-2xl font-extrabold text-cyan-400">LK-Scan</div>
            <div className="text-xs text-zinc-400">Mangás e manhwas online</div>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          <Link
            href="/ranking-users"
            className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            Ranking
          </Link>

          {user ? (
            <>
              <Link
                href="/favorites"
                className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Favoritos
              </Link>

              <Link
                href="/following"
                className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Seguindo
              </Link>

              <Link
                href="/profile"
                className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Perfil
              </Link>

              <button
                onClick={() => signOutUser()}
                className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-red-400 hover:text-red-300 transition"
              >
                Sair
              </button>

              {isAdmin(user.uid) ? (
                <Link
                  href="/admin"
                  className="rounded-xl bg-cyan-500 px-4 py-2 font-bold text-black hover:bg-cyan-400 transition"
                >
                  Admin
                </Link>
              ) : null}
            </>
          ) : loading ? (
            <div className="text-sm text-zinc-400">...</div>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
              >
                Entrar
              </Link>

              <Link
                href="/register"
                className="rounded-xl bg-cyan-500 px-4 py-2 font-bold text-black hover:bg-cyan-400 transition"
              >
                Criar conta
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}