import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, orderBy, limit,
  addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { buildPurchaseSections } from "../constants";
import type { Purchase } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// Input for recordPurchase. Bundles the line items and the date field that the
// modal collects, replacing what used to be component state read directly inside
// handleRecordPurchase in page.js.
export interface RecordPurchaseInput {
  /** Line items from the purchase modal. Field names match the PurchaseModal component. */
  items: Array<{
    section: string;
    product: string;
    /** Quantity as a string (from input) or number. */
    qty: string | number;
    /** Unit cost as a string (from input) or number. */
    price: string | number;
  }>;
  /** The date selected in the purchase modal (YYYY-MM-DD). */
  date: string;
}

export interface UsePurchasesDataDeps {
  /**
   * Computed by useProductsData. Injected here so recordPurchase can resolve
   * productCategory per item without owning products data.
   */
  purchaseSections: ReturnType<typeof buildPurchaseSections>;
  onToast: ToastFn;
}

export interface UsePurchasesData {
  purchaseTransactions: Purchase[];
  /**
   * Records a multi-item purchase.
   *
   * Control-flow contract (mirrors useSalesData / recordSale):
   *   - Returns a non-null error STRING for every validation failure and for
   *     any caught exception. The caller is responsible for surfacing this (e.g.
   *     setting modal error state) and must NOT close the modal.
   *   - Returns NULL on success. The hook fires the success toast; the caller
   *     should close the modal when it sees null.
   *
   * Validation rules (identical to handleRecordPurchase in app/page.js):
   *   • date must be non-empty
   *   • items must be non-empty
   *   • each item qty must be > 0
   *   • each item unitCost must be >= 0
   */
  recordPurchase: (input: RecordPurchaseInput) => Promise<string | null>;
  updatePurchase: (
    purchaseId: string,
    data: { quantity: string | number; unitCost: string | number; totalCost: string | number },
  ) => Promise<void>;
  deletePurchase: (purchaseId: string) => Promise<void>;
}

export function usePurchasesData(deps: UsePurchasesDataDeps): UsePurchasesData {
  const { purchaseSections, onToast } = deps;

  const [purchaseTransactions, setPurchaseTransactions] = useState<Purchase[]>([]);

  // ---- FIREBASE: Purchases listener (all recent) ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "purchases"), orderBy("createdAt", "desc"), limit(100)),
      (snapshot) => {
        const list: Purchase[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Purchase));
        setPurchaseTransactions(list);
      },
    );
    return () => unsub();
  }, []);

  // ---- recordPurchase ----
  const recordPurchase = useCallback(async (input: RecordPurchaseInput): Promise<string | null> => {
    const { items, date } = input;

    // --- Validation (identical rules to handleRecordPurchase in app/page.js) ---
    if (!date) return "Please select a date.";
    if (!items || items.length === 0) return "Please add at least one item.";

    for (const item of items) {
      const qty = parseInt(String(item.qty)) || 0;
      const unitCost = parseFloat(String(item.price)) || 0;
      if (qty <= 0) return "Each item must have a quantity of at least 1.";
      if (unitCost < 0) return "Each item must have a valid purchase price.";
    }

    try {
      const now = Timestamp.now();
      let totalItems = 0;

      for (const item of items) {
        const sec = purchaseSections.find((s) => s.key === item.section);
        const qty = parseInt(String(item.qty)) || 1;
        const unitCost = parseFloat(String(item.price)) || 0;

        await addDoc(collection(db, "purchases"), {
          purchaseSection: item.section,
          product: item.product,
          productCategory: sec?.productCategory || "cylinder",
          quantity: qty,
          unitCost,
          totalCost: qty * unitCost,
          date,
          createdAt: now,
        });
        totalItems += qty;
      }

      onToast({
        type: "success",
        message: `Purchase recorded: ${totalItems} item${totalItems > 1 ? "s" : ""}`,
      });
      // Return null on success — caller should close the modal when it sees null.
      return null;
    } catch (error) {
      console.error("Purchase error:", error);
      return "Failed to record purchase.";
    }
  }, [purchaseSections, onToast]);

  // ---- updatePurchase ----
  const updatePurchase = useCallback(async (
    purchaseId: string,
    data: { quantity: string | number; unitCost: string | number; totalCost: string | number },
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, "purchases", purchaseId), {
        quantity: parseInt(String(data.quantity)) || 0,
        unitCost: parseFloat(String(data.unitCost)) || 0,
        totalCost: parseFloat(String(data.totalCost)) || 0,
      });
      onToast({ type: "success", message: "Purchase updated." });
    } catch (error) {
      console.error("Update purchase error:", error);
      onToast({ type: "error", message: "Failed to update purchase." });
    }
  }, [onToast]);

  // ---- deletePurchase ----
  const deletePurchase = useCallback(async (purchaseId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "purchases", purchaseId));
      onToast({ type: "success", message: "Purchase deleted." });
    } catch (error) {
      console.error("Delete purchase error:", error);
      onToast({ type: "error", message: "Failed to delete purchase." });
    }
  }, [onToast]);

  return {
    purchaseTransactions,
    recordPurchase,
    updatePurchase,
    deletePurchase,
  };
}
