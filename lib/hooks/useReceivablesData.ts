import { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot, query, where, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { today } from "../utils";
import type { SaleTransaction } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

export interface UseReceivablesData {
  arTransactions: SaleTransaction[];
  markArCollected: (saleId: string, method?: string) => Promise<void>;
}

export function useReceivablesData(onToast: ToastFn): UseReceivablesData {
  const [arTransactions, setArTransactions] = useState<SaleTransaction[]>([]);

  // ---- FIREBASE: AR transactions listener (all AR sales, no date filter) ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "saleTransactions"), where("paymentType", "==", "ar")),
      (snapshot) => {
        const list: SaleTransaction[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as SaleTransaction));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setArTransactions(list);
      }
    );
    return () => unsub();
  }, []);

  // ---- Handlers — setToast replaced with onToast ----
  const markArCollected = useCallback(async (saleId: string, method?: string): Promise<void> => {
    try {
      await updateDoc(doc(db, "saleTransactions", saleId), {
        arCollected: true,
        collectedDate: today(),
        collectionMethod: method || "cash",
      });
      onToast({ type: "success", message: "Marked as collected." });
    } catch (error) {
      console.error("Mark AR collected error:", error);
      onToast({ type: "error", message: "Failed to mark as collected." });
    }
  }, [onToast]);

  return {
    arTransactions,
    markArCollected,
  };
}
