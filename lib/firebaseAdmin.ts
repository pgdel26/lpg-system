import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let cachedApp: App | undefined;

function getAdminApp(): App {
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

  let serviceAccount: Record<string, unknown>;
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    serviceAccount = JSON.parse(json) as Record<string, unknown>;
  } catch (err) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not valid base64-encoded JSON: " +
        (err as Error).message,
    );
  }

  cachedApp = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
  });
  return cachedApp;
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
