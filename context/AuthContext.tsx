"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInAnonymously,
  type User,
  type Auth,
} from "firebase/auth";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const triedAnonRef = useRef(false);

  useEffect(() => {
    if (!auth) {
      console.error("[AUTH] Firebase Auth não inicializado.");
      setLoading(false);
      return;
    }

    const safeAuth: Auth = auth;

    const unsub = onAuthStateChanged(safeAuth, async (u) => {
      setUser(u ?? null);

      if (u) {
        setLoading(false);
        return;
      }

      if (!triedAnonRef.current) {
        triedAnonRef.current = true;

        try {
          await signInAnonymously(safeAuth);
        } catch (error: unknown) {
          const code =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            typeof (error as { code?: unknown }).code === "string"
              ? (error as { code: string }).code
              : "";

          if (code === "auth/admin-restricted-operation") {
            console.error(
              "[AUTH] Login anônimo desativado. Ative em Firebase > Authentication > Método de login > Anônimo."
            );
          } else if (code === "auth/invalid-api-key") {
            console.error(
              "[AUTH] API key inválida. Confira as variáveis NEXT_PUBLIC_FIREBASE_* no Vercel."
            );
          } else {
            console.error("[AUTH] Falha no login anônimo:", error);
          }
        }
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);