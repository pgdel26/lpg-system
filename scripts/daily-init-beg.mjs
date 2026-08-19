/**
 * Daily BEG Initialization Script
 *
 * Seeds each outlet's beginning inventory for today from yesterday's closing
 * numbers, preferring the AUDIT (a correction to the physical count) over the
 * computed END. Same rule as carryForwardBeg() in lib/hooks/useInventoryData.ts
 * — keep the two in sync.
 *
 * Run daily at 6:00 AM PHT by .github/workflows/daily-init-beg.yml.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/daily-init-beg.mjs
 *   FIREBASE_SERVICE_ACCOUNT='{...}' node scripts/daily-init-beg.mjs --dry-run
 *
 * Branches and sections are discovered from yesterday's documents rather than
 * hardcoded. The previous version hardcoded both, which broke it twice: it
 * wrote branch-less doc IDs that the app stopped reading when multi-outlet
 * shipped (leaving hundreds of orphan documents and silently disabling this
 * job), and its ["full","empty","accessories"] list would skip any new
 * single-price category. Deriving from the data means a new outlet or a new
 * category is picked up with no change here.
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();
db.settings({ preferRest: true });

const DRY_RUN = process.argv.includes("--dry-run");
/** --date=YYYY-MM-DD overrides "today", for re-running a day the cron missed
 *  (or dry-running one). Defaults to today in PHT. */
const DATE_ARG = process.argv.find((a) => a.startsWith("--date="))?.slice(7);

function getDatePHT(date) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/** 0 is a legitimate count — an outlet can genuinely open or close at zero — so
 *  presence is tested against null/"" only, never falsiness. The old version
 *  used `!== 0` here and would re-seed a day that had correctly opened at 0. */
const isPresent = (v) => v != null && v !== "";

/** Carry-forward rule: an AUDIT is a correction to the physical count, so it
 *  wins over the computed END. Mirrors carryForwardBeg() in useInventoryData.ts. */
function carryForwardBeg(row) {
  return parseFloat(isPresent(row.aud) ? row.aud : row.end) || 0;
}

async function main() {
  const todayDate = DATE_ARG || getDatePHT(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayDate)) {
    console.error(`Invalid --date: ${todayDate}. Expected YYYY-MM-DD.`);
    process.exit(1);
  }
  // Anchored at noon UTC+8 so the -1 day step can't cross a DST/offset edge.
  const prev = new Date(`${todayDate}T12:00:00+08:00`);
  prev.setDate(prev.getDate() - 1);
  const prevDate = getDatePHT(prev);

  console.log(`[daily-init-beg] ${prevDate} AUD/END -> ${todayDate} BEG${DRY_RUN ? "  (DRY RUN)" : ""}`);

  const prevSnap = await db.collection("dailyInventory").where("date", "==", prevDate).get();
  if (prevSnap.empty) {
    console.log(`  No documents for ${prevDate}. Nothing to carry forward.`);
    return;
  }

  const batch = db.batch();
  let written = 0, skipped = 0, orphaned = 0;

  for (const prevDoc of prevSnap.docs) {
    const data = prevDoc.data();
    const { branch, section } = data;

    // Pre-multi-outlet documents (`{date}_{section}`, no branch field) are the
    // debris this script itself created while broken. Never seed from them —
    // the app cannot read them, so they are not a real outlet's inventory.
    if (!branch || !section) {
      orphaned++;
      continue;
    }

    const todayId = `${todayDate}_${branch}_${section}`;
    const todayDoc = await db.doc(`dailyInventory/${todayId}`).get();

    // Guard per document, not globally: one outlet already having BEG must not
    // stop the other outlet from being seeded.
    if (todayDoc.exists) {
      const items = todayDoc.data().items || {};
      if (Object.values(items).some((row) => isPresent(row.beg))) {
        console.log(`  [${branch}/${section}] already has BEG. Skipping.`);
        skipped++;
        continue;
      }
    }

    const items = {};
    for (const [product, row] of Object.entries(data.items || {})) {
      items[product] = { beg: carryForwardBeg(row) };
    }
    if (Object.keys(items).length === 0) {
      skipped++;
      continue;
    }

    const audited = Object.values(data.items || {}).filter((r) => isPresent(r.aud)).length;
    console.log(`  [${branch}/${section}] BEG for ${Object.keys(items).length} products (${audited} from an audit)`);

    if (!DRY_RUN) {
      // merge:true, not a bare set(). A plain set() replaces `items` wholesale
      // and would wipe any audit or correction already entered for today.
      // Firestore deep-merges maps, so this touches only items.<product>.beg.
      batch.set(
        db.doc(`dailyInventory/${todayId}`),
        { date: todayDate, section, branch, items, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      written++;
    }
  }

  if (!DRY_RUN && written > 0) await batch.commit();
  console.log(`[daily-init-beg] Done. ${written} document(s) seeded, ${skipped} skipped, ${orphaned} legacy branch-less doc(s) ignored.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
