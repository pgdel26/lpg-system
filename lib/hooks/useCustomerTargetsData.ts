import { useState, useEffect, useCallback } from "react";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { targetDocId } from "../customerTargets";
import type { CustomerTarget } from "../types";

// Declared locally, matching every sibling hook — there is no shared toast module.
type ToastFn = (t: { type: string; message: string }) => void;

// NOTE: `settings/customerTargets` (the old countedCategories list) is no longer
// read or written. Targets are per product now, and what counts is derived from
// the catalog's sale sections — see targetProductScope. The document is left in
// Firestore, orphaned and safe to ignore.

export interface UseCustomerTargetsData {
  /** Every target, all months. The page filters to the month it is showing. */
  customerTargets: CustomerTarget[];
  /** False until the targets listener has reported once. */
  targetsLoaded: boolean;
  /** Creates or overwrites one customer's target for one product in one month. */
  saveCustomerTarget: (
    customerId: string,
    month: string,
    product: string,
    targetQty: number,
    discountPerUnit: number,
  ) => Promise<void>;
  removeCustomerTarget: (customerId: string, month: string, product: string) => Promise<void>;
  /** Copies a month's targets forward. Returns how many were written. */
  copyTargetsToMonth: (fromMonth: string, toMonth: string) => Promise<number>;
}

export function useCustomerTargetsData(onToast: ToastFn): UseCustomerTargetsData {
  const [customerTargets, setCustomerTargets] = useState<CustomerTarget[]>([]);
  const [targetsSeen, setTargetsSeen] = useState(false);

  // ---- FIREBASE: targets listener ----
  // The WHOLE collection, unscoped by month. A target is one small document per
  // customer per product per month, and only a handful of customers have
  // agreements, so this stays in the low thousands for years — cheaper than a
  // re-subscribe every time the operator pages back to look at July.
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "customerTargets"),
      (snapshot) => {
        const list: CustomerTarget[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as CustomerTarget));
        setCustomerTargets(list);
        setTargetsSeen(true);
      },
      (err) => {
        console.error("Customer targets listener error:", err);
        setTargetsSeen(true);
      },
    );
    return () => unsub();
  }, []);

  const saveCustomerTarget = useCallback(async (
    customerId: string,
    month: string,
    product: string,
    targetQty: number,
    discountPerUnit: number,
  ) => {
    try {
      // Keyed doc id + merge: saving the same customer-month-product twice
      // updates the one row instead of racing a second one into existence.
      await setDoc(
        doc(db, "customerTargets", targetDocId(customerId, month, product)),
        {
          customerId,
          month,
          product,
          targetQty: Number(targetQty) || 0,
          discountPerUnit: Number(discountPerUnit) || 0,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error("Save customer target error:", err);
      onToast({ type: "error", message: "Could not save the target." });
    }
  }, [onToast]);

  const removeCustomerTarget = useCallback(async (
    customerId: string,
    month: string,
    product: string,
  ) => {
    try {
      await deleteDoc(doc(db, "customerTargets", targetDocId(customerId, month, product)));
    } catch (err) {
      console.error("Remove customer target error:", err);
      onToast({ type: "error", message: "Could not remove the target." });
    }
  }, [onToast]);

  const copyTargetsToMonth = useCallback(async (fromMonth: string, toMonth: string) => {
    // Legacy customer-level documents (no product) are never copied forward —
    // nothing reads them any more, so duplicating one would only plant another
    // invisible row in a new month.
    const pairKey = (customerId: string, product: string) => `${customerId}\u0000${product}`;
    const source = customerTargets.filter((t) => t.month === fromMonth && !!t.product);
    const existing = new Set(
      customerTargets
        .filter((t) => t.month === toMonth && !!t.product)
        .map((t) => pairKey(t.customerId, t.product as string)),
    );
    // Never overwrites a target the destination month already has. Copying
    // forward is a convenience for the rows nobody has set yet; silently
    // replacing a figure someone deliberately typed is not.
    const toWrite = source.filter((t) => !existing.has(pairKey(t.customerId, t.product as string)));
    // Says so out loud: a button that silently does nothing on a month already
    // populated is indistinguishable from a broken one.
    if (toWrite.length === 0) {
      onToast({ type: "success", message: "Nothing to copy — every target here is already set." });
      return 0;
    }

    try {
      const batch = writeBatch(db);
      for (const t of toWrite) {
        batch.set(
          doc(db, "customerTargets", targetDocId(t.customerId, toMonth, t.product as string)),
          {
            customerId: t.customerId,
            month: toMonth,
            product: t.product,
            targetQty: Number(t.targetQty) || 0,
            discountPerUnit: Number(t.discountPerUnit) || 0,
            updatedAt: Timestamp.now(),
          },
        );
      }
      await batch.commit();
      onToast({
        type: "success",
        message: `Copied ${toWrite.length} target${toWrite.length === 1 ? "" : "s"} forward.`,
      });
      return toWrite.length;
    } catch (err) {
      console.error("Copy targets error:", err);
      onToast({ type: "error", message: "Could not copy last month's targets." });
      return 0;
    }
  }, [customerTargets, onToast]);

  return {
    customerTargets,
    targetsLoaded: targetsSeen,
    saveCustomerTarget,
    removeCustomerTarget,
    copyTargetsToMonth,
  };
}
