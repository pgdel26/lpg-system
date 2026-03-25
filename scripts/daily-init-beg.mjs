/**
 * Daily BEG Initialization Script
 *
 * Copies previous day's AUD (if available) or END into today's BEG
 * for all inventory sections (full, empty, accessories).
 *
 * Usage: FIREBASE_SERVICE_ACCOUNT='{}' node scripts/daily-init-beg.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ preferRest: true });

function getDatePHT(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

async function main() {
  const today = new Date();
  const todayDate = getDatePHT(today);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const prevDate = getDatePHT(yesterday);

  console.log(`[daily-init-beg] Copying ${prevDate} END/AUD → ${todayDate} BEG`);

  const sectionKeys = ["full", "empty", "accessories"];

  // Check if today already has BEG values
  const todayFullDoc = await db.doc(`dailyInventory/${todayDate}_full`).get();
  if (todayFullDoc.exists) {
    const items = todayFullDoc.data().items || {};
    const hasBeg = Object.values(items).some((row) => row.beg != null && row.beg !== "" && row.beg !== 0);
    if (hasBeg) {
      console.log("  Today already has BEG values. Skipping.");
      return;
    }
  }

  // Read yesterday's docs and carry over AUD (preferred) or END as today's BEG
  const batch = db.batch();

  for (const sk of sectionKeys) {
    const prevSnap = await db.doc(`dailyInventory/${prevDate}_${sk}`).get();
    if (!prevSnap.exists) {
      console.log(`  [${sk}] No data for ${prevDate}, skipping.`);
      continue;
    }
    const prevItems = prevSnap.data().items || {};

    const newItems = {};
    for (const [product, row] of Object.entries(prevItems)) {
      const beg = (row.aud != null && row.aud !== "" && row.aud !== undefined)
        ? (parseFloat(row.aud) || 0)
        : (parseFloat(row.end) || 0);
      newItems[product] = { beg };
    }

    const docId = `${todayDate}_${sk}`;
    batch.set(db.doc(`dailyInventory/${docId}`), {
      date: todayDate,
      section: sk,
      items: newItems,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`  [${sk}] Set BEG for ${Object.keys(newItems).length} products`);
  }

  await batch.commit();
  console.log(`[daily-init-beg] Done!`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
