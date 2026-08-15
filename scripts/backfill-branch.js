/**
 * Backfills `branch: "pili"` onto all existing transactional data, and
 * copies dailyInventory/dailyReport docs to their new branch-aware IDs.
 *
 * Additive only — never deletes or modifies data the app currently reads.
 * Old dailyInventory/dailyReport docs are left in place untouched; only new
 * copies are created at the new IDs.
 * Idempotent — safe to re-run; skips anything already migrated.
 *
 * Usage: node scripts/backfill-branch.js
 */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.resolve(
  __dirname,
  "../gasul-inventory-firebase-adminsdk-fbsvc-8f7cff15bd.json"
));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
db.settings({ preferRest: true });

const DEFAULT_BRANCH = "pili";

// Simple field-stamp migration for flat transactional collections.
async function stampBranch(collectionName) {
  const snap = await db.collection(collectionName).get();
  const docsToUpdate = snap.docs.filter((d) => !d.data().branch);
  const skipped = snap.size - docsToUpdate.length;

  let updated = 0;
  for (let i = 0; i < docsToUpdate.length; i += 500) {
    const chunk = docsToUpdate.slice(i, i + 500);
    const batch = db.batch();
    chunk.forEach((d) => batch.update(d.ref, { branch: DEFAULT_BRANCH }));
    await batch.commit();
    updated += chunk.length;
  }

  console.log(`  ${collectionName}: ${updated} updated, ${skipped} already had branch (total ${snap.size})`);
}

// Copies each dailyInventory doc (`${date}_${section}`) to a new branch-aware
// ID (`${date}_${branch}_${section}`). Old docs are left untouched.
async function copyDailyInventory() {
  const snap = await db.collection("dailyInventory").get();
  let created = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    const docId = d.id;
    const date = docId.slice(0, 10);
    const section = docId.slice(11); // skip the "_" separator at index 10
    const newId = `${date}_${DEFAULT_BRANCH}_${section}`;

    const newRef = db.collection("dailyInventory").doc(newId);
    const newSnap = await newRef.get();
    if (newSnap.exists) {
      skipped++;
      continue;
    }

    await newRef.set({ ...d.data(), branch: DEFAULT_BRANCH });
    created++;
  }

  console.log(`  dailyInventory: ${created} copied, ${skipped} already migrated (total ${snap.size})`);
}

// Copies each dailyReport doc (`${date}`) to `${date}_${branch}`. Old docs
// are left untouched.
async function copyDailyReport() {
  const snap = await db.collection("dailyReport").get();
  let created = 0;
  let skipped = 0;

  for (const d of snap.docs) {
    const date = d.id;
    const newId = `${date}_${DEFAULT_BRANCH}`;

    const newRef = db.collection("dailyReport").doc(newId);
    const newSnap = await newRef.get();
    if (newSnap.exists) {
      skipped++;
      continue;
    }

    await newRef.set({ ...d.data(), branch: DEFAULT_BRANCH });
    created++;
  }

  console.log(`  dailyReport: ${created} copied, ${skipped} already migrated (total ${snap.size})`);
}

(async () => {
  console.log("Backfilling branch data (default: pili)...\n");

  console.log("Stamping branch field:");
  for (const c of ["saleTransactions", "swaps", "refunds", "expenses", "purchases"]) {
    await stampBranch(c);
  }

  console.log("\nCopying to branch-aware document IDs:");
  await copyDailyInventory();
  await copyDailyReport();

  console.log("\nDone. Old dailyInventory/dailyReport docs were left in place, untouched.");
  process.exit(0);
})();
