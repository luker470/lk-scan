"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage(){

  const { register } = useAuth();
  const router = useRouter();

  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);

  async function handleRegister(e:React.FormEvent){

    e.preventDefault();

    setLoading(true);

    try{

      await register(email,password);

      router.push("/");

    }catch(err:any){

      alert(err.message);

    }finally{

      setLoading(false);

    }

  }

  return(

    <main className="min-h-screen flex items-center justify-center">

      <form onSubmit={handleRegister} className="bg-zinc-900 p-6 rounded-xl space-y-3 w-[350px]">

        <h1 className="text-xl font-bold text-cyan-400">
          Criar Conta
        </h1>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          className="w-full p-3 bg-zinc-800 rounded"
        />

        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          className="w-full p-3 bg-zinc-800 rounded"
        />

        <button
          className="w-full bg-cyan-500 p-3 rounded font-bold text-black"
        >
          {loading ? "Criando..." : "Criar Conta"}
        </button>

      </form>

    </main>

  );

}
