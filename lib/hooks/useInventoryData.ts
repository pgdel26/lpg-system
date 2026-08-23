"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  doc, getDoc, onSnapshot, setDoc, Timestamp, deleteField,
} from "firebase/firestore";
import { db } from "../firebase";
import { buildInventorySections } from "../constants";
import { today } from "../utils";
import type { InventoryState, InventoryCell } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

export interface UseInventoryData {
  inventory: InventoryState;
  /**
   * False until EVERY section's dailyInventory listener has delivered a first
   * snapshot for the current {date, branch}. The auto-save in AppDataProvider
   * gates on this: END is computed from BEG + movements, and movements arrive on
   * a different listener, so saving before the inventory docs land would persist
   * an END derived from a missing BEG — and scripts/daily-init-beg.mjs carries
   * END into tomorrow's BEG. Mirrors purchases.datePurchasesLoaded.
   */
  inventoryLoaded: boolean;
  inventoryDate: string;
  setInventoryDate: (date: string) => void;
  /** Expose so consumers (e.g. AppDataProvider) can keep resolvedInventoryRef current.
   *  Set .current = resolvedInventory whenever that derived value changes. */
  resolvedInventoryRef: React.MutableRefObject<InventoryState>;
  handleInventoryChange: (
    sectionKey: string,
    product: string,
    field: keyof InventoryCell,
    value: number | string,
  ) => void;
  saveSection: (sectionKey: string) => void;
  handleFixBeginning: () => Promise<void>;
}

/** Carry-forward rule for seeding the next day's BEG.
 *  An AUDIT is a correction to the physical count, so it wins over the computed
 *  END. 0 is a valid audited count, so presence is checked against null/""
 *  rather than falsiness (same convention as InventoryTable's DIFF cell), and
 *  the `as unknown` cast is there because aud is typed number | FieldValue but
 *  a doc read back can still hold "" from older writes.
 *
 *  CALLERS MUST PASS ROWS READ FROM FIRESTORE, NOT LOCAL STATE: saveSection
 *  puts deleteField() sentinels into row.aud when clearing an audit, and
 *  String(FieldValue) would silently resolve to 0 — writing a phantom zero BEG.
 *
 *  scripts/daily-init-beg.mjs applies this same rule in the 6am PHT cron, which
 *  is the primary mechanism — keep the two in sync. This hook's fallback is the
 *  backstop for what the cron cannot see: an audit entered after it has run. */
function carryForwardBeg(row: InventoryCell): number {
  const aud = row.aud as unknown;
  const audited = aud != null && aud !== "";
  return parseFloat(String(audited ? aud : row.end)) || 0;
}

export function useInventoryData(
  branch: string,
  inventorySections: ReturnType<typeof buildInventorySections>,
  onToast: ToastFn,
): UseInventoryData {
  // ---- State ----
  const [inventory, setInventory] = useState<InventoryState>({});
  const [inventoryDate, setInventoryDate] = useState<string>(today());

  // ---- Refs used by debounced saves ----
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inventoryRef = useRef<InventoryState>(inventory);
  const resolvedInventoryRef = useRef<InventoryState>({});
  const inventorySectionsRef = useRef<ReturnType<typeof buildInventorySections>>(inventorySections);

  // Used by BEG-fallback effect to avoid re-running for the same date
  const begFallbackRanRef = useRef<string | null>(null);

  // ---- Branch-switch safety ----
  // Switching outlets must never let a stale debounced save (armed while
  // viewing the other branch) land in the new branch's docs.
  //
  // State reset uses React's documented "adjust state during render" pattern
  // (tracked via useState, not a ref — this lint config forbids ref access
  // during render) so the reset lands before the new branch's UI ever paints,
  // instead of one render late.
  const [prevBranch, setPrevBranch] = useState(branch);
  if (prevBranch !== branch) {
    setPrevBranch(branch);
    setInventory({});
  }

  // Clearing pending per-section save timers is a real side effect (calling
  // clearTimeout, an external API), so it belongs in an effect rather than
  // render — unlike the state reset above, there's no setState call here for
  // set-state-in-effect to flag. saveSection no longer bails on empty rawItems
  // alone (it has to write when movements exist but nothing was typed), so
  // clearing the timers outright is now the only guarantee, not a backstop.
  useEffect(() => {
    Object.values(saveTimerRef.current).forEach(clearTimeout);
    saveTimerRef.current = {};
  }, [branch]);

  // ---- Ref-sync effects ----
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
  useEffect(() => { inventorySectionsRef.current = inventorySections; }, [inventorySections]);

  // Stable string dep: changes only when the set of section keys changes (e.g. a
  // new category added to Firestore), NOT on every products snapshot. Prevents
  // listener churn caused by inventorySections getting a new reference on each
  // products snapshot even when the category structure is unchanged.
  const sectionKeysString = inventorySections.map((s) => s.key).join(",");

  // ---- First-snapshot tracking ----
  // Which sections' dailyInventory listeners have reported in for the CURRENT
  // {date, branch, section set}. Reset via the same "adjust state during
  // render" pattern as the branch reset above, so the flag drops before the new
  // scope's UI paints rather than one render late. Keyed on the date too:
  // switching days re-subscribes, and yesterday's snapshots say nothing about
  // whether today's docs have arrived.
  const loadScopeKey = `${inventoryDate}|${branch}|${sectionKeysString}`;
  const [prevLoadScope, setPrevLoadScope] = useState(loadScopeKey);
  const [loadedSections, setLoadedSections] = useState<string[]>([]);
  if (prevLoadScope !== loadScopeKey) {
    setPrevLoadScope(loadScopeKey);
    setLoadedSections([]);
  }
  // Empty section list means the products snapshot hasn't landed either, which
  // is equally a reason not to save.
  const allSectionKeys = sectionKeysString ? sectionKeysString.split(",") : [];
  const inventoryLoaded = allSectionKeys.length > 0
    && allSectionKeys.every((k) => loadedSections.includes(k));

  // ---- FIREBASE: Daily inventory listener ----
  // Section keys come from the live section list ("full", "empty", + one per
  // single-price category), so a new category gets its own daily-inventory doc.
  // Doc ID includes branch so PILI and CADLAN never share a document.
  useEffect(() => {
    const sectionKeys = sectionKeysString ? sectionKeysString.split(",") : [];
    const unsubscribers = sectionKeys.map((sectionKey) => {
      const docId = `${inventoryDate}_${branch}_${sectionKey}`;
      return onSnapshot(doc(db, "dailyInventory", docId), (snapshot) => {
        setInventory((prev) => ({
          ...prev,
          [sectionKey]: snapshot.exists() ? (snapshot.data().items || {}) : {},
        }));
        // A missing doc is a real answer, not a pending one — mark the section
        // reported either way, or a brand-new day would never unblock saving.
        setLoadedSections((prev) => (prev.includes(sectionKey) ? prev : [...prev, sectionKey]));
      });
    });
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [inventoryDate, branch, sectionKeysString]);

  // ---- Client-side BEG fallback: seed from the previous day's AUDIT (or END) if BEG is missing ----
  useEffect(() => {
    begFallbackRanRef.current = null;
    const sectionKeys = sectionKeysString ? sectionKeysString.split(",") : [];
    const prevDate = (() => {
      const d = new Date(inventoryDate + "T00:00:00+08:00");
      d.setDate(d.getDate() - 1);
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    })();
    let cancelled = false;
    // Small delay to let Firestore listeners populate first
    const timer = setTimeout(async () => {
      if (cancelled) return;
      const inv = inventoryRef.current;
      const isBegPresent = (beg: unknown) => beg != null && beg !== "";
      const hasBeg = sectionKeys.some((sk) =>
        Object.values(inv[sk] || {}).some((row) => isBegPresent(row.beg))
      );
      if (hasBeg || begFallbackRanRef.current === inventoryDate) return;
      begFallbackRanRef.current = inventoryDate;
      try {
        // Fetch previous day's inventory docs — they already have `end` (and any `aud`) saved
        const prevItems: InventoryState = {};
        for (const sk of sectionKeys) {
          const snap = await getDoc(doc(db, "dailyInventory", `${prevDate}_${branch}_${sk}`));
          prevItems[sk] = snap.exists() ? (snap.data().items || {}) : {};
        }
        if (cancelled) return;
        const hasAnyPrev = sectionKeys.some((sk) => Object.keys(prevItems[sk]).length > 0);
        if (!hasAnyPrev) return;
        // Set BEG = previous day's AUDIT where one was recorded, else its END
        setInventory((prev) => {
          const stillMissing = !sectionKeys.some((sk) =>
            Object.values(prev[sk] || {}).some((row) => isBegPresent(row.beg))
          );
          if (!stillMissing) return prev;
          const updated = { ...prev };
          for (const sk of sectionKeys) {
            const newItems = { ...(prev[sk] || {}) };
            for (const [product, row] of Object.entries(prevItems[sk])) {
              const beg = carryForwardBeg(row);
              newItems[product] = { ...(newItems[product] || {}), beg };
            }
            updated[sk] = newItems;
          }
          return updated;
        });
      } catch (err) {
        console.error("BEG fallback error:", err);
      }
    }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [inventoryDate, branch, sectionKeysString]);

  // ---- Update a single inventory cell (local state, debounced save) ----
  const handleInventoryChange = useCallback((
    sectionKey: string,
    product: string,
    field: keyof InventoryCell,
    value: number | string,
  ) => {
    setInventory((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [product]: {
          ...(prev[sectionKey]?.[product] || {}),
          [field]: value,
        },
      },
    }));
  }, []);

  // ---- Save a section to Firestore (debounced) ----
  // Saves all resolved values including computed END for reporting
  const saveSection = useCallback((sectionKey: string) => {
    if (saveTimerRef.current[sectionKey]) {
      clearTimeout(saveTimerRef.current[sectionKey]);
    }
    saveTimerRef.current[sectionKey] = setTimeout(async () => {
      const docId = `${inventoryDate}_${branch}_${sectionKey}`;
      const rawItems = inventoryRef.current[sectionKey] || {};
      const resolvedItems = resolvedInventoryRef.current[sectionKey] || {};
      const section = inventorySectionsRef.current.find((s) => s.key === sectionKey);

      // Persist when EITHER someone has typed into this section, OR the day has
      // real movement in it.
      //
      // This used to be `rawItems.length === 0` alone, which silently excluded
      // any outlet stocked purely by transfer. CADLAN's inventory is entirely
      // inbound transfers plus sales with nothing typed, so this returned every
      // single time: its END rendered on screen (resolvedInventory merges the
      // stored doc with live movements) but no dailyInventory document was ever
      // written, leaving the nightly BEG batch nothing to carry forward. The
      // outlet could never accumulate a beginning balance.
      //
      // Movement is tested rather than mere presence because resolvedInventory
      // holds a row for EVERY product in the section whether or not anything
      // happened — a bare length check would write a document every day for
      // every section at every outlet.
      //
      // The movement columns are derived from the section's own definition
      // (anything sourced from sales / purchases / swaps / refunds / another
      // section) rather than a hardcoded field list, so a new product category
      // brings its columns along with no change here — see
      // .claude/skills/safe-category-change.md.
      const movementFields = (section?.columns || [])
        .filter((c) => c.salesSource || c.purchaseSource || c.swapSource || c.refundSource || c.source)
        .map((c) => c.field);
      const hasMovement = Object.values(resolvedItems).some((row) => {
        const cells = row as Record<string, unknown>;
        return movementFields.some((f) => {
          const v = cells[f];
          return v != null && v !== "" && (parseFloat(String(v)) || 0) !== 0;
        });
      });
      if (Object.keys(rawItems).length === 0 && !hasMovement) return;
      // Merge raw inventory with resolved values and compute END
      const items: Record<string, InventoryCell | Record<string, unknown>> = {};
      for (const product of Object.keys({ ...rawItems, ...resolvedItems })) {
        const row: Record<string, unknown> = { ...rawItems[product], ...resolvedItems[product] };
        if (section) {
          row.end = section.calcEnd(row as InventoryCell);
        }
        // Don't persist empty/cleared audit values. Use deleteField() rather than
        // `delete row.x`: with { merge: true } an omitted key is left untouched, so a
        // cleared aud/reason would silently revert. deleteField() forces removal, and
        // works for dotted product names since it targets an object key, not a path.
        if (row.aud == null || row.aud === "") row.aud = deleteField();
        if (row.audReason == null || row.audReason === "") row.audReason = deleteField();
        items[product] = row as InventoryCell;
      }
      try {
        await setDoc(doc(db, "dailyInventory", docId), {
          date: inventoryDate, section: sectionKey, branch,
          items, updatedAt: Timestamp.now(),
        }, { merge: true });
      } catch (error) {
        console.error("Save error:", error);
        onToast({ type: "error", message: "Failed to save. Check connection." });
      }
    }, 500);
  }, [inventoryDate, branch, onToast]);

  // ---- Manually re-pull BEG from the previous day's saved AUDIT / END ----
  // The auto-fallback (see effect above) only fires when BEG is entirely missing.
  // This handler is the manual trigger: it overwrites the viewed date's BEG for
  // every product with the prior day's audited count (or END), then persists each section.
  const handleFixBeginning = useCallback(async () => {
    const sectionKeys = inventorySectionsRef.current.map((s) => s.key);
    const prevDate = (() => {
      const d = new Date(inventoryDate + "T00:00:00+08:00");
      d.setDate(d.getDate() - 1);
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    })();
    try {
      const prevItems: InventoryState = {};
      for (const sk of sectionKeys) {
        const snap = await getDoc(doc(db, "dailyInventory", `${prevDate}_${branch}_${sk}`));
        prevItems[sk] = snap.exists() ? (snap.data().items || {}) : {};
      }
      const hasAnyPrev = sectionKeys.some((sk) => Object.keys(prevItems[sk]).length > 0);
      if (!hasAnyPrev) {
        onToast({ type: "error", message: `No saved inventory found for ${prevDate}.` });
        return;
      }
      setInventory((prev) => {
        const updated = { ...prev };
        for (const sk of sectionKeys) {
          const newItems = { ...(prev[sk] || {}) };
          for (const [product, row] of Object.entries(prevItems[sk])) {
            const beg = carryForwardBeg(row);
            newItems[product] = { ...(newItems[product] || {}), beg };
          }
          updated[sk] = newItems;
        }
        return updated;
      });
      // Persist so the re-pulled BEG survives a reload. saveSection reads
      // inventoryRef.current, which the sync effect updates from the setInventory above.
      sectionKeys.forEach((sk) => saveSection(sk));
      onToast({ type: "success", message: `Beginning inventory re-pulled from ${prevDate}.` });
    } catch (err) {
      console.error("Fix beginning error:", err);
      onToast({ type: "error", message: "Failed to fix beginning inventory." });
    }
  }, [inventoryDate, branch, saveSection, onToast]);

  // ---- Cleanup: clear all pending per-section save timers on unmount ----
  // (The debounced "save all" timer lives in AppDataProvider, which clears its own.)
  useEffect(() => {
    const saveTimers = saveTimerRef;
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  return {
    inventory,
    inventoryLoaded,
    inventoryDate,
    setInventoryDate,
    resolvedInventoryRef,
    handleInventoryChange,
    saveSection,
    handleFixBeginning,
  };
}
