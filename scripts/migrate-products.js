/**
 * Firestore Migration Script
 *
 * Migrates the products collection from the old 3-category system (full, empty, accessories)
 * to the new 2-category system (cylinder, accessories).
 *
 * What it does:
 * 1. Renames all "full" category products to "cylinder" (e.g. full_2.7KG → cylinder_2.7KG)
 * 2. Deletes all "empty" category products (they are no longer stored separately)
 * 3. Updates pricebook price keys from full_* to cylinder_*
 *
 * Usage:
 *   1. Make sure you have your Firebase service account key JSON file
 *   2. Run: node scripts/migrate-products.js <path-to-service-account-key.json>
 *
 * Or if you prefer to use the Firebase emulator or a different approach,
 * you can run this directly in the Firebase console's Cloud Shell.
 */

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccountPath = process.argv[2];
if (!serviceAccountPath) {
  console.error("Usage: node scripts/migrate-products.js <path-to-service-account-key.json>");
  process.exit(1);
}

const serviceAccount = require(require("path").resolve(serviceAccountPath));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrate() {
  console.log("Starting migration...\n");

  // --- 1. Migrate products collection ---
  const productsRef = db.collection("products");
  const productsSnap = await productsRef.get();

  let renamedCount = 0;
  let deletedCount = 0;

  for (const doc of productsSnap.docs) {
    const data = doc.data();
    const oldId = doc.id;

    if (data.category === "full") {
      // Rename full → cylinder
      const newId = oldId.replace(/^full_/, "cylinder_");
      const newData = { ...data, category: "cylinder" };

      await productsRef.doc(newId).set(newData);
      await productsRef.doc(oldId).delete();

      console.log(`  ✓ Renamed: ${oldId} → ${newId}`);
      renamedCount++;
    } else if (data.category === "empty") {
      // Delete empty products (no longer needed)
      await productsRef.doc(oldId).delete();
      console.log(`  ✗ Deleted: ${oldId}`);
      deletedCount++;
    }
    // accessories stay unchanged
  }

  console.log(`\nProducts: ${renamedCount} renamed, ${deletedCount} deleted\n`);

  // --- 2. Migrate pricebook price keys ---
  const pricebooksRef = db.collection("pricebooks");
  const pricebooksSnap = await pricebooksRef.get();

  let pricebookCount = 0;

  for (const doc of pricebooksSnap.docs) {
    const data = doc.data();
    if (!data.prices) continue;

    const newPrices = {};
    let changed = false;

    for (const [key, value] of Object.entries(data.prices)) {
      if (key.startsWith("full_")) {
        const newKey = key.replace(/^full_/, "cylinder_");
        newPrices[newKey] = value;
        changed = true;
      } else {
        newPrices[key] = value;
      }
    }

    if (changed) {
      await pricebooksRef.doc(doc.id).update({ prices: newPrices });
      console.log(`  ✓ Updated pricebook: ${data.name || doc.id}`);
      pricebookCount++;
    }
  }

  console.log(`\nPricebooks: ${pricebookCount} updated\n`);

  // --- 3. Update saleTransactions productCategory field ---
  const salesRef = db.collection("saleTransactions");
  const salesSnap = await salesRef.where("productCategory", "==", "full").get();

  let saleCount = 0;
  const saleBatch = db.batch();

  for (const doc of salesSnap.docs) {
    saleBatch.update(doc.ref, { productCategory: "cylinder" });
    saleCount++;
  }

  if (saleCount > 0) {
    await saleBatch.commit();
  }
  console.log(`Sale transactions: ${saleCount} updated\n`);

  // --- 4. Update purchases productCategory field ---
  const purchasesRef = db.collection("purchases");
  const purchasesSnap = await purchasesRef.where("productCategory", "==", "full").get();

  let purchaseCount = 0;
  const purchaseBatch = db.batch();

  for (const doc of purchasesSnap.docs) {
    purchaseBatch.update(doc.ref, { productCategory: "cylinder" });
    purchaseCount++;
  }

  if (purchaseCount > 0) {
    await purchaseBatch.commit();
  }
  console.log(`Purchases: ${purchaseCount} updated\n`);

  console.log("Migration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
