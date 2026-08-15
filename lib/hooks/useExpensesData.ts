import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, query, where,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Expense } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

export interface UseExpensesDataDeps {
  branch: string;
  inventoryDate: string;
  onToast: ToastFn;
}

export interface UseExpensesData {
  expenses: Expense[];
  addExpense: (description: string, amount: string | number) => Promise<void>;
  updateExpense: (
    expenseId: string,
    data: { description: string; amount: string | number },
  ) => Promise<void>;
  deleteExpense: (expenseId: string) => Promise<void>;
}

export function useExpensesData(deps: UseExpensesDataDeps): UseExpensesData {
  const { branch, inventoryDate, onToast } = deps;

  const [expenses, setExpenses] = useState<Expense[]>([]);

  // ---- Branch-switch safety ----
  // Without this, switching outlets leaves the previous branch's data on
  // screen under the new branch's label until the new listener's first
  // snapshot arrives. React's documented "adjust state during render"
  // pattern (tracked via useState, not a ref) clears it immediately.
  const [prevBranch, setPrevBranch] = useState(branch);
  if (prevBranch !== branch) {
    setPrevBranch(branch);
    setExpenses([]);
  }

  // ---- FIREBASE: Expenses listener (by date + branch) ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, "expenses"),
        where("date", "==", inventoryDate),
        where("branch", "==", branch),
      ),
      (snapshot) => {
        const list: Expense[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Expense));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setExpenses(list);
      },
    );
    return () => unsub();
  }, [inventoryDate, branch]);

  // ---- addExpense ----
  const addExpense = useCallback(async (
    description: string,
    amount: string | number,
  ): Promise<void> => {
    try {
      await addDoc(collection(db, "expenses"), {
        date: inventoryDate,
        description: description.trim(),
        amount: parseFloat(String(amount)) || 0,
        branch,
        createdAt: Timestamp.now(),
      });
      onToast({ type: "success", message: "Expense added." });
    } catch (error) {
      console.error("Add expense error:", error);
      onToast({ type: "error", message: "Failed to add expense." });
    }
  }, [branch, inventoryDate, onToast]);

  // ---- updateExpense ----
  const updateExpense = useCallback(async (
    expenseId: string,
    data: { description: string; amount: string | number },
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, "expenses", expenseId), {
        description: data.description,
        amount: parseFloat(String(data.amount)) || 0,
      });
      onToast({ type: "success", message: "Expense updated." });
    } catch (error) {
      console.error("Update expense error:", error);
      onToast({ type: "error", message: "Failed to update expense." });
    }
  }, [onToast]);

  // ---- deleteExpense ----
  const deleteExpense = useCallback(async (expenseId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "expenses", expenseId));
      onToast({ type: "success", message: "Expense deleted." });
    } catch (error) {
      console.error("Delete expense error:", error);
      onToast({ type: "error", message: "Failed to delete expense." });
    }
  }, [onToast]);

  return {
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
  };
}
