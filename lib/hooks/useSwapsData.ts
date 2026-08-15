import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { fmt } from "../utils";
import type { Swap } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// Input for recordSwap. Bundles the fields handleRecordSwap currently reads
// from component state (modal inputs + customer-selection fields).
export interface RecordSwapInput {
  /** The product being handed in (or "Other" to trigger custom name). */
  productFrom: string;
  /** The product being purchased / going out. */
  productTo: string;
  /** The price paid for the swap. */
  price: string | number;
  /** When productFrom === "Other", the freeform name typed by the user. */
  customFrom: string;
  /** ID of the existing selected customer (empty string if none). */
  selectedCustomerId: string;
  /** True when the user is adding a brand-new customer inline. */
  isNewCustomer: boolean;
  /** New customer name (used when isNewCustomer is true). */
  newCustomerName: string;
  /** New customer phone (used when isNewCustomer is true). */
  newCustomerPhone: string;
}

export interface UseSwapsDataDeps {
  branch: string;
  inventoryDate: string;
  /**
   * Owned by the customers hook. Injected here so recordSwap can look up or
   * create a customer without owning that logic.
   */
  findOrCreateCustomer: (
    isNew: boolean,
    selectedId: string,
    newName: string,
    newPhone: string,
  ) => Promise<{ id: string; name: string }>;
  onToast: ToastFn;
}

export interface UseSwapsData {
  swaps: Swap[];
  /**
   * Records a cylinder swap.
   *
   * Control-flow contract (mirrors useSalesData / recordSale):
   *   - Returns a non-null error STRING for every validation failure and for
   *     any caught exception. The caller is responsible for surfacing this (e.g.
   *     setting modal error state) and must NOT close the modal.
   *   - Returns NULL on success. The hook fires the success toast; the caller
   *     should close the modal and reset its inputs when it sees null.
   *
   * Validation rules (identical to handleRecordSwap in app/page.js):
   *   • productFrom must be selected
   *   • productTo must be selected
   *   • when productFrom === "Other", customFrom must be non-empty
   *   • when isNewCustomer, newCustomerName must be non-empty
   *   • resolvedFrom must differ from productTo
   *   • price must be > 0
   */
  recordSwap: (input: RecordSwapInput) => Promise<string | null>;
  updateSwap: (
    swapId: string,
    data: { productFrom: string; productTo: string; price: string | number },
  ) => Promise<void>;
  deleteSwap: (swapId: string) => Promise<void>;
}

export function useSwapsData(deps: UseSwapsDataDeps): UseSwapsData {
  const { branch, inventoryDate, findOrCreateCustomer, onToast } = deps;

  const [swaps, setSwaps] = useState<Swap[]>([]);

  // ---- Branch-switch safety ----
  // Without this, switching outlets leaves the previous branch's data on
  // screen under the new branch's label until the new listener's first
  // snapshot arrives. React's documented "adjust state during render"
  // pattern (tracked via useState, not a ref) clears it immediately.
  const [prevBranch, setPrevBranch] = useState(branch);
  if (prevBranch !== branch) {
    setPrevBranch(branch);
    setSwaps([]);
  }

  // ---- FIREBASE: Swaps listener (by date + branch) ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, "swaps"),
        where("date", "==", inventoryDate),
        where("branch", "==", branch),
        orderBy("createdAt", "desc"),
      ),
      (snapshot) => {
        const list: Swap[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Swap));
        setSwaps(list);
      },
    );
    return () => unsub();
  }, [inventoryDate, branch]);

  // ---- recordSwap ----
  const recordSwap = useCallback(async (input: RecordSwapInput): Promise<string | null> => {
    const {
      productFrom,
      productTo,
      price,
      customFrom,
      selectedCustomerId,
      isNewCustomer,
      newCustomerName,
      newCustomerPhone,
    } = input;

    // --- Validation (identical rules to handleRecordSwap in app/page.js) ---
    if (!productFrom) return "Please select the product to swap.";
    if (!productTo) return "Please select the product to buy.";
    if (productFrom === "Other" && !customFrom.trim()) return "Please enter the product name.";
    if (isNewCustomer && !newCustomerName.trim()) return "Please enter customer name.";

    const resolvedFrom = productFrom === "Other" ? customFrom.trim() : productFrom;
    const resolvedTo = productTo;
    if (resolvedFrom === resolvedTo) return "Products must be different.";

    const parsedPrice = parseFloat(String(price)) || 0;
    if (parsedPrice <= 0) return "Please enter a purchase price.";

    try {
      let customerId = "";
      let customerName = "";

      if (isNewCustomer || selectedCustomerId) {
        const result = await findOrCreateCustomer(
          isNewCustomer,
          selectedCustomerId,
          newCustomerName,
          newCustomerPhone,
        );
        customerId = result.id;
        customerName = result.name;
      }

      await addDoc(collection(db, "swaps"), {
        productFrom: resolvedFrom,
        productTo: resolvedTo,
        price: parsedPrice,
        customerId,
        customerName,
        date: inventoryDate,
        branch,
        createdAt: Timestamp.now(),
      });

      onToast({
        type: "success",
        message: `Swap recorded: ${resolvedFrom} → ${resolvedTo} (${fmt(parsedPrice)})`,
      });
      // Return null on success — caller should close the modal when it sees null.
      return null;
    } catch (error) {
      console.error("Swap error:", error);
      return "Failed to record swap.";
    }
  }, [branch, inventoryDate, findOrCreateCustomer, onToast]);

  // ---- updateSwap ----
  const updateSwap = useCallback(async (
    swapId: string,
    data: { productFrom: string; productTo: string; price: string | number },
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, "swaps", swapId), {
        productFrom: data.productFrom || "",
        productTo: data.productTo || "",
        price: parseFloat(String(data.price)) || 0,
      });
      onToast({ type: "success", message: "Swap updated." });
    } catch (error) {
      console.error("Update swap error:", error);
      onToast({ type: "error", message: "Failed to update swap." });
    }
  }, [onToast]);

  // ---- deleteSwap ----
  const deleteSwap = useCallback(async (swapId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "swaps", swapId));
      onToast({ type: "success", message: "Swap deleted." });
    } catch (error) {
      console.error("Delete swap error:", error);
      onToast({ type: "error", message: "Failed to delete swap." });
    }
  }, [onToast]);

  return {
    swaps,
    recordSwap,
    updateSwap,
    deleteSwap,
  };
}
