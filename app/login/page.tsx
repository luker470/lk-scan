"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoadingEmail(true);

    try {
      await login(email.trim(), password);
      router.push("/");
    } catch (e: any) {
      alert(e?.message || "Erro ao entrar.");
    } finally {
      setLoadingEmail(false);
    }
  }

  async function handleGoogleLogin() {
    setLoadingGoogle(true);

    try {
      await loginWithGoogle();
      router.push("/");
    } catch (e: any) {
      alert(e?.message || "Erro ao entrar com Google.");
    } finally {
      setLoadingGoogle(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h1 className="text-2xl font-bold text-cyan-400">Entrar</h1>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Seu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
          />

          <input
            type="password"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
          />

          <button
            type="submit"
            disabled={loadingEmail}
            className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50"
          >
            {loadingEmail ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <button
          onClick={handleGoogleLogin}
          disabled={loadingGoogle}
          className="w-full rounded-xl border border-zinc-700 p-3 font-semibold text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
        >
          {loadingGoogle ? "Conectando..." : "Entrar com Google"}
        </button>

        <p className="text-sm text-zinc-400">
          Não tem conta?{" "}
          <Link href="/register" className="text-cyan-400 hover:text-cyan-300">
            Cadastre-se
          </Link>
        </p>
      </div>
    </main>
  );
}