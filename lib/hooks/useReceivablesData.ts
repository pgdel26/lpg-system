import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, where, doc, runTransaction, deleteField, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { fmt, today } from "../utils";
import { customerKey } from "../customers";
import { arCollectionEvents, arStatus, allocateFifo, type FifoTarget } from "../receivables";
import type { SaleTransaction, ArCollectionEvent } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// Thrown for input the user can fix (bad amount, no balance, back-dated past
// the oldest invoice) — caught and returned as the string the modal shows.
// Anything else escaping the transaction is a real infrastructure failure.
class CollectionValidationError extends Error {}

export interface RecordArCollectionInput {
  customerKey: string;
  amount: number;
  method: "cash" | "check" | "gcash";
  date: string;
  branch: string;
  checkDate?: string;
  checkNumber?: string;
}

export interface UseReceivablesData {
  arTransactions: SaleTransaction[];
  /**
   * Applies `amount` against `customerKey`'s outstanding invoices, oldest
   * first (see lib/receivables.ts's allocateFifo), fully settling as many as
   * it covers and partially covering the next one if it doesn't divide
   * evenly. Every doc touched gets an ArCollectionEvent sharing one batchId.
   * Runs as a Firestore transaction that re-reads each target doc's current
   * state before allocating, so a concurrent collection from another device
   * (this page is company-wide, not branch-scoped) can't be silently
   * overwritten. Returns an error string on validation failure, null on
   * success.
   */
  recordArCollection: (input: RecordArCollectionInput) => Promise<string | null>;
  /** Soft-reverses every event sharing `batchId` across every doc it touched — marks them voided rather than deleting, so the collection history stays auditable. */
  voidArCollectionBatch: (batchId: string) => Promise<void>;
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

  const recordArCollection = useCallback(async (input: RecordArCollectionInput): Promise<string | null> => {
    const amount = Math.round((input.amount || 0) * 100) / 100;
    if (amount <= 0) return "Enter an amount greater than zero.";
    if (!input.branch) return "Select which outlet received the payment.";
    if (input.date > today()) return "Collection date can't be in the future.";

    // Candidate doc ids from the client snapshot — identity/eligibility only.
    // The transaction below re-reads each doc's authoritative state before
    // allocating, so a stale local cache can't cause an over-allocation; it
    // can only, in the rare case a doc was reopened by a concurrent void
    // between this filter and the transaction, cause a false "exceeds
    // outstanding" rejection — a safe failure mode, unlike silently losing
    // money. Pre-filtering to already-outstanding docs keeps this bounded
    // for a customer with a long AR history instead of growing forever.
    const candidateIds = arTransactions
      .filter((t) => customerKey(t.customerName || "Unknown") === input.customerKey && arStatus(t).status !== "collected")
      .map((t) => t.id);
    if (candidateIds.length === 0) return "This customer has no outstanding invoices.";

    const batchId = doc(collection(db, "saleTransactions")).id;
    const now = Timestamp.now();
    let settledCount = 0;
    let partialCount = 0;

    try {
      await runTransaction(db, async (tx) => {
        settledCount = 0;
        partialCount = 0;

        const snaps = await Promise.all(candidateIds.map((id) => tx.get(doc(db, "saleTransactions", id))));
        const targets: Array<{ id: string; data: SaleTransaction; remaining: number }> = [];
        candidateIds.forEach((id, i) => {
          const snap = snaps[i];
          if (!snap.exists()) return;
          const data = { id, ...snap.data() } as SaleTransaction;
          const status = arStatus(data);
          if (status.status === "collected") return;
          targets.push({ id, data, remaining: status.remaining });
        });
        if (targets.length === 0) throw new CollectionValidationError("This customer has no outstanding invoices.");

        const outstanding = Math.round(targets.reduce((sum, t) => sum + t.remaining, 0) * 100) / 100;
        if (amount > outstanding + 0.005) throw new CollectionValidationError(`Exceeds ${fmt(outstanding)} outstanding.`);

        const targetsById = new Map(targets.map((t) => [t.id, t]));
        const fifoTargets: FifoTarget[] = targets.map((t) => ({
          id: t.id, date: t.data.date, createdAtSeconds: t.data.createdAt?.seconds || 0, remaining: t.remaining,
        }));
        const allocations = allocateFifo(fifoTargets, amount);

        // Checked against every invoice this amount actually reaches via
        // FIFO, not just the oldest outstanding one — an amount that spills
        // onto a newer invoice dated after the collection date would book
        // cash as received before that invoice even existed.
        const tooEarlyFor = allocations
          .map((a) => targetsById.get(a.id))
          .find((t) => t && t.data.date > input.date);
        if (tooEarlyFor) {
          throw new CollectionValidationError(`Collection date can't be before invoice ${tooEarlyFor.data.invoice || tooEarlyFor.id} (${tooEarlyFor.data.date}).`);
        }

        for (const alloc of allocations) {
          const target = targetsById.get(alloc.id);
          if (!target) continue;
          const settled = Math.round(alloc.amount * 100) >= Math.round(target.remaining * 100);
          if (settled) settledCount += 1; else partialCount += 1;

          const event: ArCollectionEvent = {
            amount: alloc.amount,
            method: input.method,
            date: input.date,
            branch: input.branch,
            batchId,
            createdAt: now,
            ...(input.method === "check" && input.checkDate ? { checkDate: input.checkDate } : {}),
            ...(input.method === "check" && input.checkNumber ? { checkNumber: input.checkNumber } : {}),
          };
          const events = [...arCollectionEvents(target.data), event] as ArCollectionEvent[];
          // arCollections is now the sole source of truth for this doc — clear
          // the legacy boolean/date/method fields so nothing stale lingers
          // once a doc has real event tracking.
          tx.update(doc(db, "saleTransactions", target.id), {
            arCollections: events,
            arCollected: deleteField(),
            collectedDate: deleteField(),
            collectionMethod: deleteField(),
          });
        }
      });

      onToast({
        type: "success",
        message: `Collected ${fmt(amount)} — ${settledCount} invoice(s) settled${partialCount > 0 ? `, ${partialCount} partial` : ""}.`,
      });
      return null;
    } catch (error) {
      if (error instanceof CollectionValidationError) return error.message;
      // A transaction (unlike the old updateDoc) can't queue into the
      // offline cache — it needs a round trip to check for contention. Say
      // so plainly instead of a generic failure that looks like a bug.
      if ((error as { code?: string })?.code === "unavailable") {
        return "You're offline — collections must be recorded online so two devices can't double-apply a payment.";
      }
      console.error("Record AR collection error:", error);
      // Returned, not toasted — the modal stays open and renders this
      // inline, so the operator sees it once, next to the form they can fix.
      return "Failed to record collection.";
    }
  }, [arTransactions, onToast]);

  const voidArCollectionBatch = useCallback(async (batchId: string): Promise<void> => {
    const candidateIds = arTransactions
      .filter((t) => arCollectionEvents(t).some((e) => e.batchId === batchId && !e.voided))
      .map((t) => t.id);
    if (candidateIds.length === 0) {
      onToast({ type: "error", message: "That collection is no longer active." });
      return;
    }

    const now = Timestamp.now();
    try {
      await runTransaction(db, async (tx) => {
        const snaps = await Promise.all(candidateIds.map((id) => tx.get(doc(db, "saleTransactions", id))));
        const targets: Array<{ id: string; data: SaleTransaction }> = [];
        candidateIds.forEach((id, i) => {
          const snap = snaps[i];
          if (snap.exists()) targets.push({ id, data: { id, ...snap.data() } as SaleTransaction });
        });
        for (const { id, data } of targets) {
          const events = arCollectionEvents(data).map((e) =>
            e.batchId === batchId && !e.voided ? { ...e, voided: true, voidedAt: now } : e
          ) as ArCollectionEvent[];
          tx.update(doc(db, "saleTransactions", id), {
            arCollections: events,
            arCollected: deleteField(),
            collectedDate: deleteField(),
            collectionMethod: deleteField(),
          });
        }
      });
      onToast({ type: "success", message: "Collection voided." });
    } catch (error) {
      console.error("Void AR collection error:", error);
      const offline = (error as { code?: string })?.code === "unavailable";
      onToast({ type: "error", message: offline ? "You're offline — try again once you're back online." : "Failed to void collection." });
    }
  }, [arTransactions, onToast]);

  return {
    arTransactions,
    recordArCollection,
    voidArCollectionBatch,
  };
}
