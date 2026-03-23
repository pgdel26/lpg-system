/**
 * Fix BEG for today — paste this into your browser console.
 *
 * Sets today's BEG = yesterday's AUD (if exists) or yesterday's END.
 */

(async () => {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js");
  const { getFirestore, doc, getDoc, setDoc, Timestamp } = await import("https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js");

  const app = initializeApp({
    apiKey: "AIzaSyAQlnug8U_CvnyODtaT3unNvLY0FjQvPr8",
    authDomain: "gasul-inventory.firebaseapp.com",
    projectId: "gasul-inventory",
    storageBucket: "gasul-inventory.firebasestorage.app",
    messagingSenderId: "473215094403",
    appId: "1:473215094403:web:0334f6366587cbdf8215b6",
  }, "fix-beg-" + Date.now());
  const db = getFirestore(app);

  // Get today and yesterday in YYYY-MM-DD (Philippine Time)
  const toDateStr = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const todayDate = toDateStr(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const prevDate = toDateStr(yesterday);

  console.log(`Fixing BEG for ${todayDate} using END/AUD from ${prevDate}...`);

  const sectionKeys = ["full", "empty", "accessories"];

  for (const sk of sectionKeys) {
    // Fetch yesterday's inventory
    const prevSnap = await getDoc(doc(db, "dailyInventory", `${prevDate}_${sk}`));
    if (!prevSnap.exists()) {
      console.log(`  [${sk}] No data for ${prevDate}, skipping.`);
      continue;
    }
    const prevItems = prevSnap.data().items || {};

    // Fetch today's inventory (may or may not exist)
    const todayDocId = `${todayDate}_${sk}`;
    const todaySnap = await getDoc(doc(db, "dailyInventory", todayDocId));
    const todayItems = todaySnap.exists() ? (todaySnap.data().items || {}) : {};

    // Build new items: keep today's existing data, but set beg from yesterday's aud/end
    const newItems = { ...todayItems };
    let count = 0;
    for (const [product, row] of Object.entries(prevItems)) {
      const beg = (row.aud != null && row.aud !== "" && row.aud !== undefined)
        ? (parseFloat(row.aud) || 0)
        : (parseFloat(row.end) || 0);
      newItems[product] = { ...(newItems[product] || {}), beg };
      count++;
    }

    await setDoc(doc(db, "dailyInventory", todayDocId), {
      date: todayDate,
      section: sk,
      items: newItems,
      updatedAt: Timestamp.now(),
    }, { merge: true });

    console.log(`  [${sk}] Updated BEG for ${count} products`);
  }

  console.log("Done! Refresh the page to see updated BEG values.");
})();
