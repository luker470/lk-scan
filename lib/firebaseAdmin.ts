import admin from "firebase-admin";

let _inited = false;

function getPrivateKey() {
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!key) return undefined;
  return key.replace(/\\n/g, "\n");
}

function getAdminApp() {
  if (admin.apps.length) return admin.app();

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = getPrivateKey();

  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket:
        process.env.FIREBASE_ADMIN_STORAGE_BUCKET || `${projectId}.appspot.com`,
    });
  } else {
    // ⚠️ Não quebra build. Mas rotas admin falham sem credenciais.
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
    // Pode falhar em dev/hot reload
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