"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    if (!username.trim()) {
      alert("Digite um nome de usuário.");
      return;
    }

    if (password.length < 6) {
      alert("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirm) {
      alert("As senhas não coincidem.");
      return;
    }

    setLoadingEmail(true);

    try {
      await register({
        email: email.trim(),
        password,
        username: username.trim(),
        displayName: displayName.trim(),
      });
      router.push("/");
    } catch (e: any) {
      alert(e?.message || "Erro ao cadastrar.");
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
      alert(e?.message || "Erro ao cadastrar com Google.");
    } finally {
      setLoadingGoogle(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <h1 className="text-2xl font-bold text-cyan-400">Cadastrar</h1>

        <form onSubmit={handleRegister} className="space-y-4">
          <input
            type="text"
            placeholder="Nome para exibição"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
          />

          <input
            type="text"
            placeholder="Nome de usuário único"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
          />

          <input
            type="email"
            placeholder="Seu email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
          />

          <input
            type="password"
            placeholder="Crie uma senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
          />

          <input
            type="password"
            placeholder="Confirme a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 p-3 outline-none focus:border-cyan-400"
          />

          <button
            type="submit"
            disabled={loadingEmail}
            className="w-full rounded-xl bg-cyan-500 p-3 font-bold text-black hover:bg-cyan-600 disabled:opacity-50"
          >
            {loadingEmail ? "Cadastrando..." : "Cadastrar"}
          </button>
        </form>

        <button
          onClick={handleGoogleLogin}
          disabled={loadingGoogle}
          className="w-full rounded-xl border border-zinc-700 p-3 font-semibold text-zinc-200 hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-50"
        >
          {loadingGoogle ? "Conectando..." : "Cadastrar com Google"}
        </button>

        <p className="text-sm text-zinc-400">
          Já tem conta?{" "}
          <Link href="/login" className="text-cyan-400 hover:text-cyan-300">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}