"use client";

import { useEffect, useState } from "react";

const KEY = "LK_ADMIN_OK";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  const [pass, setPass] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved === "1") setOk(true);
  }, []);

  function login() {
    // ✅ senha simples (troque para a sua)
    if (pass === "1234") {
      localStorage.setItem(KEY, "1");
      setOk(true);
    } else {
      alert("Senha incorreta!");
    }
  }

  function logout() {
    localStorage.removeItem(KEY);
    setOk(false);
    setPass("");
  }

  if (!ok) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-cyan-400 mb-4">🔒 Acesso Admin</h1>

          <input
            type="password"
            placeholder="Digite a senha"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full p-3 rounded bg-zinc-800 border border-zinc-700 outline-none focus:border-cyan-400"
          />

          <button
            onClick={login}
            className="w-full mt-4 bg-cyan-500 hover:bg-cyan-600 p-3 rounded font-bold text-black transition"
          >
            Entrar
          </button>

          <p className="text-xs text-zinc-400 mt-3">
            Dica: depois a gente troca isso por login real com Firebase.
          </p>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="fixed top-3 right-3 z-50">
        <button
          onClick={logout}
          className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-200 hover:border-red-400 hover:text-red-300 transition"
        >
          Sair
        </button>
      </div>
      {children}
    </>
  );
}
