import admin from "firebase-admin";

let _inited = false;

function getPrivateKey() {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!key) return undefined;

  // remove aspas externas se existirem
  let cleaned = key.trim();

  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }

  // converte \n em quebra real
  return cleaned.replace(/\\n/g, "\n");
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = getPrivateKey();
  const storageBucket =
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET || `${projectId}.appspot.com`;

  if (projectId && clientEmail && privateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        storageBucket,
      });
    } catch (error) {
      console.error("❌ Erro ao inicializar Firebase Admin:", error);
      throw error;
    }
  } else {
    console.warn("⚠️ Firebase Admin env não configurado corretamente.");
    admin.initializeApp();
  }

  return admin.app();
}

function ensureSettings() {
  if (_inited) return;
  _inited = true;

  try {
    admin.firestore().settings({ ignoreUndefinedProperties: true });
  } catch {
    // pode falhar em hot reload/dev
  }
}

export function getAdminDb() {
  getAdminApp();
  ensureSettings();
  return admin.firestore();
}

export function getAdminBucket() {
  getAdminApp();
  return admin.storage().bucket();
}

export function getAdminAuth() {
  getAdminApp();
  return admin.auth();
}