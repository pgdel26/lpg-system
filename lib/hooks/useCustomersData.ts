import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query,
  orderBy, where, Timestamp, writeBatch,
  type DocumentData, type DocumentReference,
} from "firebase/firestore";
import { db } from "../firebase";
import type { Customer, CustomerCategory, CustomerTransaction, SaleTransaction } from "../types";
import { customerKey, matchCustomer } from "../customers";
import { arStatus } from "../receivables";
import { targetDocId } from "../customerTargets";

type ToastFn = (t: { type: string; message: string }) => void;

// customerKey now lives in lib/customers.ts — imported above. Deliberately NOT
// re-exported: leaving the old path alive would keep the hazard reachable (this
// module pulls in React, and lib/receivables + lib/reports are imported by the
// admin-SDK cron route, where that fails the build).

/**
 * The collections a merge repoints. customerTargets is handled separately —
 * its doc id embeds the customerId, so those are rewritten rather than updated.
 */
const MERGED_COLLECTIONS = ["saleTransactions", "swaps", "refunds"] as const;

// Identity is (name, category) — see matchCustomer in lib/customers.ts for the
// rules, including why an uncategorised record matches any category.
//
// Phone is deliberately excluded from matching: most walk-in sales never
// capture one, so requiring a phone match created a new record on every visit.
//
// A rename is checked on the SAME (name, category) pair, not on the name alone.
// It has to be: two records can now legitimately share a name under different
// categories, and a name-only check would match the OTHER one on every edit —
// rejecting it, and locking that record out of ever being edited again.
function findMatchingCustomer(
  customers: Customer[],
  name: string,
  categoryId?: string,
): Customer | undefined {
  return matchCustomer(customers, name, categoryId) || undefined;
}

/** What a merge would move, per customer, so the operator sees it before agreeing. */
export interface MergePreviewRow {
  customerId: string;
  name: string;
  /** saleTransactions + swaps + refunds that name or point at this customer. */
  docCount: number;
  /** Monthly target agreements attached to them. */
  targetCount: number;
  /** Outstanding A/R across their sale documents. */
  outstanding: number;
}

export interface MergePreview {
  rows: MergePreviewRow[];
  totalDocs: number;
  totalOutstanding: number;
}

export interface MergeResult {
  survivorName: string;
  /** Transaction documents repointed at the survivor. */
  repointed: number;
  /** Customer records deleted. */
  deleted: number;
  /** Target agreements moved across. */
  targetsMoved: number;
  /** Targets dropped because the survivor already had one for that month+product. */
  targetsSkipped: number;
}

export interface UseCustomersData {
  customers: Customer[];
  /** The operator's own filing scheme, name-ordered. */
  customerCategories: CustomerCategory[];
  /** Returns false when the write was rejected (e.g. a name/phone conflict) so the caller can keep its form open. */
  addCustomer: (name: string, phone: string, categoryId?: string) => Promise<boolean>;
  /** Returns false when the write was rejected (e.g. a name collision) so the caller can keep its form open. */
  updateCustomer: (
    customerId: string,
    data: { name: string; phone: string; categoryId?: string },
  ) => Promise<boolean>;
  deleteCustomer: (customerId: string) => Promise<void>;
  /** Returns false when the name is blank or already taken. */
  addCustomerCategory: (name: string) => Promise<boolean>;
  updateCustomerCategory: (categoryId: string, name: string) => Promise<boolean>;
  /** Refuses while any customer is still filed under it — see the comment there. */
  deleteCustomerCategory: (categoryId: string) => Promise<boolean>;
  /** Files many customers at once. `""` clears the category. Returns how many were written. */
  bulkAssignCustomerCategory: (customerIds: string[], categoryId: string) => Promise<number>;
  /** What a merge of these customers would move. Reads only; writes nothing. */
  previewCustomerMerge: (customerIds: string[]) => Promise<MergePreview | null>;
  /**
   * Repoints every transaction of `doomedIds` at `survivorId`, then deletes those
   * customer records. Null when the merge was refused — see the guard.
   */
  mergeCustomers: (survivorId: string, doomedIds: string[]) => Promise<MergeResult | null>;
  fetchCustomerTransactions: (customerId: string) => Promise<CustomerTransaction[]>;
  findOrCreateCustomer: (
    isNew: boolean,
    selectedId: string,
    newName: string,
    newPhone: string,
    newCategoryId?: string,
  ) => Promise<{ id: string; name: string }>;
}

export function useCustomersData(onToast: ToastFn): UseCustomersData {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerCategories, setCustomerCategories] = useState<CustomerCategory[]>([]);

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

  // ---- FIREBASE: Customer categories listener ----
  // A handful of documents that change once in a blue moon, so the whole
  // collection stays subscribed alongside the customers it labels.
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "customerCategories"), orderBy("name", "asc")),
      (snapshot) => {
        const list: CustomerCategory[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as CustomerCategory));
        setCustomerCategories(list);
      },
      (error) => console.error("Customer categories listener error:", error),
    );
    return () => unsub();
  }, []);

  // ---- Add Customer ----
  const addCustomer = useCallback(async (
    name: string,
    phone: string,
    categoryId?: string,
  ): Promise<boolean> => {
    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      onToast({ type: "error", message: "Customer name is required." });
      return false;
    }
    const existing = findMatchingCustomer(customers, trimmedName, categoryId);
    if (existing) {
      const trimmedPhone = (phone || "").trim();
      // Same blank-only rule as phone: a category typed here fills an unfiled
      // record in, but never moves a customer out of a category someone already
      // put them in. Reports a failed write rather than swallowing it — the
      // caller would otherwise toast "using the existing record" over a write
      // that never landed, and the operator would believe they had filed them.
      if (categoryId && !existing.categoryId) {
        try {
          await updateDoc(doc(db, "customers", existing.id), { categoryId });
        } catch (error) {
          console.error("Backfill customer category error:", error);
          onToast({ type: "error", message: "Could not file the customer under that category." });
          return false;
        }
      }
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
        categoryId: categoryId || "",
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
  const updateCustomer = useCallback(async (
    customerId: string,
    data: { name: string; phone: string; categoryId?: string },
  ): Promise<boolean> => {
    const trimmedName = data.name.trim();
    // Passing the category is what lets a legitimately same-named record under a
    // different category edit itself. It still blocks renaming one record onto
    // another's (name, category) pair, which is the case worth blocking.
    const collision = findMatchingCustomer(customers, trimmedName, data.categoryId);
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
        // "" rather than a deleted field for uncategorised, so every customer
        // document has the same shape and a filter can compare on one value.
        categoryId: data.categoryId || "",
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

  // ---- Customer categories: add / rename / delete ----
  // Matched case-insensitively on the trimmed name, the same way customer names
  // are: "Dealer" and "dealer " are one label, and letting both exist would
  // split a filing scheme in two with nothing on screen explaining why.
  const categoryNameTaken = useCallback((name: string, exceptId?: string) => {
    const key = name.trim().toLowerCase();
    return customerCategories.some(
      (c) => c.id !== exceptId && (c.name || "").trim().toLowerCase() === key,
    );
  }, [customerCategories]);

  const addCustomerCategory = useCallback(async (name: string): Promise<boolean> => {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      onToast({ type: "error", message: "Category name is required." });
      return false;
    }
    if (categoryNameTaken(trimmed)) {
      onToast({ type: "error", message: `"${trimmed}" already exists.` });
      return false;
    }
    try {
      await addDoc(collection(db, "customerCategories"), {
        name: trimmed,
        createdAt: Timestamp.now(),
      });
      onToast({ type: "success", message: `Added category: ${trimmed}` });
      return true;
    } catch (error) {
      console.error("Add customer category error:", error);
      onToast({ type: "error", message: "Failed to add category." });
      return false;
    }
  }, [categoryNameTaken, onToast]);

  // No cascade: customers reference the category by ID, so a rename is this one
  // write. That is the whole reason categoryId is an ID.
  const updateCustomerCategory = useCallback(async (
    categoryId: string,
    name: string,
  ): Promise<boolean> => {
    const trimmed = (name || "").trim();
    if (!trimmed) {
      onToast({ type: "error", message: "Category name is required." });
      return false;
    }
    if (categoryNameTaken(trimmed, categoryId)) {
      onToast({ type: "error", message: `"${trimmed}" already exists.` });
      return false;
    }
    try {
      await updateDoc(doc(db, "customerCategories", categoryId), { name: trimmed });
      onToast({ type: "success", message: "Category updated." });
      return true;
    } catch (error) {
      console.error("Update customer category error:", error);
      onToast({ type: "error", message: "Failed to update category." });
      return false;
    }
  }, [categoryNameTaken, onToast]);

  // REFUSES while customers are still filed under it, rather than clearing them
  // in a batch the operator never asked for. Deleting a label is cheap to undo;
  // silently unfiling 200 customers is not, and there is no record afterwards of
  // which ones they were.
  const deleteCustomerCategory = useCallback(async (categoryId: string): Promise<boolean> => {
    const inUse = customers.filter((c) => c.categoryId === categoryId).length;
    if (inUse > 0) {
      onToast({
        type: "error",
        message: `${inUse} customer${inUse === 1 ? " is" : "s are"} still in this category — move them first.`,
      });
      return false;
    }
    try {
      await deleteDoc(doc(db, "customerCategories", categoryId));
      onToast({ type: "success", message: "Category deleted." });
      return true;
    } catch (error) {
      console.error("Delete customer category error:", error);
      onToast({ type: "error", message: "Failed to delete category." });
      return false;
    }
  }, [customers, onToast]);

  // ---- Bulk assign a category ----
  // Writes ONLY categoryId, never the whole customer document: a bulk action
  // that round-tripped name and phone would rewrite fields nobody touched, and
  // one stale row in the caller's list would quietly restore an old name across
  // every customer in the selection.
  //
  // Batched in 450s, matching the rename cascade — Firestore's limit is 500 per
  // batch and the margin leaves room for retries.
  const bulkAssignCustomerCategory = useCallback(async (
    customerIds: string[],
    categoryId: string,
  ): Promise<number> => {
    const ids = [...new Set(customerIds)].filter(Boolean);
    if (ids.length === 0) return 0;
    try {
      for (let i = 0; i < ids.length; i += 450) {
        const batch = writeBatch(db);
        for (const id of ids.slice(i, i + 450)) {
          batch.update(doc(db, "customers", id), { categoryId: categoryId || "" });
        }
        await batch.commit();
      }
      const label = customerCategories.find((c) => c.id === categoryId)?.name;
      onToast({
        type: "success",
        message: label
          ? `${ids.length} customer${ids.length === 1 ? "" : "s"} moved to ${label}.`
          : `${ids.length} customer${ids.length === 1 ? "" : "s"} uncategorised.`,
      });
      return ids.length;
    } catch (error) {
      console.error("Bulk assign customer category error:", error);
      onToast({ type: "error", message: "Failed to assign categories." });
      return 0;
    }
  }, [customerCategories, onToast]);

  // ---- Merge customers ----
  //
  // Does in the app what the one-off merge scripts did by hand (PILI PETRON,
  // HANNWASH, SHAKEYS), and follows the same procedure, because that procedure
  // is what kept those merges honest:
  //
  //   1. Match on customerName AS WELL AS customerId. Old documents carry a
  //      stale or missing customerId, so an id-only match silently misses them
  //      and leaves them orphaned against a customer that no longer exists.
  //   2. Compute outstanding A/R BEFORE, from the shared arStatus().
  //   3. Repoint the documents.
  //   4. Re-read, and abort BEFORE deleting anything if a straggler remains or
  //      the outstanding total moved by a centavo.
  //   5. Only then delete the duplicate customer records.
  //
  // The app's own rename cascade can't do this: it is keyed on customerId and
  // renames one customer, it cannot fold two together.
  /**
   * Every transaction document naming or pointing at one customer.
   *
   * `mergeIds` is the whole set being merged. It matters because the name query
   * is what catches pre-customerId documents — and two DIFFERENT customers can
   * legitimately share a name under different categories (see matchCustomer).
   * Without this filter, merging one of them would sweep the other's sales and
   * their outstanding A/R onto the survivor, and neither guard could see it:
   * the stray check passes because the documents did move, and the outstanding
   * check passes because the foreign balance was inside the "before" figure too.
   */
  const loadCustomerDocs = useCallback(async (customer: Customer, mergeIds: Set<string>) => {
    const found = new Map<string, { ref: DocumentReference; collection: string; data: DocumentData }>();
    for (const name of MERGED_COLLECTIONS) {
      const col = collection(db, name);
      const [byId, byName] = await Promise.all([
        getDocs(query(col, where("customerId", "==", customer.id))),
        // The name match is what catches pre-customerId documents. Exact, not
        // normalised: a differently-spelled record is a separate customer the
        // operator selects in its own right.
        customer.name ? getDocs(query(col, where("customerName", "==", customer.name))) : null,
      ]);
      for (const snap of [byId, byName]) {
        if (!snap) continue;
        for (const d of snap.docs) {
          const data = d.data();
          // A document carrying the id of a live customer OUTSIDE this merge
          // belongs to a same-name-different-category account. Never touch it.
          const owner = data.customerId as string | undefined;
          if (owner && !mergeIds.has(owner) && customers.some((c) => c.id === owner)) continue;
          found.set(`${name}/${d.id}`, { ref: d.ref, collection: name, data });
        }
      }
    }
    return found;
  }, [customers]);

  /** Outstanding across a set of documents — the guard figure. */
  const outstandingOf = (
    docs: Map<string, { collection: string; data: DocumentData }>,
  ): number => {
    let total = 0;
    for (const { collection: col, data } of docs.values()) {
      if (col !== "saleTransactions") continue;
      total += arStatus(data as unknown as SaleTransaction).remaining;
    }
    return Math.round(total * 100) / 100;
  };

  const previewCustomerMerge = useCallback(async (
    customerIds: string[],
  ): Promise<MergePreview | null> => {
    const mergeIds = new Set(customerIds);
    try {
      const picked = customerIds
        .map((id) => customers.find((c) => c.id === id))
        .filter((c): c is Customer => !!c);

      const perCustomer = await Promise.all(picked.map(async (customer) => ({
        customer,
        docs: await loadCustomerDocs(customer, mergeIds),
        targets: await getDocs(
          query(collection(db, "customerTargets"), where("customerId", "==", customer.id)),
        ),
      })));

      // The TOTALS come from a merged map, not from summing the rows. Two
      // selected customers with the same name return the same documents — which
      // is the typical merge — so summing rows multiplies both the count and the
      // outstanding A/R by however many same-named records were picked. That
      // figure sits directly above the confirm button, described as the money
      // the merge will preserve, so an inflated one is read at the worst moment.
      const combined = new Map<string, { collection: string; data: DocumentData }>();
      for (const { docs } of perCustomer) {
        for (const [key, entry] of docs) combined.set(key, entry);
      }

      return {
        rows: perCustomer.map(({ customer, docs, targets }) => ({
          customerId: customer.id,
          name: customer.name,
          docCount: docs.size,
          targetCount: targets.size,
          outstanding: outstandingOf(docs),
        })),
        totalDocs: combined.size,
        totalOutstanding: outstandingOf(combined),
      };
    } catch (error) {
      console.error("Preview customer merge error:", error);
      onToast({ type: "error", message: "Could not read those customers' transactions." });
      return null;
    }
  }, [customers, loadCustomerDocs, onToast]);

  const mergeCustomers = useCallback(async (
    survivorId: string,
    doomedIds: string[],
  ): Promise<MergeResult | null> => {
    const survivor = customers.find((c) => c.id === survivorId);
    const doomed = doomedIds
      .filter((id) => id !== survivorId)
      .map((id) => customers.find((c) => c.id === id))
      .filter((c): c is Customer => !!c);
    if (!survivor || doomed.length === 0) {
      onToast({ type: "error", message: "Pick a customer to keep and at least one to merge into it." });
      return null;
    }

    try {
      // ---- Read everything first, including the survivor's own documents:
      // the guard compares the WHOLE group's outstanding, and leaving the
      // survivor out would let their balance move unnoticed.
      const mergeIds = new Set([survivorId, ...doomed.map((c) => c.id)]);
      const all = new Map<string, { ref: DocumentReference; collection: string; data: DocumentData }>();
      for (const docs of await Promise.all(
        [survivor, ...doomed].map((c) => loadCustomerDocs(c, mergeIds)),
      )) {
        for (const [key, entry] of docs) all.set(key, entry);
      }
      const before = outstandingOf(all);

      const toRepoint = [...all.values()].filter(
        ({ data }) => data.customerName !== survivor.name || data.customerId !== survivorId,
      );

      // ---- Repoint, 450 at a time (Firestore's limit is 500 per batch).
      for (let i = 0; i < toRepoint.length; i += 450) {
        const batch = writeBatch(db);
        for (const { ref, data } of toRepoint.slice(i, i + 450)) {
          const patch: Record<string, unknown> = {
            customerName: survivor.name,
            customerId: survivorId,
          };
          // Keeps where the sale was actually written, the way the HANNWASH
          // merge did. Never overwrites one that already exists.
          if (!data.customerNameOriginal && data.customerName && data.customerName !== survivor.name) {
            patch.customerNameOriginal = data.customerName;
          }
          batch.update(ref, patch);
        }
        await batch.commit();
      }

      // ---- Targets, AFTER the verification below has passed. They were moved
      // here from above the guard: a target delete that ran before an abort
      // made "Nothing was deleted" untrue, and an agreement destroyed on a
      // failed merge has no undo.
      //
      // Their doc id embeds the customerId, so they are moved by rewriting
      // under the survivor rather than updated in place. The survivor's own
      // agreement always wins: copying forward never overwrites a figure
      // someone deliberately typed.
      const moveTargets = async (): Promise<{ moved: number; skipped: number }> => {
        let moved = 0;
        let skipped = 0;
        const survivorTargets = await getDocs(
          query(collection(db, "customerTargets"), where("customerId", "==", survivorId)),
        );
        // STANDING docs only, keyed on the product alone. Counting the
        // survivor's legacy documents as agreements would treat a doomed
        // customer's real agreement as a collision and drop it — leaving the
        // survivor with the legacy row nothing reads and no usable target.
        const survivorHas = new Set(
          survivorTargets.docs
            .filter((d) => d.data().product && !d.data().month)
            .map((d) => d.data().product as string),
        );
        for (const c of doomed) {
          const theirs = await getDocs(
            query(collection(db, "customerTargets"), where("customerId", "==", c.id)),
          );
          for (const d of theirs.docs) {
            const t = d.data();
            const key = (t.product as string) || "";
            // Legacy documents — one with no product, one carrying a month —
            // are read by nothing (see standingTargets), so they are dropped
            // rather than carried onto the survivor as permanent dead weight.
            if (t.product && !t.month && !survivorHas.has(key)) {
              await setDoc(doc(db, "customerTargets", targetDocId(survivorId, t.product as string)), {
                customerId: survivorId,
                product: t.product,
                targetQty: Number(t.targetQty) || 0,
                discountPerUnit: Number(t.discountPerUnit) || 0,
                // The log comes across with the rate. Dropping it would leave a
                // live discount with an empty history — the exact hole the
                // read-only discount cell exists to prevent, punched on the one
                // path where the trail matters most.
                discountHistory: t.discountHistory || [],
                updatedAt: Timestamp.now(),
              });
              survivorHas.add(key);
              moved++;
            } else {
              skipped++;
            }
            await deleteDoc(d.ref);
          }
        }
        return { moved, skipped };
      };

      // ---- Verify BEFORE deleting. A straggler here would be a document left
      // pointing at a customer that is about to stop existing.
      const after = new Map<string, { ref: DocumentReference; collection: string; data: DocumentData }>();
      for (const docs of await Promise.all(
        [survivor, ...doomed].map((c) => loadCustomerDocs(c, mergeIds)),
      )) {
        for (const [key, entry] of docs) after.set(key, entry);
      }
      const strays = [...after.values()].filter(
        ({ data }) => data.customerId !== survivorId || data.customerName !== survivor.name,
      );
      if (strays.length > 0) {
        onToast({
          type: "error",
          message: `Stopped before deleting: ${strays.length} transaction(s) did not move. Nothing was deleted — try again.`,
        });
        return null;
      }
      const afterTotal = outstandingOf(after);
      if (Math.abs(afterTotal - before) > 0.005) {
        onToast({
          type: "error",
          message: `Stopped before deleting: outstanding A/R moved by ${(afterTotal - before).toFixed(2)}. Nothing was deleted.`,
        });
        return null;
      }

      const { moved: targetsMoved, skipped: targetsSkipped } = await moveTargets();

      for (const c of doomed) await deleteDoc(doc(db, "customers", c.id));

      onToast({
        type: "success",
        message: `Merged ${doomed.length} customer${doomed.length === 1 ? "" : "s"} into ${survivor.name}. ${toRepoint.length} transaction${toRepoint.length === 1 ? "" : "s"} moved.`,
      });
      return {
        survivorName: survivor.name,
        repointed: toRepoint.length,
        deleted: doomed.length,
        targetsMoved,
        targetsSkipped,
      };
    } catch (error) {
      console.error("Merge customers error:", error);
      onToast({ type: "error", message: "The merge failed part-way. Nothing was deleted — check the customers and try again." });
      return null;
    }
  }, [customers, loadCustomerDocs, onToast]);

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
    newCategoryId?: string,
  ): Promise<{ id: string; name: string }> => {
    if (isNew) {
      // Same name AND same category reuses the record. See matchCustomer for why
      // uncategorised matches anything rather than being a category of its own.
      let existing = findMatchingCustomer(customers, newName, newCategoryId);

      // A DIFFERENT category is a different customer — but not one the till gets
      // to create. A second same-name record here would split a live A/R balance
      // across two rows Receivables renders identically, and FIFO collection is
      // per customerId, so a payment on one can never reach the other's
      // invoices. That is the duplicate problem that took hundreds of merges to
      // clear. The sale books to the existing record and says so; a genuinely
      // separate account is created deliberately, from the Customers screen.
      if (!existing && newCategoryId) {
        const sameName = findMatchingCustomer(customers, newName);
        if (sameName) {
          onToast({
            type: "error",
            message: `${sameName.name} already exists in another category — sale recorded under the existing customer. Add a separate record from the Customers screen if this is a different account.`,
          });
          existing = sameName;
        }
      }

      if (existing) {
        // Blank-only backfill, the same rule phone follows below.
        if (newCategoryId && !existing.categoryId) {
          await updateDoc(doc(db, "customers", existing.id), { categoryId: newCategoryId });
        }
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
        categoryId: newCategoryId || "",
        createdAt: Timestamp.now(),
      });
      return { id: ref.id, name: newName.trim() };
    }
    const cust = customers.find((c) => c.id === selectedId);
    return { id: selectedId, name: cust?.name || "" };
  }, [customers, onToast]);

  return {
    customers,
    customerCategories,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    addCustomerCategory,
    updateCustomerCategory,
    deleteCustomerCategory,
    bulkAssignCustomerCategory,
    previewCustomerMerge,
    mergeCustomers,
    fetchCustomerTransactions,
    findOrCreateCustomer,
  };
}
