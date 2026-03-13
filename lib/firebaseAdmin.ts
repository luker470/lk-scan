import { cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App | null = null;

function normalizePrivateKey(raw?: string | null) {
  if (!raw) return null;

  let key = raw.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n");

  return key;
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
  if (adminApp) return adminApp;

  if (!canInitAdmin()) {
    console.warn("Firebase Admin não iniciado: variáveis ausentes.");
    return null;
  }

  try {
    if (getApps().length > 0) {
      adminApp = getApp();
      return adminApp;
    }

    const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

    if (!privateKey) {
      console.warn("Firebase Admin não iniciado: private key ausente.");
      return null;
    }

    adminApp = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey,
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

  const bucketName = process.env.FIREBASE_ADMIN_STORAGE_BUCKET;
  if (!bucketName) return null;

  return getStorage(app).bucket(bucketName);
}