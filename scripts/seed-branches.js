/**
 * Seeds the `branches` collection with PILI and CADLAN (idempotent — skips
 * any branch doc that already exists).
 *
 * Uses Firebase Admin SDK (service account), matching fix-beg-today.js.
 *
 * Usage: node scripts/seed-branches.js
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

const BRANCHES = [
  { id: "pili", name: "PILI", active: true, sortOrder: 1 },
  { id: "cadlan", name: "CADLAN", active: true, sortOrder: 2 },
];

(async () => {
  console.log("Seeding branches...\n");

  for (const b of BRANCHES) {
    const ref = db.collection("branches").doc(b.id);
    const snap = await ref.get();
    if (snap.exists) {
      console.log(`  = Skipped (already exists): ${b.id}`);
      continue;
    }
    await ref.set({ name: b.name, active: b.active, sortOrder: b.sortOrder });
    console.log(`  + Created: ${b.id} (${b.name})`);
  }

  console.log("\nDone.");
  process.exit(0);
})();
