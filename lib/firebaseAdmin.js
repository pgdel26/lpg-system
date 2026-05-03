import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let cachedApp;

function getAdminApp() {
  if (cachedApp) return cachedApp;
  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!b64) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY env var not set.");
  }

  let serviceAccount;
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    serviceAccount = JSON.parse(json);
  } catch (err) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid base64-encoded JSON: " + err.message);
  }

  cachedApp = initializeApp({
    credential: cert(serviceAccount),
  });
  return cachedApp;
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
