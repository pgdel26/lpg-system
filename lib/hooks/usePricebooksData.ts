import { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, query, orderBy, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Pricebook, PricebookStatus } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

export interface UsePricebooksData {
  pricebooks: Pricebook[];
  activePricebook: Pricebook | null;
  createPricebook: (
    name: string,
    effectiveDate: string,
    prices: Record<string, unknown>,
  ) => Promise<string | null>;
  updatePricebook: (
    pricebookId: string,
    data: Partial<Omit<Pricebook, "id">>,
  ) => Promise<void>;
  deletePricebook: (pricebookId: string) => Promise<void>;
  activatePricebook: (pricebookId: string) => Promise<void>;
}

export function usePricebooksData(onToast: ToastFn): UsePricebooksData {
  const [pricebooks, setPricebooks] = useState<Pricebook[]>([]);

  // ---- FIREBASE: Pricebooks listener ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const q = query(collection(db, "pricebooks"), orderBy("effectiveDate", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPricebooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pricebook)));
    });
    return () => unsub();
  }, []);

  // ---- Derive active pricebook ----
  const activePricebook = useMemo(
    () => pricebooks.find((pb) => pb.status === "active") ?? null,
    [pricebooks],
  );

  // ---- Create new pricebook (as draft) ----
  const createPricebook = useCallback(async (
    name: string,
    effectiveDate: string,
    prices: Record<string, unknown>,
  ): Promise<string | null> => {
    try {
      const ref = await addDoc(collection(db, "pricebooks"), {
        name,
        effectiveDate,
        prices,
        status: "draft" as PricebookStatus,
        createdAt: Timestamp.now(),
      });
      onToast({ type: "success", message: "Pricebook draft created" });
      return ref.id;
    } catch (error) {
      console.error("Create pricebook error:", error);
      onToast({ type: "error", message: "Failed to create pricebook." });
      return null;
    }
  }, [onToast]);

  // ---- Delete a pricebook ----
  const deletePricebook = useCallback(async (pricebookId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "pricebooks", pricebookId));
      onToast({ type: "success", message: "Draft discarded." });
    } catch (error) {
      console.error("Delete pricebook error:", error);
      onToast({ type: "error", message: "Failed to discard draft." });
    }
  }, [onToast]);

  // ---- Update a draft pricebook ----
  const updatePricebook = useCallback(async (
    pricebookId: string,
    data: Partial<Omit<Pricebook, "id">>,
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, "pricebooks", pricebookId), {
        ...data,
        updatedAt: Timestamp.now(),
      });
      onToast({ type: "success", message: "Pricebook updated" });
    } catch (error) {
      console.error("Update pricebook error:", error);
      onToast({ type: "error", message: "Failed to update pricebook." });
    }
  }, [onToast]);

  // ---- Activate a draft pricebook (deactivates any currently-active ones first) ----
  const activatePricebook = useCallback(async (pricebookId: string): Promise<void> => {
    try {
      // Deactivate any currently active pricebooks first
      const currentlyActive = pricebooks.filter(
        (pb) => pb.status === "active" && pb.id !== pricebookId,
      );
      for (const pb of currentlyActive) {
        await updateDoc(doc(db, "pricebooks", pb.id), { status: "inactive" });
      }
      await updateDoc(doc(db, "pricebooks", pricebookId), {
        status: "active" as PricebookStatus,
        activatedAt: Timestamp.now(),
      });
      onToast({ type: "success", message: "Pricebook activated" });
    } catch (error) {
      console.error("Activate pricebook error:", error);
      onToast({ type: "error", message: "Failed to activate pricebook." });
    }
  }, [pricebooks, onToast]);

  return {
    pricebooks,
    activePricebook,
    createPricebook,
    updatePricebook,
    deletePricebook,
    activatePricebook,
  };
}
