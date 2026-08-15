import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, setDoc,
  orderBy, query, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Staff, DailyReport } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

export interface UseStaffData {
  staff: Staff[];
  dailyReport: DailyReport;
  addStaff: (name: string, role: string, phone: string) => Promise<void>;
  updateStaff: (staffId: string, data: { name: string; role: string; phone: string }) => Promise<void>;
  deleteStaff: (staffId: string) => Promise<void>;
  updateDailyStaff: (data: DailyReport) => Promise<void>;
}

export function useStaffData(branch: string, inventoryDate: string, onToast: ToastFn): UseStaffData {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [dailyReport, setDailyStaff] = useState<DailyReport>({ cashier: null, staff: [] });

  // ---- Branch-switch safety ----
  // Without this, switching outlets leaves the previous branch's cashier/
  // duty assignment on screen until the new listener's first snapshot
  // arrives. React's documented "adjust state during render" pattern
  // (tracked via useState, not a ref) clears it immediately. Only
  // dailyReport is branch-scoped — the staff roster itself is shared.
  const [prevBranch, setPrevBranch] = useState(branch);
  if (prevBranch !== branch) {
    setPrevBranch(branch);
    setDailyStaff({ cashier: null, staff: [] });
  }

  // ---- FIREBASE: Staff listener ----
  // Shared roster across both outlets — staff float between branches, so this
  // is deliberately NOT branch-scoped (only the daily cashier/duty assignment
  // below is, since each outlet remits separately).
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "staff"), orderBy("name", "asc")),
      (snapshot) => {
        const list: Staff[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Staff));
        setStaff(list);
      }
    );
    return () => unsub();
  }, []);

  // ---- FIREBASE: Daily staff assignment listener (by date + branch) ----
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "dailyReport", `${inventoryDate}_${branch}`),
      (snapshot) => {
        if (snapshot.exists()) {
          setDailyStaff(snapshot.data() as DailyReport);
        } else {
          setDailyStaff({ cashier: null, staff: [] });
        }
      }
    );
    return () => unsub();
  }, [inventoryDate, branch]);

  // ---- Handlers — setToast replaced with onToast ----
  const addStaff = useCallback(async (name: string, role: string, phone: string) => {
    try {
      await addDoc(collection(db, "staff"), {
        name,
        role,
        phone,
        createdAt: Timestamp.now(),
      });
      onToast({ type: "success", message: `Added staff: ${name}` });
    } catch (error) {
      console.error("Add staff error:", error);
      onToast({ type: "error", message: "Failed to add staff." });
    }
  }, [onToast]);

  const updateStaff = useCallback(async (staffId: string, data: { name: string; role: string; phone: string }) => {
    try {
      await updateDoc(doc(db, "staff", staffId), {
        name: data.name,
        role: data.role,
        phone: data.phone,
      });
      onToast({ type: "success", message: "Staff updated." });
    } catch (error) {
      console.error("Update staff error:", error);
      onToast({ type: "error", message: "Failed to update staff." });
    }
  }, [onToast]);

  const deleteStaff = useCallback(async (staffId: string) => {
    try {
      await deleteDoc(doc(db, "staff", staffId));
      onToast({ type: "success", message: "Staff deleted." });
    } catch (error) {
      console.error("Delete staff error:", error);
      onToast({ type: "error", message: "Failed to delete staff." });
    }
  }, [onToast]);

  const updateDailyStaff = useCallback(async (data: DailyReport) => {
    try {
      await setDoc(doc(db, "dailyReport", `${inventoryDate}_${branch}`), data);
    } catch (error) {
      console.error("Update daily staff error:", error);
      onToast({ type: "error", message: "Failed to update daily staff." });
    }
  }, [inventoryDate, branch, onToast]);

  return {
    staff,
    dailyReport,
    addStaff,
    updateStaff,
    deleteStaff,
    updateDailyStaff,
  };
}
