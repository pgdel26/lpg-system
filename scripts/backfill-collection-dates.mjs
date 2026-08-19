/**
 * One-off: give the 72 legacy A/R collections that carry no date one, so they
 * stop being invisible to every period report.
 *
 * These are pre-event-tracking docs: `arCollected: true` with no
 * `collectedDate`. lib/receivables.ts synthesizes a collection event for them,
 * but a dateless event is excluded from every date-bounded figure — which left
 * ₱787,290 of real collections in no month at all, and the A/R roll-forward's
 * ending balance permanently above the true outstanding by exactly that amount.
 *
 * Owner's decision: date them to the invoice's own date. That asserts payment
 * on the day of sale, which for a credit sale is by definition not when it
 * happened — so those months' "Collected" must not be read as timing
 * information. It buys correct totals and visible money, which is the tradeoff
 * that was wanted.
 *
 * Only `collectedDate` is written. arCollected/collectionMethod are untouched,
 * and no doc is migrated to the arCollections[] shape — recordArCollection does
 * that lazily the next time a doc is actually collected against.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/backfill-collection-dates.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/backfill-collection-dates.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ preferRest: true });

const DRY_RUN = process.argv.includes("--dry-run");
const r2 = (n) => Math.round(n * 100) / 100;

// Mirrors lib/payments.ts paymentSplit().ar
function arPortion(t) {
  if (t.payments?.length) {
    return r2(t.payments.reduce(
      (s, p) => s + (p.method !== "cash" && p.method !== "gcash" ? (p.amount || 0) : 0), 0));
  }
  const amount = t.totalAmount || t.finalPrice || 0;
  if (t.paymentType === "cash" || t.paymentType === "gcash") return 0;
  return r2(amount);
}

async function main() {
  console.log(`[backfill-collection-dates]${DRY_RUN ? "  (DRY RUN)" : ""}`);

  const snap = await db.collection("saleTransactions").where("arCollected", "==", true).get();
  const targets = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    // Already dated, or already migrated to the event array: nothing to do.
    .filter((t) => !t.collectedDate && !(t.arCollections?.length > 0))
    .filter((t) => arPortion(t) > 0);

  const undatable = targets.filter((t) => !t.date);
  const fixable = targets.filter((t) => t.date);

  const byMonth = {};
  let total = 0;
  for (const t of fixable) {
    const m = t.date.slice(0, 7);
    byMonth[m] = r2((byMonth[m] || 0) + arPortion(t));
    total = r2(total + arPortion(t));
  }

  console.log(`  dateless legacy collections: ${targets.length}`);
  console.log(`  will be dated to their invoice date: ${fixable.length}  (${total.toLocaleString()})`);
  console.log(`  landing per month: ${JSON.stringify(byMonth)}`);
  if (undatable.length) {
    console.log(`  SKIPPED — no invoice date either: ${undatable.length} (${undatable.map((t) => t.id).join(", ")})`);
  }

  if (DRY_RUN || fixable.length === 0) {
    console.log(`[backfill-collection-dates] ${DRY_RUN ? "Dry run, nothing written." : "Nothing to do."}`);
    return;
  }

  // Chunked: Firestore caps a batch at 500 writes.
  let written = 0;
  for (let i = 0; i < fixable.length; i += 400) {
    const batch = db.batch();
    for (const t of fixable.slice(i, i + 400)) {
      batch.update(db.doc(`saleTransactions/${t.id}`), { collectedDate: t.date });
      written++;
    }
    await batch.commit();
  }
  console.log(`[backfill-collection-dates] Done. ${written} document(s) updated.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
