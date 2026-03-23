"use client";

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";

export type UserProfile = {
  uid: string;
  displayName: string;
  photoURL: string;
  email: string;
  role: "user" | "admin";
  preferredLanguage: string;
  preferredReaderMode: "fitWidth" | "fitHeight" | "paged";
  theme: "dark" | "light" | "system";
  favoriteGenres: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function userProfileRef(db: Firestore, uid: string) {
  return doc(db, "users", uid);
}

export async function ensureUserProfile(
  db: Firestore,
  input: {
    uid: string;
    email?: string | null;
    displayName?: string | null;
    photoURL?: string | null;
    role?: "user" | "admin";
  }
) {
  const ref = userProfileRef(db, input.uid);
  const snap = await getDoc(ref);

  const payload: UserProfile = {
    uid: input.uid,
    displayName: String(input.displayName || "").trim(),
    photoURL: String(input.photoURL || "").trim(),
    email: String(input.email || "").trim(),
    role: input.role || "user",
    preferredLanguage: "pt-BR",
    preferredReaderMode: "fitWidth",
    theme: "dark",
    favoriteGenres: [],
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return payload;
  }

  const current = snap.data() as Record<string, any>;

  await setDoc(
    ref,
    {
      uid: input.uid,
      email: String(input.email || current?.email || "").trim(),
      displayName: String(input.displayName || current?.displayName || "").trim(),
      photoURL: String(input.photoURL || current?.photoURL || "").trim(),
      role: current?.role || input.role || "user",
      preferredLanguage: current?.preferredLanguage || "pt-BR",
      preferredReaderMode: current?.preferredReaderMode || "fitWidth",
      theme: current?.theme || "dark",
      favoriteGenres: Array.isArray(current?.favoriteGenres)
        ? current.favoriteGenres
        : [],
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ...payload,
    ...current,
  } as UserProfile;
}

export async function updateUserProfile(
  db: Firestore,
  uid: string,
  patch: Partial<
    Pick<
      UserProfile,
      | "displayName"
      | "photoURL"
      | "preferredLanguage"
      | "preferredReaderMode"
      | "theme"
      | "favoriteGenres"
    >
  >
) {
  const ref = userProfileRef(db, uid);

  await updateDoc(ref, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
