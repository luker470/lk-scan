"use client";

import Link from "next/link";

export default function Navbar() {
  return (
    <div className="sticky top-0 z-50 bg-zinc-900/60 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        
        {/* LOGO */}
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="LK-Scan"
            className="h-10 w-auto drop-shadow-[0_0_12px_#00ffff]"
          />
          <span className="text-lg font-bold text-cyan-400 drop-shadow-[0_0_10px_#00ffff]">
            LK-Scan
          </span>
        </Link>

        {/* MENU + ADMIN */}
        <div className="flex items-center gap-4">
          
          {/* MENU */}
          <div className="hidden md:flex gap-6 text-sm text-zinc-200">
            <a className="hover:text-cyan-400 transition" href="#destaques">
              Destaques
            </a>
            <a className="hover:text-cyan-400 transition" href="#mangas">
              Últimos
            </a>
            <a className="hover:text-cyan-400 transition" href="#ranking">
              Classificação
            </a>
          </div>

          {/* 🔒 BOTÃO ADMIN */}
          <Link
            href="/admin"
            className="px-4 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 transition"
          >
            🔒 Admin
          </Link>

        </div>
      </div>
    </div>
  );
}