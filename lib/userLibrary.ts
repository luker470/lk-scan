"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  query,
  orderBy,
  type Firestore,
} from "firebase/firestore";

export type UserLibraryItem = {
  mangaId: string;
  title: string;
  cover: string;
  genre?: string;
  slug?: string;
  sourceUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function favoriteRef(db: Firestore, uid: string, mangaId: string) {
  return doc(db, "users", uid, "favorites", mangaId);
}

function followingRef(db: Firestore, uid: string, mangaId: string) {
  return doc(db, "users", uid, "following", mangaId);
}

export async function isFavorite(db: Firestore, uid: string, mangaId: string) {
  const snap = await getDoc(favoriteRef(db, uid, mangaId));
  return snap.exists();
}

export async function isFollowing(db: Firestore, uid: string, mangaId: string) {
  const snap = await getDoc(followingRef(db, uid, mangaId));
  return snap.exists();
}

export async function toggleFavorite(
  db: Firestore,
  uid: string,
  item: UserLibraryItem
) {
  const ref = favoriteRef(db, uid, item.mangaId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await deleteDoc(ref);
    return { active: false };
  }

  await setDoc(ref, {
    mangaId: item.mangaId,
    title: item.title || "",
    cover: item.cover || "",
    genre: item.genre || "",
    slug: item.slug || "",
    sourceUrl: item.sourceUrl || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { active: true };
}

export async function toggleFollowing(
  db: Firestore,
  uid: string,
  item: UserLibraryItem
) {
  const ref = followingRef(db, uid, item.mangaId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    await deleteDoc(ref);
    return { active: false };
  }

  await setDoc(ref, {
    mangaId: item.mangaId,
    title: item.title || "",
    cover: item.cover || "",
    genre: item.genre || "",
    slug: item.slug || "",
    sourceUrl: item.sourceUrl || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { active: true };
}

export async function listFavorites(db: Firestore, uid: string) {
  const snap = await getDocs(
    query(collection(db, "users", uid, "favorites"), orderBy("createdAt", "desc"))
  ).catch(async () => getDocs(collection(db, "users", uid, "favorites")));

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listFollowing(db: Firestore, uid: string) {
  const snap = await getDocs(
    query(collection(db, "users", uid, "following"), orderBy("createdAt", "desc"))
  ).catch(async () => getDocs(collection(db, "users", uid, "following")));

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}