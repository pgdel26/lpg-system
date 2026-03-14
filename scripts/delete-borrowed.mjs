/**
 * Deletes all products with category "borrowed" from Firestore.
 *
 * Usage: node scripts/delete-borrowed.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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

async function firestoreDelete(docPath) {
  const url = `${BASE}/${docPath}?key=${API_KEY}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${docPath}: ${res.status} ${await res.text()}`);
}

async function run() {
  console.log(`Project: ${PROJECT_ID}\n`);

  const products = await firestoreGet("products");
  let count = 0;

  for (const doc of products) {
    const category = doc.fields?.category?.stringValue || "";
    const docId = doc.name.split("/").pop();

    if (category === "borrowed") {
      await firestoreDelete(`products/${docId}`);
      console.log(`  ✗ Deleted: ${docId}`);
      count++;
    }
  }

  console.log(`\nDone: ${count} borrowed product${count !== 1 ? "s" : ""} deleted.`);
}

run().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
