import { useState, useEffect, useCallback } from "react";
import {
  collection, doc, onSnapshot, setDoc, deleteDoc, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { targetDocId } from "../customerTargets";
import { today } from "../utils";
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
  /**
   * Sets the target VOLUME on one product, leaving the discount untouched.
   *
   * Split from the discount deliberately: the discount is logged, and a single
   * save that wrote both would either log every volume edit as a discount
   * change or let the volume path overwrite a rate without logging it.
   */
  saveCustomerTargetQty: (
    customerId: string,
    product: string,
    targetQty: number,
  ) => Promise<void>;
  /** Sets a new discount and appends it to the product's history. */
  setCustomerDiscount: (
    customerId: string,
    product: string,
    discountPerUnit: number,
  ) => Promise<boolean>;
  removeCustomerTarget: (customerId: string, product: string) => Promise<void>;
}

export function useCustomerTargetsData(onToast: ToastFn): UseCustomerTargetsData {
  const [customerTargets, setCustomerTargets] = useState<CustomerTarget[]>([]);
  const [targetsSeen, setTargetsSeen] = useState(false);

  // ---- FIREBASE: targets listener ----
  // The whole collection. One small document per customer per product, standing
  // rather than per month, so it no longer grows with time at all — only with
  // the number of agreements, which is a handful.
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

  const saveCustomerTargetQty = useCallback(async (
    customerId: string,
    product: string,
    targetQty: number,
  ) => {
    try {
      // Keyed doc id + merge: saving the same customer-product twice updates the
      // one row instead of racing a second one into existence. merge also means
      // this never clears a discount it wasn't given.
      //
      // No `month` is written. A standing agreement that carried one would be
      // skipped by every reader as a legacy row — see standingTargets().
      await setDoc(
        doc(db, "customerTargets", targetDocId(customerId, product)),
        {
          customerId,
          product,
          targetQty: Number(targetQty) || 0,
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
    } catch (err) {
      console.error("Save customer target error:", err);
      onToast({ type: "error", message: "Could not save the target." });
    }
  }, [onToast]);

  const setCustomerDiscount = useCallback(async (
    customerId: string,
    product: string,
    discountPerUnit: number,
  ): Promise<boolean> => {
    const rate = Number(discountPerUnit) || 0;
    const existing = customerTargets.find(
      (t) => t.customerId === customerId && t.product === product && !t.month,
    );
    // Setting the same rate again is not a change. Logging it would fill the
    // history with entries that say nothing happened.
    if (existing && Number(existing.discountPerUnit) === rate) {
      onToast({ type: "error", message: "That is already the current discount." });
      return false;
    }

    try {
      await setDoc(
        doc(db, "customerTargets", targetDocId(customerId, product)),
        {
          customerId,
          product,
          discountPerUnit: rate,
          // arrayUnion would drop an entry identical to one already in the log —
          // the same rate could legitimately come back later. The array is read,
          // appended and written whole instead.
          discountHistory: [
            ...(existing?.discountHistory || []),
            { discountPerUnit: rate, from: today(), changedAt: Timestamp.now() },
          ],
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      );
      return true;
    } catch (err) {
      console.error("Set customer discount error:", err);
      onToast({ type: "error", message: "Could not save the discount." });
      return false;
    }
  }, [customerTargets, onToast]);

  const removeCustomerTarget = useCallback(async (
    customerId: string,
    product: string,
  ) => {
    try {
      await deleteDoc(doc(db, "customerTargets", targetDocId(customerId, product)));
    } catch (err) {
      console.error("Remove customer target error:", err);
      onToast({ type: "error", message: "Could not remove the target." });
    }
  }, [onToast]);

  return {
    customerTargets,
    targetsLoaded: targetsSeen,
    saveCustomerTargetQty,
    setCustomerDiscount,
    removeCustomerTarget,
  };
}
