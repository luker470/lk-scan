"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getLevelFromXp } from "@/lib/levels";
import { getTitleByLevel } from "@/lib/titles";
import { isAdmin } from "@/lib/admin";

type RegisterParams = {
  email: string;
  password: string;
  username: string;
  displayName?: string;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (params: RegisterParams) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  loginWithGoogle: async () => {},
  logout: async () => {},
  resetPassword: async () => {},
  signOutUser: async () => {},
});

function normalizeUsername(username: string) {
  return username.trim().toLowerCase().replace(/\s+/g, "");
}

async function usernameExists(usernameLower: string) {
  const q = query(
    collection(db, "users"),
    where("usernameLower", "==", usernameLower),
    limit(1)
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

async function generateUniqueUsername(baseValue: string) {
  const base =
    normalizeUsername(baseValue.replace(/[^a-zA-Z0-9_]/g, "")) || "user";

  let candidate = base;
  let count = 0;

  while (await usernameExists(candidate)) {
    count++;
    candidate = `${base}${count}`;
  }

  return candidate;
}

async function ensureUserDoc(
  user: User,
  preferredUsername?: string,
  preferredDisplayName?: string
) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  const xpTotal = 0;
  const levelData = getLevelFromXp(xpTotal);

  if (!snap.exists()) {
    const username = preferredUsername
      ? normalizeUsername(preferredUsername)
      : await generateUniqueUsername(
          user.email?.split("@")[0] || user.displayName || "user"
        );

    const displayName =
      preferredDisplayName?.trim() || user.displayName?.trim() || username;

    await setDoc(userRef, {
      uid: user.uid,
      email: user.email || "",
      displayName,
      username,
      usernameLower: username,
      photoURL: user.photoURL || "",
      bio: "",
      level: levelData.level,
      xp: levelData.currentLevelXp,
      xpTotal,
      xpToNext: levelData.xpToNext,
      progressPercent: levelData.progressPercent,
      chaptersRead: 0,
      commentsCount: 0,
      favoritesCount: 0,
      followingCount: 0,
      rankScore: 0,
      title: isAdmin(user.uid) ? "Admin" : getTitleByLevel(levelData.level),
      isVip: false,
      vipTier: null,
      role: isAdmin(user.uid) ? "admin" : "user",
      preferredLanguage: "pt-BR",
      preferredReaderMode: "fitWidth",
      theme: "dark",
      favoriteGenres: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastReadAt: null,
    });

    return;
  }

  const data = snap.data();

  await setDoc(
    userRef,
    {
      email: user.email || "",
      photoURL: user.photoURL || "",
      updatedAt: serverTimestamp(),
      role: isAdmin(user.uid) ? "admin" : data?.role || "user",
      title: isAdmin(user.uid)
        ? "Admin"
        : data?.title || getTitleByLevel(data?.level || 1),
      preferredLanguage: data?.preferredLanguage || "pt-BR",
      preferredReaderMode: data?.preferredReaderMode || "fitWidth",
      theme: data?.theme || "dark",
      favoriteGenres: Array.isArray(data?.favoriteGenres)
        ? data.favoriteGenres
        : [],
    },
    { merge: true }
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (u) {
          await ensureUserDoc(u);
        }
        setUser(u ?? null);
      } catch (error) {
        console.error("Erro ao sincronizar usuário:", error);
        setUser(u ?? null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }

  async function register({
    email,
    password,
    username,
    displayName,
  }: RegisterParams) {
    const usernameLower = normalizeUsername(username);

    if (!usernameLower) {
      throw new Error("Digite um nome de usuário.");
    }

    if (await usernameExists(usernameLower)) {
      throw new Error("Esse nome de usuário já existe.");
    }

    const cred = await createUserWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    if (displayName?.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }

    await ensureUserDoc(cred.user, usernameLower, displayName || usernameLower);
  }

  async function loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserDoc(cred.user);
  }

  async function logout() {
    await signOut(auth);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email.trim());
  }

  async function signOutUser() {
    await logout();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        loginWithGoogle,
        logout,
        resetPassword,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}