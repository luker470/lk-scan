// lib/firebase.ts
import { initializeApp, getApps, getApp, deleteApp, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string | undefined,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID as string | undefined,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID as string | undefined,
};

function warnIfMissing() {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    console.error(
      `[FIREBASE] Variáveis ausentes: ${missing.join(", ")}. Confira .env.local e REINICIE o npm run dev.`
    );
  }
}

warnIfMissing();

let app: FirebaseApp;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();

  // ✅ DEV FIX: se o app foi criado com apiKey errada/undefined por HMR,
  // recria quando detectar mudança.
  const currentKey = app.options.apiKey;
  const wantedKey = firebaseConfig.apiKey;

  if (process.env.NODE_ENV === "development" && wantedKey && currentKey !== wantedKey) {
    try {
      await deleteApp(app);
    } catch {
      // ignore
    }
    app = initializeApp(firebaseConfig);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);