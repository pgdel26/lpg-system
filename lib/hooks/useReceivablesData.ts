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
  /** Optional free-text note. Trimmed and omitted entirely when blank, so a
   *  doc never carries an empty string that reads as "a note exists". */
  notes?: string;
}

/**
 * The subset of a collection an operator may correct after the fact: exactly
 * the fields the Record Collection modal let them enter, MINUS the two that
 * would make it a different transaction rather than a corrected one.
 *
 * `date` is deliberately absent. A collection's date decides which day's
 * Expected Cash Remit the money lands in, so editing it silently moves cash
 * between two days — including days already counted, closed and remitted
 * against. `customerKey` is absent for the same class of reason: re-pointing a
 * payment at a different customer re-allocates it across a completely
 * different set of invoices. Both remain reachable through Void → re-record,
 * which is explicit about destroying the original.
 */
export interface EditArCollectionInput {
  amount: number;
  method: "cash" | "check" | "gcash";
  branch: string;
  checkDate?: string;
  checkNumber?: string;
  notes?: string;
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
  /**
   * Corrects an already-recorded collection. Takes one of two paths depending
   * on whether the amount moved, because only one of them can disturb how the
   * money is spread across invoices:
   *
   *   amount unchanged — rewrites method/branch/check details on the existing
   *     events in place. FIFO allocation is untouched by construction, and no
   *     voided row appears in the history. This is the common correction (a
   *     check entered as cash), so it stays clean.
   *
   *   amount changed — voids the batch and re-allocates the new amount from
   *     scratch under the same guards as recordArCollection, writing fresh
   *     events under a new batchId that points back via replacesBatchId.
   *     Re-running the real allocator is the point: a changed amount can
   *     settle fewer or more invoices than before, and no in-place edit of
   *     individual event amounts could work that out correctly.
   *
   * Returns an error string on validation failure, null on success.
   */
  editArCollectionBatch: (batchId: string, input: EditArCollectionInput) => Promise<string | null>;
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
            ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
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

  const editArCollectionBatch = useCallback(async (
    batchId: string,
    input: EditArCollectionInput,
  ): Promise<string | null> => {
    const amount = Math.round((input.amount || 0) * 100) / 100;
    if (amount <= 0) return "Enter an amount greater than zero.";
    if (!input.branch) return "Select which outlet received the payment.";

    // Docs currently carrying an active event from this batch. Identity only —
    // the transaction re-reads them, same as recordArCollection.
    const batchDocs = arTransactions.filter((t) =>
      arCollectionEvents(t).some((e) => e.batchId === batchId && !e.voided));
    if (batchDocs.length === 0) return "That collection is no longer active.";

    // Every invoice the re-allocation could land on: the customer's currently
    // outstanding ones PLUS the ones this batch itself settled. The second half
    // matters — an invoice this collection paid off in full reads as
    // "collected" right now, but voiding the batch reopens it, and it is the
    // oldest, so FIFO must be allowed to put the money back onto it.
    const custKey = customerKey(batchDocs[0].customerName || "Unknown");
    const candidateIds = Array.from(new Set([
      ...arTransactions
        .filter((t) => customerKey(t.customerName || "Unknown") === custKey && arStatus(t).status !== "collected")
        .map((t) => t.id),
      ...batchDocs.map((t) => t.id),
    ]));

    const newBatchId = doc(collection(db, "saleTransactions")).id;
    const now = Timestamp.now();
    let reallocated = false;

    try {
      await runTransaction(db, async (tx) => {
        reallocated = false;
        const snaps = await Promise.all(candidateIds.map((id) => tx.get(doc(db, "saleTransactions", id))));
        const docs: Array<{ id: string; data: SaleTransaction; events: ArCollectionEvent[] }> = [];
        candidateIds.forEach((id, i) => {
          const snap = snaps[i];
          if (!snap.exists()) return;
          const data = { id, ...snap.data() } as SaleTransaction;
          docs.push({ id, data, events: arCollectionEvents(data) as ArCollectionEvent[] });
        });

        const activeInBatch = docs.flatMap(({ events }) =>
          events.filter((e) => e.batchId === batchId && !e.voided));
        if (activeInBatch.length === 0) {
          throw new CollectionValidationError("That collection is no longer active.");
        }

        // Server-side, not from the modal: the date is not editable, so the
        // stored value is the only correct one — and re-deriving it here means
        // a stale client can't quietly re-date the money.
        const date = activeInBatch[0].date;
        const oldAmount = Math.round(activeInBatch.reduce((sum, e) => sum + (e.amount || 0), 0) * 100) / 100;

        // Only ever added when the field applies, never written as undefined —
        // Firestore rejects an explicit undefined, and a stale check number
        // left on an event the operator just switched to cash is worse than
        // no number at all.
        const detail = {
          ...(input.method === "check" && input.checkDate ? { checkDate: input.checkDate } : {}),
          ...(input.method === "check" && input.checkNumber ? { checkNumber: input.checkNumber } : {}),
          ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        };

        if (Math.abs(Math.round(amount * 100) - Math.round(oldAmount * 100)) < 1) {
          // ---- Allocation-neutral path -------------------------------------
          for (const { id, events } of docs) {
            if (!events.some((e) => e.batchId === batchId && !e.voided)) continue;
            const next = events.map((e) => {
              if (e.batchId !== batchId || e.voided) return e;
              // Rebuilt from the event's invariant fields rather than spread
              // over the old one, so switching check → cash drops the old
              // checkDate/checkNumber instead of leaving them stranded.
              //
              // date and createdAt are conditional, not `field: e.field`: a
              // legacy collection is SYNTHESIZED by arCollectionEvents() from
              // arCollected/collectedDate and carries neither key. Writing
              // them as undefined makes Firestore reject the whole
              // transaction ("Unsupported field value"), which would mean the
              // oldest collections — the ones most likely to need correcting —
              // are the only ones that can't be. Same conditional-spread rule
              // arCollectionEvents itself documents.
              return {
                amount: e.amount, batchId: e.batchId,
                method: input.method, branch: input.branch,
                ...(e.date ? { date: e.date } : {}),
                ...(e.createdAt ? { createdAt: e.createdAt } : { createdAt: now }),
                ...(e.replacesBatchId ? { replacesBatchId: e.replacesBatchId } : {}),
                ...detail,
                editedAt: now,
              } as ArCollectionEvent;
            });
            tx.update(doc(db, "saleTransactions", id), {
              arCollections: next,
              arCollected: deleteField(),
              collectedDate: deleteField(),
              collectionMethod: deleteField(),
            });
          }
          return;
        }

        // ---- Re-allocation path --------------------------------------------
        // A legacy collection can have no date at all (arCollected with no
        // collectedDate). The method-only edit above copes with that fine, but
        // re-allocating needs a date to write onto the replacement events and
        // to check them against each invoice's own date — and inventing one
        // would assert a payment day that was never recorded. Refuse instead
        // of guessing; void and re-record makes the operator state the date.
        if (!date) {
          throw new CollectionValidationError("This collection has no recorded date, so its amount can't be changed here. Void it and record it again.");
        }
        reallocated = true;
        // Balances as they stand AFTER the void, which is what the new amount
        // has to fit inside.
        const voided = new Map<string, ArCollectionEvent[]>();
        const reopened: Array<{ id: string; data: SaleTransaction; remaining: number }> = [];
        for (const { id, data, events } of docs) {
          const next = events.map((e) =>
            e.batchId === batchId && !e.voided ? { ...e, voided: true, voidedAt: now } : e) as ArCollectionEvent[];
          voided.set(id, next);
          const status = arStatus({ ...data, arCollections: next });
          if (status.remaining > 0.005) reopened.push({ id, data, remaining: status.remaining });
        }

        const outstanding = Math.round(reopened.reduce((sum, t) => sum + t.remaining, 0) * 100) / 100;
        if (amount > outstanding + 0.005) throw new CollectionValidationError(`Exceeds ${fmt(outstanding)} outstanding.`);

        const byId = new Map(reopened.map((t) => [t.id, t]));
        const allocations = allocateFifo(reopened.map((t): FifoTarget => ({
          id: t.id, date: t.data.date, createdAtSeconds: t.data.createdAt?.seconds || 0, remaining: t.remaining,
        })), amount);

        const tooEarlyFor = allocations.map((a) => byId.get(a.id)).find((t) => t && t.data.date > date);
        if (tooEarlyFor) {
          throw new CollectionValidationError(`This collection is dated ${date}, before invoice ${tooEarlyFor.data.invoice || tooEarlyFor.id} (${tooEarlyFor.data.date}). Void it and re-record instead.`);
        }

        const allocById = new Map(allocations.map((a) => [a.id, a.amount]));
        // Writes the docs this edit actually changes: the ones that carried a
        // batch event (now voided) and the ones the new amount lands on. Both
        // are needed — an invoice that LOSES its share still has to have its
        // old event marked voided, or the payment would be counted twice.
        //
        // The `continue` matters. `voided` is keyed over every candidate doc,
        // which is the customer's whole outstanding ledger, because FIFO has to
        // see all of it to allocate. Writing all of it would put a customer
        // like SANGAY (98 docs) near Firestore's 500-write transaction cap,
        // make every unrelated concurrent sale on that customer a contention
        // abort, and materialise arCollections/strip legacy fields on invoices
        // this edit never touched. Reads stay wide; only writes narrow.
        for (const [id, next] of voided) {
          const applied = allocById.get(id);
          const hadBatchEvent = next.some((e) => e.batchId === batchId && e.voided);
          if (!applied && !hadBatchEvent) continue;
          const events = applied
            ? [...next, {
                amount: applied, method: input.method, date, branch: input.branch,
                batchId: newBatchId, createdAt: now, replacesBatchId: batchId, ...detail,
              } as ArCollectionEvent]
            : next;
          tx.update(doc(db, "saleTransactions", id), {
            arCollections: events,
            arCollected: deleteField(),
            collectedDate: deleteField(),
            collectionMethod: deleteField(),
          });
        }
      });

      onToast({
        type: "success",
        message: reallocated
          ? `Collection updated to ${fmt(amount)} and re-applied across invoices.`
          : "Collection updated.",
      });
      return null;
    } catch (error) {
      if (error instanceof CollectionValidationError) return error.message;
      if ((error as { code?: string })?.code === "unavailable") {
        return "You're offline — collections must be edited online so two devices can't disagree.";
      }
      console.error("Edit AR collection error:", error);
      return "Failed to update collection.";
    }
  }, [arTransactions, onToast]);

  return {
    arTransactions,
    recordArCollection,
    voidArCollectionBatch,
    editArCollectionBatch,
  };
}
