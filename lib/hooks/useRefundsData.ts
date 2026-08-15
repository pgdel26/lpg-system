import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, where,
} from "firebase/firestore";
import { db } from "../firebase";
import { fmt } from "../utils";
import type { Refund } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// Input for recordRefund. Mirrors the data shape accepted by handleRecordRefund
// in app/page.js — all fields the RefundModal collects.
export interface RecordRefundInput {
  invoice: string;
  customerName: string;
  customerId: string;
  items: Array<{
    section: string;
    product: string;
    qty: string | number;
    value: string | number;
    defective: boolean;
  }>;
  totalRefund: number;
  reason: string;
}

export interface UseRefundsDataDeps {
  branch: string;
  inventoryDate: string;
  onToast: ToastFn;
}

export interface UseRefundsData {
  allRefunds: Refund[];
  /**
   * Records a refund.
   *
   * Control-flow contract (mirrors useSalesData / recordSale):
   *   - Returns a non-null error STRING for every validation failure or caught
   *     exception. The caller surfaces this to the user (e.g. sets modal error
   *     state) and must NOT close the modal.
   *   - Returns NULL on success. The hook fires the success toast itself; the
   *     caller should close the modal when it sees null.
   */
  recordRefund: (input: RecordRefundInput) => Promise<string | null>;
  updateRefund: (
    refundId: string,
    data: {
      invoice: string;
      customerName: string;
      reason: string;
      totalRefund: number;
      items: Array<{
        section: string;
        product: string;
        qty: string | number;
        value: string | number;
        defective: boolean;
        defectStatus: string;
      }>;
    },
  ) => Promise<void>;
  deleteRefund: (refundId: string) => Promise<void>;
}

export function useRefundsData(deps: UseRefundsDataDeps): UseRefundsData {
  const { branch, inventoryDate, onToast } = deps;

  const [allRefunds, setAllRefunds] = useState<Refund[]>([]);

  // ---- Branch-switch safety ----
  // Without this, switching outlets leaves the previous branch's data on
  // screen under the new branch's label until the new listener's first
  // snapshot arrives. React's documented "adjust state during render"
  // pattern (tracked via useState, not a ref) clears it immediately.
  const [prevBranch, setPrevBranch] = useState(branch);
  if (prevBranch !== branch) {
    setPrevBranch(branch);
    setAllRefunds([]);
  }

  // ---- FIREBASE: All refunds listener, scoped to branch (for Refunds tab) ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "refunds"), where("branch", "==", branch)),
      (snapshot) => {
        const list: Refund[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Refund));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setAllRefunds(list);
      },
    );
    return () => unsub();
  }, [branch]);

  // ---- recordRefund ----
  const recordRefund = useCallback(async (input: RecordRefundInput): Promise<string | null> => {
    if (!input.items || input.items.length === 0) {
      return "Please add at least one item.";
    }
    if ((input.totalRefund || 0) <= 0) {
      return "Please enter a refund amount.";
    }

    try {
      await addDoc(collection(db, "refunds"), {
        invoice: input.invoice || "",
        customerName: input.customerName || "",
        customerId: input.customerId || "",
        items: input.items.map((item) => ({
          section: item.section,
          product: item.product,
          qty: parseInt(String(item.qty)) || 1,
          value: parseFloat(String(item.value)) || 0,
          defective: item.defective || false,
          defectStatus: item.defective ? "Pending" : "",
        })),
        totalRefund: input.totalRefund,
        reason: input.reason || "",
        date: inventoryDate,
        branch,
        createdAt: Timestamp.now(),
      });

      const totalItems = input.items.reduce((sum, i) => sum + (parseInt(String(i.qty)) || 1), 0);
      onToast({
        type: "success",
        message: `Refund recorded: ${totalItems} item${totalItems > 1 ? "s" : ""} — ${fmt(input.totalRefund)}`,
      });
      // Return null on success — caller should close the modal when it sees null.
      return null;
    } catch (error) {
      console.error("Refund error:", error);
      return "Failed to record refund.";
    }
  }, [branch, inventoryDate, onToast]);

  // ---- updateRefund ----
  const updateRefund = useCallback(async (
    refundId: string,
    data: {
      invoice: string;
      customerName: string;
      reason: string;
      totalRefund: number;
      items: Array<{
        section: string;
        product: string;
        qty: string | number;
        value: string | number;
        defective: boolean;
        defectStatus: string;
      }>;
    },
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, "refunds", refundId), {
        invoice: data.invoice || "",
        customerName: data.customerName || "",
        reason: data.reason || "",
        totalRefund: data.totalRefund,
        items: data.items.map((item) => ({
          section: item.section,
          product: item.product,
          qty: parseInt(String(item.qty)) || 1,
          value: parseFloat(String(item.value)) || 0,
          defective: item.defective || false,
          defectStatus: item.defectStatus || "",
        })),
      });
      onToast({ type: "success", message: "Refund updated." });
    } catch (error) {
      console.error("Update refund error:", error);
      onToast({ type: "error", message: "Failed to update refund." });
    }
  }, [onToast]);

  // ---- deleteRefund ----
  const deleteRefund = useCallback(async (refundId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "refunds", refundId));
      onToast({ type: "success", message: "Refund deleted." });
    } catch (error) {
      console.error("Delete refund error:", error);
      onToast({ type: "error", message: "Failed to delete refund." });
    }
  }, [onToast]);

  return {
    allRefunds,
    recordRefund,
    updateRefund,
    deleteRefund,
  };
}
