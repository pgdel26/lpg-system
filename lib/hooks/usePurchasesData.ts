import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, updateDoc, deleteDoc, doc, Timestamp, writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import { buildPurchaseSections, DEFAULT_BRANCH_ID } from "../constants";
import type { Purchase, BranchId } from "../types";

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

// Input for recordTransfer — moves stock between two outlets.
export interface RecordTransferInput {
  fromBranch: BranchId;
  toBranch: BranchId;
  /** Line items, one per product being transferred. */
  items: Array<{
    section: string;
    product: string;
    /** Quantity as a string (from input) or number. */
    qty: string | number;
  }>;
  /** The date the transfer happened (YYYY-MM-DD). */
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
  /**
   * Moves stock between two outlets by writing a matched pair of purchase
   * docs in one atomic batch — a negative-quantity entry for `fromBranch` and
   * a positive-quantity entry for `toBranch`, both tagged `isTransfer: true`.
   * The batch guarantees neither side is ever written without the other.
   *
   * Control-flow contract mirrors recordPurchase: non-null error string on
   * validation failure/exception (caller keeps the modal open), null on
   * success (caller closes it).
   */
  recordTransfer: (input: RecordTransferInput) => Promise<string | null>;
  updatePurchase: (
    purchaseId: string,
    data: { quantity: string | number; unitCost: string | number; totalCost: string | number },
  ) => Promise<void>;
  deletePurchase: (purchaseId: string) => Promise<void>;
  /** Deletes both docs of a transfer pair together, atomically, by their shared transferGroupId. */
  deleteTransfer: (transferGroupId: string) => Promise<void>;
}

export function usePurchasesData(deps: UsePurchasesDataDeps): UsePurchasesData {
  const { purchaseSections, onToast } = deps;

  const [purchaseTransactions, setPurchaseTransactions] = useState<Purchase[]>([]);

  // ---- FIREBASE: Purchases listener (all recent, company-wide) ----
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
          // Purchases aren't outlet-scoped (one shared screen/collection), but
          // every doc still gets a default branch stamp for schema consistency
          // with the other collections.
          branch: DEFAULT_BRANCH_ID,
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

  // ---- recordTransfer ----
  const recordTransfer = useCallback(async (input: RecordTransferInput): Promise<string | null> => {
    const { fromBranch, toBranch, items, date } = input;

    if (!date) return "Please select a date.";
    if (!fromBranch || !toBranch) return "Please select both outlets.";
    if (fromBranch === toBranch) return "Source and destination outlets must be different.";
    if (!items || items.length === 0) return "Please add at least one item.";

    for (const item of items) {
      const qty = parseInt(String(item.qty)) || 0;
      if (qty <= 0) return "Each item must have a quantity of at least 1.";
    }

    try {
      const now = Timestamp.now();
      const batch = writeBatch(db);
      let totalItems = 0;

      for (const item of items) {
        const sec = purchaseSections.find((s) => s.key === item.section);
        const quantity = parseInt(String(item.qty)) || 1;
        // Shared by both docs in this item's pair so the UI can merge them
        // back into a single displayed row, and so deleteTransfer can find
        // and remove both sides together.
        const transferGroupId = doc(collection(db, "purchases")).id;
        const base = {
          purchaseSection: item.section,
          product: item.product,
          productCategory: sec?.productCategory || "cylinder",
          unitCost: 0,
          totalCost: 0,
          date,
          isTransfer: true,
          transferGroupId,
          createdAt: now,
        };

        // One atomic batch for the whole transfer — every item's pair commits
        // together, or none of them do.
        batch.set(doc(collection(db, "purchases")), {
          ...base, quantity: -quantity, branch: fromBranch, transferBranch: toBranch,
        });
        batch.set(doc(collection(db, "purchases")), {
          ...base, quantity, branch: toBranch, transferBranch: fromBranch,
        });
        totalItems += quantity;
      }

      await batch.commit();

      onToast({
        type: "success",
        message: `Transferred ${totalItems} item${totalItems > 1 ? "s" : ""} from ${fromBranch} to ${toBranch}.`,
      });
      return null;
    } catch (error) {
      console.error("Transfer error:", error);
      return "Failed to record transfer.";
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

  // ---- deleteTransfer ----
  const deleteTransfer = useCallback(async (transferGroupId: string): Promise<void> => {
    try {
      const snap = await getDocs(query(collection(db, "purchases"), where("transferGroupId", "==", transferGroupId)));
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      onToast({ type: "success", message: "Transfer deleted." });
    } catch (error) {
      console.error("Delete transfer error:", error);
      onToast({ type: "error", message: "Failed to delete transfer." });
    }
  }, [onToast]);

  return {
    purchaseTransactions,
    recordPurchase,
    recordTransfer,
    updatePurchase,
    deletePurchase,
    deleteTransfer,
  };
}
