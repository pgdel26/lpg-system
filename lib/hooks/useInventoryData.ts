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

export function useInventoryData(
  inventorySections: ReturnType<typeof buildInventorySections>,
  onToast: ToastFn,
): UseInventoryData {
  // ---- State ----
  const [inventory, setInventory] = useState<InventoryState>({});
  const [inventoryDate, setInventoryDate] = useState<string>(today());

  // ---- Refs used by debounced saves ----
  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const saveAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inventoryRef = useRef<InventoryState>(inventory);
  const resolvedInventoryRef = useRef<InventoryState>({});
  const inventorySectionsRef = useRef<ReturnType<typeof buildInventorySections>>(inventorySections);

  // Used by BEG-fallback effect to avoid re-running for the same date
  const begFallbackRanRef = useRef<string | null>(null);

  // ---- Ref-sync effects ----
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
  useEffect(() => { inventorySectionsRef.current = inventorySections; }, [inventorySections]);

  // ---- FIREBASE: Daily inventory listener ----
  // Section keys are stable ("full", "empty", "accessories") regardless of product list
  useEffect(() => {
    const sectionKeys = ["full", "empty", "accessories"];
    const unsubscribers = sectionKeys.map((sectionKey) => {
      const docId = `${inventoryDate}_${sectionKey}`;
      return onSnapshot(doc(db, "dailyInventory", docId), (snapshot) => {
        if (snapshot.exists()) {
          setInventory((prev) => ({
            ...prev,
            [sectionKey]: snapshot.data().items || {},
          }));
        } else {
          setInventory((prev) => ({
            ...prev,
            [sectionKey]: {},
          }));
        }
      });
    });
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [inventoryDate]);

  // ---- Client-side BEG fallback: use previous day's saved END if BEG is missing ----
  useEffect(() => {
    begFallbackRanRef.current = null;
    const sectionKeys = ["full", "empty", "accessories"];
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
      const isBegPresent = (beg: unknown) => beg != null && beg !== "" && beg !== 0;
      const hasBeg = sectionKeys.some((sk) =>
        Object.values(inv[sk] || {}).some((row) => isBegPresent(row.beg))
      );
      if (hasBeg || begFallbackRanRef.current === inventoryDate) return;
      begFallbackRanRef.current = inventoryDate;
      try {
        // Fetch previous day's inventory docs — they already have `end` saved
        const prevItems: InventoryState = {};
        for (const sk of sectionKeys) {
          const snap = await getDoc(doc(db, "dailyInventory", `${prevDate}_${sk}`));
          prevItems[sk] = snap.exists() ? (snap.data().items || {}) : {};
        }
        if (cancelled) return;
        const hasAnyPrev = sectionKeys.some((sk) => Object.keys(prevItems[sk]).length > 0);
        if (!hasAnyPrev) return;
        // Set BEG = previous day's END
        setInventory((prev) => {
          const stillMissing = !sectionKeys.some((sk) =>
            Object.values(prev[sk] || {}).some((row) => isBegPresent(row.beg))
          );
          if (!stillMissing) return prev;
          const updated = { ...prev };
          for (const sk of sectionKeys) {
            const newItems = { ...(prev[sk] || {}) };
            for (const [product, row] of Object.entries(prevItems[sk])) {
              const beg = row.end != null ? (parseFloat(String(row.end)) || 0) : 0;
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
  }, [inventoryDate]);

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
      const docId = `${inventoryDate}_${sectionKey}`;
      const rawItems = inventoryRef.current[sectionKey] || {};
      const resolvedItems = resolvedInventoryRef.current[sectionKey] || {};
      // Skip saving if raw inventory is empty and no BEG exists (avoids writing stale data to a new day)
      if (Object.keys(rawItems).length === 0) return;
      const section = inventorySectionsRef.current.find((s) => s.key === sectionKey);
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
          date: inventoryDate, section: sectionKey,
          items, updatedAt: Timestamp.now(),
        }, { merge: true });
      } catch (error) {
        console.error("Save error:", error);
        onToast({ type: "error", message: "Failed to save. Check connection." });
      }
    }, 500);
  }, [inventoryDate, onToast]);

  // ---- Manually re-pull BEG from the previous day's saved END ----
  // The auto-fallback (see effect above) only fires when BEG is entirely missing.
  // This handler is the manual trigger: it overwrites the viewed date's BEG for
  // every product with the prior day's END, then persists each section.
  const handleFixBeginning = useCallback(async () => {
    const sectionKeys = ["full", "empty", "accessories"];
    const prevDate = (() => {
      const d = new Date(inventoryDate + "T00:00:00+08:00");
      d.setDate(d.getDate() - 1);
      return d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    })();
    try {
      const prevItems: InventoryState = {};
      for (const sk of sectionKeys) {
        const snap = await getDoc(doc(db, "dailyInventory", `${prevDate}_${sk}`));
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
            const beg = row.end != null ? (parseFloat(String(row.end)) || 0) : 0;
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
  }, [inventoryDate, saveSection, onToast]);

  // ---- Cleanup: clear all pending timers on unmount ----
  useEffect(() => {
    const saveAllTimer = saveAllTimerRef;
    const saveTimers = saveTimerRef;
    return () => {
      if (saveAllTimer.current) clearTimeout(saveAllTimer.current);
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  return {
    inventory,
    inventoryDate,
    setInventoryDate,
    resolvedInventoryRef,
    handleInventoryChange,
    saveSection,
    handleFixBeginning,
  };
}
