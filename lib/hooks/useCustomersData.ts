import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, getDocs, query,
  orderBy, where, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Customer, CustomerTransaction } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

export interface UseCustomersData {
  customers: Customer[];
  addCustomer: (name: string, phone: string) => Promise<void>;
  updateCustomer: (customerId: string, data: { name: string; phone: string }) => Promise<void>;
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
  const addCustomer = useCallback(async (name: string, phone: string) => {
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      onToast({ type: "error", message: "Customer name is required." });
      return;
    }
    try {
      await addDoc(collection(db, "customers"), {
        name: trimmedName,
        phone: (phone || "").trim(),
        createdAt: Timestamp.now(),
      });
      onToast({ type: "success", message: `Added customer: ${trimmedName}` });
    } catch (error) {
      console.error("Add customer error:", error);
      onToast({ type: "error", message: "Failed to add customer." });
    }
  }, [onToast]);

  // ---- Update Customer ----
  const updateCustomer = useCallback(async (customerId: string, data: { name: string; phone: string }) => {
    try {
      await updateDoc(doc(db, "customers", customerId), {
        name: data.name.trim(),
        phone: data.phone.trim(),
      });
      onToast({ type: "success", message: "Customer updated." });
    } catch (error) {
      console.error("Update customer error:", error);
      onToast({ type: "error", message: "Failed to update customer." });
    }
  }, [onToast]);

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
  // If "new customer" mode and phone matches an existing customer, reuse them
  const findOrCreateCustomer = useCallback(async (
    isNew: boolean,
    selectedId: string,
    newName: string,
    newPhone: string,
  ): Promise<{ id: string; name: string }> => {
    if (isNew) {
      const phone = newPhone.trim();
      if (phone) {
        const existing = customers.find(
          (c) => c.phone && c.phone.trim() === phone,
        );
        if (existing) {
          return { id: existing.id, name: existing.name };
        }
      }
      const ref = await addDoc(collection(db, "customers"), {
        name: newName.trim(),
        phone,
        createdAt: Timestamp.now(),
      });
      return { id: ref.id, name: newName.trim() };
    }
    const cust = customers.find((c) => c.id === selectedId);
    return { id: selectedId, name: cust?.name || "" };
  }, [customers]);

  return {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    fetchCustomerTransactions,
    findOrCreateCustomer,
  };
}
