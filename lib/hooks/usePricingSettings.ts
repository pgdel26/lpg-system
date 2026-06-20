"use client";
import { useState, useCallback, useEffect } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

export interface UsePricingSettings {
  approverEmail: string;
  saveApproverEmail: (email: string) => Promise<void>;
}

export function usePricingSettings(): UsePricingSettings {
  const [approverEmail, setApproverEmail] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "pricing"), (snap) => {
      setApproverEmail(snap.exists() ? (snap.data().approverEmail || "") : "");
    });
    return () => unsub();
  }, []);

  const saveApproverEmail = useCallback(async (email: string) => {
    await setDoc(
      doc(db, "settings", "pricing"),
      { approverEmail: email, updatedAt: Timestamp.now() },
      { merge: true },
    );
  }, []);

  return { approverEmail, saveApproverEmail };
}
