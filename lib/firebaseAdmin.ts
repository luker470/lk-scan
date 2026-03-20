import {
  cert,
  getApp,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";

import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

function normalizeEnv(raw?: string | null) {
  if (!raw) return "";

  let value = raw.trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.trim();
}

function normalizePrivateKey(raw?: string | null) {
  const key = normalizeEnv(raw);
  if (!key) return "";

  return key.replace(/\\n/g, "\n");
}

function getConfig() {
  return {
    projectId: normalizeEnv(process.env.FIREBASE_ADMIN_PROJECT_ID),
    clientEmail: normalizeEnv(process.env.FIREBASE_ADMIN_CLIENT_EMAIL),
    privateKey: normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    storageBucket: normalizeEnv(process.env.FIREBASE_ADMIN_STORAGE_BUCKET),
  };
}

function initAdmin() {
  if (adminApp) return adminApp;

  try {
    if (getApps().length > 0) {
      adminApp = getApp();
      return adminApp;
    }

    const { projectId, clientEmail, privateKey, storageBucket } = getConfig();

    console.log("ADMIN DEBUG:", {
      projectId,
      clientEmail,
      hasPrivateKey: !!privateKey,
      privateKeyLength: privateKey?.length,
      bucket: storageBucket,
    });

    if (projectId && clientEmail && privateKey) {
      console.log("Inicializando Firebase Admin com cert()");

      adminApp = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        ...(storageBucket ? { storageBucket } : {}),
      });
    } else {
      console.log("Usando applicationDefault()");

      adminApp = initializeApp({
        credential: applicationDefault(),
        ...(storageBucket ? { storageBucket } : {}),
      });
    }

    console.log("Firebase Admin iniciado.");

    return adminApp;
  } catch (error) {
    console.error("Erro ao iniciar Firebase Admin:", error);
    return null;
  }
}

export function getAdminApp() {
  return adminApp ?? initAdmin();
}

export function getAdminDb() {
  if (adminDb) return adminDb;

  const app = getAdminApp();
  if (!app) return null;

  adminDb = getFirestore(app);
  return adminDb;
}

export function getAdminBucket() {
  const app = getAdminApp();
  if (!app) return null;

  const { storageBucket } = getConfig();
  if (!storageBucket) return null;

  return getStorage(app).bucket(storageBucket);
}