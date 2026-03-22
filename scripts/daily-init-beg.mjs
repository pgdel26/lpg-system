/**
 * Daily BEG Initialization Script
 *
 * Copies previous day's END (or AUD if available) into today's BEG
 * for all inventory sections (full, empty, accessories).
 *
 * Usage: FIREBASE_SERVICE_ACCOUNT='{}' node scripts/daily-init-beg.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Parse service account from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Get today's date in YYYY-MM-DD (Philippine Time)
function getTodayPHT() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// Build inventory section definitions from products
function buildSections(cylinderProducts, allAccessories) {
  return [
    {
      key: "full",
      products: cylinderProducts,
      columns: [
        { field: "beg" },
        { field: "planta", purchaseSource: ["cylinderWithRefill", "refill"] },
        { field: "sold", salesSource: "cylinderWithRefill" },
        { field: "refillSales", salesSource: "refill" },
        { field: "swap", swapSource: "to" },
        { field: "returns", refundSource: { section: "fullCylinder", defective: false } },
        { field: "end", calc: true },
        { field: "aud", auditSource: true },
        { field: "var", calc: true },
      ],
      calcEnd: (r) =>
        (r.beg || 0) + (r.planta || 0) -
        (r.sold || 0) - (r.refillSales || 0) - (r.swap || 0) +
        (r.returns || 0),
    },
    {
      key: "empty",
      products: cylinderProducts,
      columns: [
        { field: "beg" },
        { field: "toPlanta", source: { section: "full", field: "planta" } },
        { field: "refillIn", source: { section: "full", field: "refillSales" } },
        { field: "swapIn", swapSource: "from" },
        { field: "returned", refundSource: { section: "emptyCylinder" } },
        { field: "end", calc: true },
        { field: "aud", auditSource: true },
        { field: "var", calc: true },
      ],
      calcEnd: (r) =>
        (r.beg || 0) - (r.toPlanta || 0) + (r.refillIn || 0) +
        (r.swapIn || 0) + (r.returned || 0),
    },
    {
      key: "accessories",
      products: allAccessories,
      columns: [
        { field: "beg" },
        { field: "delivery", purchaseSource: "accessories" },
        { field: "sold", salesSource: "accessories" },
        { field: "defective" },
        { field: "end", calc: true },
        { field: "aud", auditSource: true },
        { field: "var", calc: true },
      ],
      calcEnd: (r) =>
        (r.beg || 0) + (r.delivery || 0) - (r.sold || 0) - (r.defective || 0),
    },
  ];
}

async function main() {
  const todayDate = getTodayPHT();
  console.log(`[daily-init-beg] Running for date: ${todayDate}`);

  // Step 1: Load products from Firestore
  const productsSnap = await db.collection("products").get();
  const cylinderProducts = [];
  const allAccessories = [];
  const productEntries = [];

  productsSnap.forEach((doc) => {
    productEntries.push({ id: doc.id, ...doc.data() });
  });

  productEntries
    .filter((p) => p.category === "cylinder")
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((p) => cylinderProducts.push(p.name));

  productEntries
    .filter((p) => p.category === "accessories")
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((p) => allAccessories.push(p.name));

  console.log(`  Cylinders: ${cylinderProducts.join(", ")}`);
  console.log(`  Accessories: ${allAccessories.join(", ")}`);

  const sections = buildSections(cylinderProducts, allAccessories);

  // Step 2: Check if today's inventory already has BEG values
  const todayFullDoc = await db.doc(`dailyInventory/${todayDate}_full`).get();
  if (todayFullDoc.exists) {
    const items = todayFullDoc.data().items || {};
    const hasBeg = Object.values(items).some((row) => row.beg != null && row.beg !== "" && row.beg !== 0);
    if (hasBeg) {
      console.log(`  Today's inventory already has BEG values. Skipping.`);
      return;
    }
  }

  // Step 3: Fetch yesterday's inventory data
  const yesterday = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  yesterday.setDate(yesterday.getDate() - 1);
  const prevDate = yesterday.toISOString().split("T")[0];
  const prevAllItems = {};

  for (const section of sections) {
    const docId = `${prevDate}_${section.key}`;
    const snap = await db.doc(`dailyInventory/${docId}`).get();
    prevAllItems[section.key] = snap.exists ? (snap.data().items || {}) : {};
  }

  const hasAnyData = Object.values(prevAllItems).some((items) => Object.keys(items).length > 0);
  if (!hasAnyData) {
    console.log(`  No inventory data found for yesterday (${prevDate}). Nothing to initialize.`);
    return;
  }

  console.log(`  Previous date found: ${prevDate}`);

  // Step 4: Fetch previous day's transactions
  const [salesSnap, purchasesSnap, swapsSnap, refundsSnap] = await Promise.all([
    db.collection("saleTransactions").where("date", "==", prevDate).get(),
    db.collection("purchases").where("date", "==", prevDate).get(),
    db.collection("swaps").where("date", "==", prevDate).get(),
    db.collection("refunds").where("date", "==", prevDate).get(),
  ]);

  // Aggregate sale counts
  const saleCounts = {};
  salesSnap.forEach((d) => {
    const t = d.data();
    if (!saleCounts[t.saleSection]) saleCounts[t.saleSection] = {};
    saleCounts[t.saleSection][t.product] = (saleCounts[t.saleSection][t.product] || 0) + (t.quantity || 1);
  });

  // Aggregate purchase counts
  const purchaseCounts = {};
  purchasesSnap.forEach((d) => {
    const t = d.data();
    if (!purchaseCounts[t.purchaseSection]) purchaseCounts[t.purchaseSection] = {};
    purchaseCounts[t.purchaseSection][t.product] = (purchaseCounts[t.purchaseSection][t.product] || 0) + (t.quantity || 0);
  });

  // Aggregate swap counts
  const swapToCounts = {};
  const swapFromCounts = {};
  swapsSnap.forEach((d) => {
    const s = d.data();
    swapToCounts[s.productTo] = (swapToCounts[s.productTo] || 0) + 1;
    if (cylinderProducts.includes(s.productFrom)) {
      swapFromCounts[s.productFrom] = (swapFromCounts[s.productFrom] || 0) + 1;
    }
  });

  // Aggregate refund counts
  const refundCounts = {};
  const refundNonDefectiveCounts = {};
  refundsSnap.forEach((d) => {
    (d.data().items || []).forEach((item) => {
      const qty = parseInt(item.qty) || 1;
      if (!refundCounts[item.section]) refundCounts[item.section] = {};
      refundCounts[item.section][item.product] = (refundCounts[item.section][item.product] || 0) + qty;
      if (!item.defective) {
        if (!refundNonDefectiveCounts[item.section]) refundNonDefectiveCounts[item.section] = {};
        refundNonDefectiveCounts[item.section][item.product] = (refundNonDefectiveCounts[item.section][item.product] || 0) + qty;
      }
    });
  });

  // Step 5: Resolve all columns (same logic as app's resolvedInventory)
  const resolved = {};

  // Pass 1: merge raw inventory with transaction-sourced values
  for (const section of sections) {
    resolved[section.key] = {};
    for (const product of section.products) {
      const row = { ...(prevAllItems[section.key]?.[product] || {}) };
      for (const col of section.columns) {
        if (col.salesSource) {
          row[col.field] = (saleCounts[col.salesSource] || {})[product] || 0;
        }
        if (col.purchaseSource) {
          const sources = Array.isArray(col.purchaseSource) ? col.purchaseSource : [col.purchaseSource];
          row[col.field] = sources.reduce((sum, src) => sum + ((purchaseCounts[src] || {})[product] || 0), 0);
        }
        if (col.swapSource === "to") {
          row[col.field] = swapToCounts[product] || 0;
        }
        if (col.swapSource === "from") {
          row[col.field] = swapFromCounts[product] || 0;
        }
        if (col.refundSource) {
          const src = col.refundSource;
          const counts = src.defective === false ? refundNonDefectiveCounts : refundCounts;
          row[col.field] = (counts[src.section] || {})[product] || 0;
        }
      }
      resolved[section.key][product] = row;
    }
  }

  // Pass 2: resolve cross-section sources
  for (const section of sections) {
    for (const product of section.products) {
      for (const col of section.columns) {
        if (col.source) {
          const srcRow = resolved[col.source.section]?.[product] || {};
          resolved[section.key][product][col.field] = srcRow[col.source.field] || 0;
        }
      }
    }
  }

  // Step 6: Calculate END and set as new BEG (prefer AUD over END)
  const batch = db.batch();

  for (const section of sections) {
    const newItems = {};
    for (const product of section.products) {
      const row = resolved[section.key][product] || {};
      const prevEnd = section.calcEnd(row);
      const prevAud = row.aud;
      const beg = (prevAud != null && prevAud !== "") ? (parseFloat(prevAud) || 0) : prevEnd;
      newItems[product] = { beg };
    }

    const docId = `${todayDate}_${section.key}`;
    batch.set(db.doc(`dailyInventory/${docId}`), {
      date: todayDate,
      section: section.key,
      items: newItems,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log(`  [${section.key}] Set BEG for ${Object.keys(newItems).length} products`);
  }

  await batch.commit();
  console.log(`[daily-init-beg] Done! BEG initialized for ${todayDate}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
