/**
 * Fix BEG for today — run with: node scripts/fix-beg-today.js
 *
 * Sets today's BEG = yesterday's AUD (if exists) or yesterday's END.
 * Uses Firebase Admin SDK to bypass Firestore security rules.
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

(async () => {
  // Get today and yesterday in YYYY-MM-DD (Philippine Time)
  const toDateStr = (d) =>
    d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const todayDate = toDateStr(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const prevDate = toDateStr(yesterday);

  console.log(`Fixing BEG for ${todayDate} using END/AUD from ${prevDate}...`);

  const sectionKeys = ["full", "empty", "accessories"];

  for (const sk of sectionKeys) {
    // Fetch yesterday's inventory
    const prevSnap = await db
      .collection("dailyInventory")
      .doc(`${prevDate}_${sk}`)
      .get();
    if (!prevSnap.exists) {
      console.log(`  [${sk}] No data for ${prevDate}, skipping.`);
      continue;
    }
    const prevItems = prevSnap.data().items || {};

    // Fetch today's inventory (may or may not exist)
    const todayDocId = `${todayDate}_${sk}`;
    const todaySnap = await db
      .collection("dailyInventory")
      .doc(todayDocId)
      .get();
    const todayItems = todaySnap.exists ? todaySnap.data().items || {} : {};

    // Build new items: keep today's existing data, but set beg from yesterday's aud/end
    const newItems = { ...todayItems };
    let count = 0;
    for (const [product, row] of Object.entries(prevItems)) {
      const beg =
        row.aud != null && row.aud !== "" && row.aud !== undefined
          ? parseFloat(row.aud) || 0
          : parseFloat(row.end) || 0;
      newItems[product] = { ...(newItems[product] || {}), beg };
      count++;
    }

    await db
      .collection("dailyInventory")
      .doc(todayDocId)
      .set(
        {
          date: todayDate,
          section: sk,
          items: newItems,
          updatedAt: admin.firestore.Timestamp.now(),
        },
        { merge: true }
      );

    console.log(`  [${sk}] Updated BEG for ${count} products`);
  }

  console.log("Done! Refresh the page to see updated BEG values.");
  process.exit(0);
})();
