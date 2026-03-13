import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App | null = null;

function getPrivateKey() {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!key) return null;

  return key.replace(/\\n/g, "\n");
}

function canInitAdmin() {
  return Boolean(
    process.env.FIREBASE_ADMIN_PROJECT_ID &&
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
      process.env.FIREBASE_ADMIN_PRIVATE_KEY &&
      process.env.FIREBASE_ADMIN_STORAGE_BUCKET
  );
}

function initAdmin() {
  if (!canInitAdmin()) {
    console.warn("Firebase Admin não iniciado: variáveis ausentes.");
    return null;
  }

  try {
    if (getApps().length > 0) {
      adminApp = getApps()[0]!;
      return adminApp;
    }

    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: getPrivateKey()!,
      }),
      storageBucket: process.env.FIREBASE_ADMIN_STORAGE_BUCKET,
    });

    return adminApp;
  } catch (error) {
    console.error("Erro ao inicializar Firebase Admin:", error);
    return null;
  }
}

export function getAdminApp() {
  return adminApp ?? initAdmin();
}

export function getAdminDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app);
}

export function getAdminBucket() {
  const app = getAdminApp();
  if (!app) return null;
  return getStorage(app).bucket(process.env.FIREBASE_ADMIN_STORAGE_BUCKET);
}