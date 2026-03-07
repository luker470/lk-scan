"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged, User, signInAnonymously } from "firebase/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ✅ evita tentar sign-in repetidamente
  const triedAnonRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);

      // se já tem user, acabou
      if (u) {
        setLoading(false);
        return;
      }

      // se não tem key, nem tenta
      const hasApiKey = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!hasApiKey) {
        console.error("[AUTH] NEXT_PUBLIC_FIREBASE_API_KEY está vazia/undefined. Cancelando login anônimo.");
        setLoading(false);
        return;
      }

      // tenta uma vez
      if (!triedAnonRef.current) {
        triedAnonRef.current = true;
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error("Anonymous sign-in failed:", e);
        }
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);