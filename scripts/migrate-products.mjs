/**
 * Firestore Migration Script (REST API — no gRPC)
 *
 * Migrates products from old 3-category (full, empty, accessories)
 * to new 2-category (cylinder, accessories).
 *
 * Usage: node scripts/migrate-products.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(resolve(__dirname, "../.env"), "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const PROJECT_ID = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const API_KEY = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function firestoreGet(collectionPath) {
  const docs = [];
  let pageToken = "";
  do {
    const url = `${BASE}/${collectionPath}?key=${API_KEY}&pageSize=300${pageToken ? `&pageToken=${pageToken}` : ""}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json.documents) docs.push(...json.documents);
    pageToken = json.nextPageToken || "";
  } while (pageToken);
  return docs;
}

async function firestoreQuery(collectionPath, field, value) {
  const url = `${BASE}:runQuery?key=${API_KEY}`;
  const body = {
    structuredQuery: {
      from: [{ collectionId: collectionPath }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: "EQUAL",
          value: { stringValue: value },
        },
      },
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json.filter((r) => r.document).map((r) => r.document);
}

async function firestoreSet(docPath, fields) {
  const url = `${BASE}/${docPath}?key=${API_KEY}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`SET ${docPath}: ${res.status} ${await res.text()}`);
}

async function firestoreDelete(docPath) {
  const url = `${BASE}/${docPath}?key=${API_KEY}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${docPath}: ${res.status} ${await res.text()}`);
}

async function firestoreUpdate(docPath, fields, fieldMask) {
  const mask = fieldMask.map((f) => `updateMask.fieldPaths=${f}`).join("&");
  const url = `${BASE}/${docPath}?key=${API_KEY}&${mask}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`UPDATE ${docPath}: ${res.status} ${await res.text()}`);
}

function getDocId(doc) {
  return doc.name.split("/").pop();
}

function getStringField(doc, field) {
  return doc.fields?.[field]?.stringValue || "";
}

async function migrate() {
  console.log(`Project: ${PROJECT_ID}\nStarting migration...\n`);

  // --- 1. Migrate products (skip if already done) ---
  const products = await firestoreGet("products");
  const hasOldProducts = products.some((d) => getStringField(d, "category") === "full" || getStringField(d, "category") === "empty");

  if (hasOldProducts) {
    let renamedCount = 0, deletedCount = 0;
    for (const doc of products) {
      const oldId = getDocId(doc);
      const category = getStringField(doc, "category");

      if (category === "full") {
        const newId = oldId.replace(/^full_/, "cylinder_");
        const newFields = { ...doc.fields };
        newFields.category = { stringValue: "cylinder" };

        await firestoreSet(`products/${newId}`, newFields);
        await firestoreDelete(`products/${oldId}`);
        console.log(`  ✓ Renamed: ${oldId} → ${newId}`);
        renamedCount++;
      } else if (category === "empty") {
        await firestoreDelete(`products/${oldId}`);
        console.log(`  ✗ Deleted: ${oldId}`);
        deletedCount++;
      }
    }
    console.log(`\nProducts: ${renamedCount} renamed, ${deletedCount} deleted\n`);
  } else {
    console.log("Products: already migrated, skipping.\n");
  }

  // --- 2. Migrate pricebook price keys (skip if already done) ---
  const pricebooks = await firestoreGet("pricebooks");
  let pricebookCount = 0;

  for (const doc of pricebooks) {
    const docId = getDocId(doc);
    const pricesField = doc.fields?.prices?.mapValue?.fields;
    if (!pricesField) continue;

    const hasOldKeys = Object.keys(pricesField).some((k) => k.startsWith("full_"));
    if (!hasOldKeys) continue;

    const newPrices = {};
    for (const [key, value] of Object.entries(pricesField)) {
      if (key.startsWith("full_")) {
        newPrices[key.replace(/^full_/, "cylinder_")] = value;
      } else {
        newPrices[key] = value;
      }
    }

    await firestoreUpdate(
      `pricebooks/${docId}`,
      { prices: { mapValue: { fields: newPrices } } },
      ["prices"]
    );
    const name = getStringField(doc, "name") || docId;
    console.log(`  ✓ Updated pricebook: ${name}`);
    pricebookCount++;
  }
  console.log(`\nPricebooks: ${pricebookCount > 0 ? pricebookCount + " updated" : "already migrated, skipping."}\n`);

  // --- 3. Update saleTransactions ---
  const sales = await firestoreQuery("saleTransactions", "productCategory", "full");
  let saleCount = 0;

  for (const doc of sales) {
    const docId = getDocId(doc);
    await firestoreUpdate(
      `saleTransactions/${docId}`,
      { productCategory: { stringValue: "cylinder" } },
      ["productCategory"]
    );
    saleCount++;
  }
  console.log(`Sale transactions: ${saleCount} updated\n`);

  // --- 4. Update purchases ---
  const purchases = await firestoreQuery("purchases", "productCategory", "full");
  let purchaseCount = 0;

  for (const doc of purchases) {
    const docId = getDocId(doc);
    await firestoreUpdate(
      `purchases/${docId}`,
      { productCategory: { stringValue: "cylinder" } },
      ["productCategory"]
    );
    purchaseCount++;
  }
  console.log(`Purchases: ${purchaseCount} updated\n`);

  console.log("Migration complete!");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
