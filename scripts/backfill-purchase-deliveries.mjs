/**
 * One-off: move every historical purchase line onto the purchaseDelivery model,
 * so past and future purchases read the same way.
 *
 * Before this ran, all 570 non-transfer `purchases` docs (2026-03 to 2026-08)
 * were from the per-line era: cost, if any, sat on the line as `totalCost`. Only
 * July was ever costed (PHP 5,211,568.67, entered in one sitting); March through
 * June and August sat entirely at 0 because the supplier bills a delivery total
 * and itemizes a month later if at all, so per-product amounts were never known
 * at entry time. That is the whole reason cost moved to the delivery.
 *
 * What it writes:
 *   - One purchaseDelivery doc per (branch, date) — 90 in total. July's 15 carry
 *     that date's line costs summed and rounded to the centavo. The other 75
 *     carry totalCost 0 with `costPending: true`, which is what makes them show
 *     as "Not yet costed" rather than PHP 0.00 and gives the operator a doc to
 *     type the real figure into later.
 *   - `deliveryId` on each of the 570 lines. Nothing else on the line is touched.
 *
 * The one inference: history cannot distinguish one PHP 390k delivery from two
 * PHP 195k ones on the same day, so this asserts one delivery per date. Money is
 * unaffected — every period total is identical either way — and only
 * `deliveryCount` depends on the grouping. Owner accepted that tradeoff.
 *
 * July's per-line `unitCost`/`totalCost` are deliberately LEFT IN PLACE. Once a
 * line has a deliveryId, purchaseCost() ignores its line cost and the Purchases
 * table stops displaying it, so they are inert — but they are also the only
 * record of where the PHP 5.2M total came from. Deleting them would destroy the
 * audit trail to no benefit.
 *
 * Transfers (226 docs) are not touched. A transfer is not a purchase: it is
 * recorded in this collection at zero cost as a signed pair, and purchaseCost()
 * excludes it by `isTransfer`. Giving one a delivery would invent a supplier.
 *
 * Idempotent, twice over: delivery doc ids are deterministic (`<branch>_<date>`,
 * which also structurally enforces the one-per-date assumption above), and lines
 * that already carry a deliveryId are skipped. A re-run after a mid-loop failure
 * is safe. Reversible via --rollback, which deletes only the deterministic ids
 * this script creates and unsets deliveryId on the lines pointing at them.
 *
 * Guard: the run aborts before writing anything unless every month's new delivery
 * totals match what is reported today to within half a centavo per costed
 * delivery — the arithmetic most that rounding each delivery once can move. In
 * practice July came out 1 centavo low (PHP 5,211,568.66 against .67) because the
 * old line costs carried sub-centavo precision that a real invoice amount cannot.
 * The drift is printed every run, never merely tolerated.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT="$(cat gasul-inventory-firebase-adminsdk-*.json)" \
 *     node scripts/backfill-purchase-deliveries.mjs --dry-run
 *   FIREBASE_SERVICE_ACCOUNT="$(cat ...)" node scripts/backfill-purchase-deliveries.mjs
 *   FIREBASE_SERVICE_ACCOUNT="$(cat ...)" node scripts/backfill-purchase-deliveries.mjs --rollback
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ preferRest: true });

const DRY_RUN = process.argv.includes("--dry-run");
const ROLLBACK = process.argv.includes("--rollback");

const r2 = (n) => Math.round(n * 100) / 100;
// Explicit currency + 2dp: these figures sign off a live-data migration, so
// "5,211,568.7" vs "5,211,568.67" must not be ambiguous.
const peso = (n) =>
  `PHP ${r2(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// Compare money as integer centavos. Summing 100 floats then testing equality on
// the result is how a migration "fails" over 0.00000001 of a peso.
const centavos = (n) => Math.round(n * 100);

const deliveryIdFor = (branch, date) => `${branch}_${date}`;

async function loadLines() {
  const snap = await db.collection("purchases").get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => !p.isTransfer);
}

async function rollback(lines) {
  console.log("[backfill-purchase-deliveries]  ROLLBACK");

  // Only ids this script could have created — an auto-id delivery recorded
  // through the app must survive a rollback untouched.
  const ours = new Set();
  for (const p of lines) {
    if (p.date && p.branch) ours.add(deliveryIdFor(p.branch, p.date));
  }
  const linked = lines.filter((p) => p.deliveryId && ours.has(p.deliveryId));
  console.log(`  lines to unlink:      ${linked.length}`);
  console.log(`  delivery ids to check: ${ours.size}`);

  let unlinked = 0;
  for (let i = 0; i < linked.length; i += 400) {
    const batch = db.batch();
    for (const p of linked.slice(i, i + 400)) {
      batch.update(db.collection("purchases").doc(p.id), {
        deliveryId: FieldValue.delete(),
      });
      unlinked++;
    }
    await batch.commit();
  }

  let deleted = 0;
  for (const id of ours) {
    const ref = db.collection("purchaseDelivery").doc(id);
    if ((await ref.get()).exists) {
      await ref.delete();
      deleted++;
    }
  }
  console.log(`  unlinked ${unlinked} lines, deleted ${deleted} delivery docs.`);
}

async function main() {
  const lines = await loadLines();

  if (ROLLBACK) return rollback(lines);

  console.log(`[backfill-purchase-deliveries]${DRY_RUN ? "  (DRY RUN)" : ""}`);
  console.log(`  non-transfer purchase lines: ${lines.length}`);

  const undated = lines.filter((p) => !p.date || !p.branch);
  if (undated.length) {
    // A line with no date has no delivery to belong to, and guessing one would
    // put real money in a month it did not happen in.
    console.error(`  ABORT: ${undated.length} line(s) missing date or branch:`);
    undated.slice(0, 10).forEach((p) => console.error(`    ${p.id} date=${p.date} branch=${p.branch}`));
    process.exit(1);
  }

  // --- Group into deliveries: one per (branch, date) ---
  const groups = new Map();
  for (const p of lines) {
    const id = deliveryIdFor(p.branch, p.date);
    if (!groups.has(id)) {
      groups.set(id, { id, branch: p.branch, date: p.date, lines: [], lineCost: 0 });
    }
    const g = groups.get(id);
    g.lines.push(p);
    g.lineCost += p.totalCost || 0;
  }
  const deliveries = [...groups.values()].sort((a, b) => a.date.localeCompare(b.date));

  // --- Reconcile against the figures as they stand today, per month ---
  //
  // The two sides round at different points, and that is deliberate rather than a
  // defect to engineer away. Today purchaseCost() sums raw line costs and rounds
  // once at the end; those line costs carry nonsense precision (unit costs like
  // 1098.36333, back-computed averages rather than anything a supplier billed).
  // After this runs it sums delivery totals, and a delivery total is a billed
  // invoice amount, so it is stored to the centavo. Rounding 15 deliveries once
  // each cannot land on exactly the same figure as rounding their sum once.
  //
  // So the guard bounds the drift instead of demanding equality: each delivery's
  // rounding moves its total by at most half a centavo, so the whole period can
  // move by at most half a centavo per costed delivery. Anything beyond that is a
  // real error, not rounding, and aborts. The actual drift is always printed —
  // a tolerance that hides the number it tolerated is how a migration quietly
  // loses money.
  const rawMonth = new Map();
  for (const p of lines) {
    const m = p.date.slice(0, 7);
    rawMonth.set(m, (rawMonth.get(m) || 0) + (p.totalCost || 0));
  }
  const storedMonth = new Map();
  for (const d of deliveries) {
    const m = d.date.slice(0, 7);
    // r2 per delivery: exactly the value that will be written to the doc.
    storedMonth.set(m, (storedMonth.get(m) || 0) + r2(d.lineCost));
  }

  console.log("\n  month    deliveries  lines      reported today   ->   after migration   drift  costPending");
  let overBound = false;
  for (const m of [...rawMonth.keys()].sort()) {
    const before = r2(rawMonth.get(m));
    const after = r2(storedMonth.get(m) || 0);
    const inMonth = deliveries.filter((d) => d.date.startsWith(m));
    const costed = inMonth.filter((d) => centavos(d.lineCost) > 0).length;
    const pending = inMonth.length - costed;
    const drift = centavos(after) - centavos(before);
    // Half a centavo per costed delivery, rounded up — the arithmetic maximum.
    const bound = Math.ceil(costed / 2);
    if (Math.abs(drift) > bound) overBound = true;
    console.log(
      `  ${m}   ${String(inMonth.length).padStart(10)}  ${String(inMonth.reduce((s, d) => s + d.lines.length, 0)).padStart(5)}` +
        `   ${peso(before).padStart(17)}  ->  ${peso(after).padStart(17)}   ${String(drift).padStart(5)}c` +
        `  ${String(pending).padStart(3)}${Math.abs(drift) > bound ? `   <-- EXCEEDS BOUND ${bound}c` : ""}`,
    );
  }

  const grandBefore = r2([...rawMonth.values()].reduce((s, v) => s + v, 0));
  const grandAfter = r2([...storedMonth.values()].reduce((s, v) => s + v, 0));
  const costedCount = deliveries.filter((d) => centavos(d.lineCost) > 0).length;
  const grandDrift = centavos(grandAfter) - centavos(grandBefore);
  const grandBound = Math.ceil(costedCount / 2);
  console.log(`\n  grand total   ${peso(grandBefore)}  ->  ${peso(grandAfter)}   drift ${grandDrift}c (bound ${grandBound}c)`);
  console.log(`  deliveries to create: ${deliveries.length}  (costed ${costedCount}, pending ${deliveries.length - costedCount})`);

  // --- Hard guard: no writes unless the money moves only by proven rounding ---
  if (overBound || Math.abs(grandDrift) > grandBound) {
    console.error("\n  ABORT: cost moved by more than delivery rounding can explain. Nothing written.");
    process.exit(1);
  }
  if (lines.length !== deliveries.reduce((s, d) => s + d.lines.length, 0)) {
    console.error("\n  ABORT: not every line landed in a delivery. Nothing written.");
    process.exit(1);
  }

  console.log("\n  per-delivery detail:");
  for (const d of deliveries) {
    const pending = centavos(d.lineCost) === 0;
    console.log(
      `    ${d.id.padEnd(20)} ${String(d.lines.length).padStart(3)} lines  ` +
        `${(pending ? "not yet costed" : peso(d.lineCost)).padStart(20)}`,
    );
  }

  if (DRY_RUN) {
    console.log("\n  DRY RUN — nothing written.");
    return;
  }

  // --- Write ---
  // Delivery doc first, then its lines: a line whose deliveryId points at a
  // missing doc reads as free stock, whereas a delivery with no lines yet is
  // merely cost awaiting quantities (and the Purchases screen shows it as such).
  const now = Timestamp.now();
  let createdDeliveries = 0;
  let linkedLines = 0;
  let skippedLines = 0;

  for (const d of deliveries) {
    const ref = db.collection("purchaseDelivery").doc(d.id);
    const pending = centavos(d.lineCost) === 0;
    const payload = {
      date: d.date,
      branch: d.branch,
      totalCost: r2(d.lineCost),
      createdAt: now,
    };
    // Only set the flag when true — an absent field is the normal case, and a
    // `costPending: false` on every costed delivery is noise forever.
    if (pending) payload.costPending = true;

    // merge:true so a re-run over an already-written delivery is a no-op rather
    // than a rewrite, and so it never clobbers a real total someone has since
    // typed in for a pending month.
    const existing = await ref.get();
    if (existing.exists) {
      const cur = existing.data();
      if (!pending && centavos(cur.totalCost || 0) !== centavos(d.lineCost)) {
        console.error(`    ABORT: ${d.id} exists with ${peso(cur.totalCost || 0)}, expected ${peso(d.lineCost)}.`);
        process.exit(1);
      }
    } else {
      await ref.set(payload);
      createdDeliveries++;
    }

    for (let i = 0; i < d.lines.length; i += 400) {
      const chunk = d.lines.slice(i, i + 400);
      const batch = db.batch();
      let n = 0;
      for (const p of chunk) {
        if (p.deliveryId) { skippedLines++; continue; }
        batch.update(db.collection("purchases").doc(p.id), { deliveryId: d.id });
        n++;
      }
      if (n > 0) await batch.commit();
      linkedLines += n;
    }
  }

  console.log(`\n  created ${createdDeliveries} delivery docs; linked ${linkedLines} lines` +
    `${skippedLines ? `; skipped ${skippedLines} already linked` : ""}.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
