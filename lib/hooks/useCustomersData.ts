import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, getDocs, query,
  orderBy, where, Timestamp, writeBatch,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Customer, CustomerTransaction } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// Exported so any other surface that groups by "same customer" (e.g.
// TopDebtorsChart) uses this exact identity rule instead of a second,
// driftable copy of it.
export function customerKey(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Phone is deliberately excluded from matching: most walk-in sales never
// capture one, so requiring a phone match created a new record on every visit.
function findMatchingCustomer(
  customers: Customer[],
  name: string,
): Customer | undefined {
  const key = customerKey(name);
  return customers.find((c) => customerKey(c.name) === key);
}

export interface UseCustomersData {
  customers: Customer[];
  /** Returns false when the write was rejected (e.g. a name/phone conflict) so the caller can keep its form open. */
  addCustomer: (name: string, phone: string) => Promise<boolean>;
  /** Returns false when the write was rejected (e.g. a name collision) so the caller can keep its form open. */
  updateCustomer: (customerId: string, data: { name: string; phone: string }) => Promise<boolean>;
  deleteCustomer: (customerId: string) => Promise<void>;
  fetchCustomerTransactions: (customerId: string) => Promise<CustomerTransaction[]>;
  findOrCreateCustomer: (
    isNew: boolean,
    selectedId: string,
    newName: string,
    newPhone: string,
  ) => Promise<{ id: string; name: string }>;
}

export function useCustomersData(onToast: ToastFn): UseCustomersData {
  const [customers, setCustomers] = useState<Customer[]>([]);

  // ---- FIREBASE: Customers listener ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "customers"), orderBy("name", "asc")),
      (snapshot) => {
        const list: Customer[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Customer));
        setCustomers(list);
      },
    );
    return () => unsub();
  }, []);

  // ---- Add Customer ----
  const addCustomer = useCallback(async (name: string, phone: string): Promise<boolean> => {
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      onToast({ type: "error", message: "Customer name is required." });
      return false;
    }
    const existing = findMatchingCustomer(customers, trimmedName);
    if (existing) {
      const trimmedPhone = (phone || "").trim();
      // Backfill only — never overwrite a phone the existing record already
      // has. Two different people can share a name; destroying a real
      // customer's real number to make room for someone else's is a worse
      // outcome than just not saving the new one.
      if (trimmedPhone && !existing.phone) {
        try {
          await updateDoc(doc(db, "customers", existing.id), { phone: trimmedPhone });
          onToast({ type: "success", message: `${existing.name} already exists — phone updated.` });
          return true;
        } catch (error) {
          console.error("Update customer phone error:", error);
          onToast({ type: "error", message: "Failed to update phone." });
          return false;
        }
      }
      if (trimmedPhone && trimmedPhone !== existing.phone) {
        onToast({
          type: "error",
          message: `${existing.name} already exists with a different phone (${existing.phone}) — not saved. Edit the customer directly to change it.`,
        });
        return false;
      }
      onToast({
        type: "success",
        message: `${existing.name} already exists — using the existing record.`,
      });
      return true;
    }
    try {
      await addDoc(collection(db, "customers"), {
        name: trimmedName,
        phone: (phone || "").trim(),
        createdAt: Timestamp.now(),
      });
      onToast({ type: "success", message: `Added customer: ${trimmedName}` });
      return true;
    } catch (error) {
      console.error("Add customer error:", error);
      onToast({ type: "error", message: "Failed to add customer." });
      return false;
    }
  }, [onToast, customers]);

  // ---- Update Customer ----
  const updateCustomer = useCallback(async (customerId: string, data: { name: string; phone: string }): Promise<boolean> => {
    const trimmedName = data.name.trim();
    const collision = findMatchingCustomer(customers, trimmedName);
    if (collision && collision.id !== customerId) {
      onToast({
        type: "error",
        message: `Another customer is already named "${collision.name}" — rename not saved.`,
      });
      return false;
    }
    const existing = customers.find((c) => c.id === customerId);
    // Raw comparison, not customerKey — a pure case/whitespace correction
    // ("jun reyes" -&gt; "Jun Reyes") must still cascade, or every past sale
    // keeps displaying the old casing forever.
    const nameChanged = existing && existing.name.trim() !== trimmedName;

    try {
      // Cascade BEFORE the customer doc write, not after: if a batch fails
      // partway, the customer doc still shows the OLD name, so `nameChanged`
      // recomputes true on retry and the cascade actually re-runs. Cascading
      // after the rename left a stuck, unrecoverable half-renamed state
      // (customer doc renamed, but nameChanged would never be true again).
      if (nameChanged) {
        const [salesSnap, swapsSnap, refundsSnap] = await Promise.all([
          getDocs(query(collection(db, "saleTransactions"), where("customerId", "==", customerId))),
          getDocs(query(collection(db, "swaps"), where("customerId", "==", customerId))),
          getDocs(query(collection(db, "refunds"), where("customerId", "==", customerId))),
        ]);
        const docs = [...salesSnap.docs, ...swapsSnap.docs, ...refundsSnap.docs];
        try {
          for (let i = 0; i < docs.length; i += 450) {
            const batch = writeBatch(db);
            for (const d of docs.slice(i, i + 450)) batch.update(d.ref, { customerName: trimmedName });
            await batch.commit();
          }
        } catch (error) {
          console.error("Update customer name cascade error:", error);
          onToast({ type: "error", message: "Failed to update past transactions — customer name not changed. Try again." });
          return false;
        }
      }

      await updateDoc(doc(db, "customers", customerId), {
        name: trimmedName,
        phone: data.phone.trim(),
      });
      onToast({ type: "success", message: "Customer updated." });
      return true;
    } catch (error) {
      console.error("Update customer error:", error);
      onToast({ type: "error", message: "Failed to update customer." });
      return false;
    }
  }, [onToast, customers]);

  // ---- Delete Customer and related transactions ----
  const deleteCustomer = useCallback(async (customerId: string) => {
    try {
      // Delete related sale transactions
      const salesSnap = await getDocs(
        query(collection(db, "saleTransactions"), where("customerId", "==", customerId)),
      );
      for (const d of salesSnap.docs) {
        await deleteDoc(doc(db, "saleTransactions", d.id));
      }

      // Delete related swaps
      const swapsSnap = await getDocs(
        query(collection(db, "swaps"), where("customerId", "==", customerId)),
      );
      for (const d of swapsSnap.docs) {
        await deleteDoc(doc(db, "swaps", d.id));
      }

      // Delete related refunds
      const refundsSnap = await getDocs(
        query(collection(db, "refunds"), where("customerId", "==", customerId)),
      );
      for (const d of refundsSnap.docs) {
        await deleteDoc(doc(db, "refunds", d.id));
      }

      // Delete the customer
      await deleteDoc(doc(db, "customers", customerId));
      onToast({ type: "success", message: "Customer and related transactions deleted." });
    } catch (error) {
      console.error("Delete customer error:", error);
      onToast({ type: "error", message: "Failed to delete customer." });
    }
  }, [onToast]);

  // ---- Fetch all transactions for a customer ----
  const fetchCustomerTransactions = useCallback(async (customerId: string): Promise<CustomerTransaction[]> => {
    try {
      const [salesSnap, swapsSnap, refundsSnap] = await Promise.all([
        getDocs(query(collection(db, "saleTransactions"), where("customerId", "==", customerId))),
        getDocs(query(collection(db, "swaps"), where("customerId", "==", customerId))),
        getDocs(query(collection(db, "refunds"), where("customerId", "==", customerId))),
      ]);
      const sales = salesSnap.docs.map((d) => ({ id: d.id, type: "sale" as const, ...d.data() }));
      const swapsList = swapsSnap.docs.map((d) => ({ id: d.id, type: "swap" as const, ...d.data() }));
      const refundsList = refundsSnap.docs.map((d) => ({ id: d.id, type: "refund" as const, ...d.data() }));
      const all: CustomerTransaction[] = [...sales, ...swapsList, ...refundsList];
      all.sort((a, b) => ((b.createdAt as { seconds?: number } | undefined)?.seconds || 0) - ((a.createdAt as { seconds?: number } | undefined)?.seconds || 0));
      return all;
    } catch (error) {
      console.error("Fetch customer transactions error:", error);
      return [];
    }
  }, []);

  // ---- Helper: find or create customer ----
  // If "new customer" mode and an existing customer matches by name
  // (case-insensitive), reuse them instead of creating a duplicate.
  const findOrCreateCustomer = useCallback(async (
    isNew: boolean,
    selectedId: string,
    newName: string,
    newPhone: string,
  ): Promise<{ id: string; name: string }> => {
    if (isNew) {
      const existing = findMatchingCustomer(customers, newName);
      if (existing) {
        // Same blank-only backfill rule as addCustomer — a phone typed here
        // must not silently vanish, but also must not overwrite a different
        // real phone the existing record already has.
        const trimmedPhone = newPhone.trim();
        if (trimmedPhone && !existing.phone) {
          await updateDoc(doc(db, "customers", existing.id), { phone: trimmedPhone });
        } else if (trimmedPhone && trimmedPhone !== existing.phone) {
          // The sale still books to `existing` (matches addCustomer's stance
          // that a name match reuses the existing record) — but the cashier
          // needs to know a different phone was typed, in case this is
          // actually a second, different person sharing that name.
          onToast({
            type: "error",
            message: `${existing.name} already exists with a different phone (${existing.phone}) — sale recorded under the existing customer, new phone not saved.`,
          });
        }
        return { id: existing.id, name: existing.name };
      }
      const ref = await addDoc(collection(db, "customers"), {
        name: newName.trim(),
        phone: newPhone.trim(),
        createdAt: Timestamp.now(),
      });
      return { id: ref.id, name: newName.trim() };
    }
    const cust = customers.find((c) => c.id === selectedId);
    return { id: selectedId, name: cust?.name || "" };
  }, [customers, onToast]);

  return {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    fetchCustomerTransactions,
    findOrCreateCustomer,
  };
}
