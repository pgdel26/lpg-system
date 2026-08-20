import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, updateDoc, deleteDoc, deleteField, doc, Timestamp, writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
import { buildPurchaseSections, DEFAULT_BRANCH_ID } from "../constants";
import { purchaseLineKey } from "../purchases";
import type { Purchase, BranchId, PurchaseDelivery } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// The live purchases window grows by this much each time loadMorePurchases is called.
const PURCHASES_PAGE_SIZE = 50;

// Hard cap on fetchPurchasesInRange — a free-form From/To range (e.g. "the
// whole history") would otherwise read the entire collection in one query,
// the same failure mode this pagination rework exists to avoid.
const RANGE_QUERY_LIMIT = 500;

// Input for recordPurchase. Bundles the line items and the date field that the
// modal collects, replacing what used to be component state read directly inside
// handleRecordPurchase in page.js.
export interface RecordPurchaseInput {
  /** Line items from the purchase modal. Field names match the PurchaseModal component. */
  items: Array<{
    section: string;
    product: string;
    /** Quantity as a string (from input) or number. */
    qty: string | number;
  }>;
  /** Amount payable for the whole day's delivery. The supplier does not itemize
   *  at purchase time, so this is the only cost figure the operator has. Stored
   *  once in purchaseDelivery, never split across the lines. */
  totalCost: string | number;
  /** The date selected in the purchase modal (YYYY-MM-DD). */
  date: string;
}

/** Input for updateDelivery — the edit counterpart of RecordPurchaseInput. Carries
 *  the delivery's whole intended end state, and the mutation diffs it against
 *  what is stored rather than trusting the caller to say what changed. */
export interface UpdateDeliveryInput extends RecordPurchaseInput {
  deliveryId: string;
}

/** One existing line of a delivery, in the shape the purchase modal prefills from. */
export interface DeliveryLine {
  section: string;
  product: string;
  qty: number;
}

// Input for recordTransfer — moves stock between two outlets.
export interface RecordTransferInput {
  fromBranch: BranchId;
  toBranch: BranchId;
  /** Line items, one per product being transferred. */
  items: Array<{
    section: string;
    product: string;
    /** Quantity as a string (from input) or number. */
    qty: string | number;
  }>;
  /** The date the transfer happened (YYYY-MM-DD). */
  date: string;
}

export interface UsePurchasesDataDeps {
  /** The currently viewed outlet — scopes datePurchaseTransactions below. */
  branch: string;
  /** The currently viewed inventory date — scopes datePurchaseTransactions below. */
  inventoryDate: string;
  /**
   * Computed by useProductsData. Injected here so recordPurchase can resolve
   * productCategory per item without owning products data.
   */
  purchaseSections: ReturnType<typeof buildPurchaseSections>;
  onToast: ToastFn;
}

export interface UsePurchasesData {
  /**
   * The Purchases screen's default browsing list: the most recent
   * PURCHASES_PAGE_SIZE * pageCount docs, live. NOT guaranteed complete —
   * use datePurchaseTransactions for any calculation that needs a specific
   * date's purchases regardless of how far back that is, and use
   * fetchPurchasesInRange for an explicit date-range search (the From/To
   * filters on the Purchases screen must query Firestore directly rather
   * than filtering this array, since it only covers "recent").
   */
  purchaseTransactions: Purchase[];
  /**
   * All purchases for the currently viewed inventory date + branch — a
   * separate, always-complete listener that cross-domain inventory
   * calculations (see AppDataProvider's resolvedInventory) depend on staying
   * correct no matter how old the viewed date is or how much of
   * purchaseTransactions has been paginated in.
   */
  datePurchaseTransactions: Purchase[];
  /**
   * False until datePurchaseTransactions' first snapshot for the CURRENT
   * scope (branch + inventoryDate) has arrived — briefly false again on every
   * scope switch. AppDataProvider's debounced auto-save effect must skip
   * saving while this is false, or a slow snapshot can lose the race against
   * the debounce and persist purchases=0 for the new scope.
   */
  datePurchasesLoaded: boolean;
  /** Whether an older page of purchaseTransactions is available via loadMorePurchases. */
  hasMorePurchases: boolean;
  /** True from a loadMorePurchases() call until the bigger window's first snapshot arrives. */
  loadingMorePurchases: boolean;
  /** Grows the live window by one more page of history. */
  loadMorePurchases: () => void;
  /**
   * One-time query for an explicit date range (inclusive), newest first.
   * Used by the Purchases screen's From/To filters so they search all of
   * Firestore instead of just whatever's currently paginated into
   * purchaseTransactions. Pass "" for an open-ended bound (both empty
   * returns [] rather than reading the whole collection). Capped at
   * RANGE_QUERY_LIMIT — `truncated` is true when the range held more than
   * that, so the caller can tell the user to narrow it.
   */
  fetchPurchasesInRange: (from: string, to: string) => Promise<{ purchases: Purchase[]; truncated: boolean }>;
  /**
   * Increments after any successful purchase/transfer mutation
   * (record/update/delete). Include it in the deps of anything that needs to
   * refetch after a write — e.g. the Purchases screen's active date-range
   * query, which fetchPurchasesInRange can't auto-refresh on its own since
   * it's a one-time query, not a listener.
   */
  purchasesVersion: number;
  /**
   * Records a multi-item purchase.
   *
   * Control-flow contract (mirrors useSalesData / recordSale):
   *   - Returns a non-null error STRING for every validation failure and for
   *     any caught exception. The caller is responsible for surfacing this (e.g.
   *     setting modal error state) and must NOT close the modal.
   *   - Returns NULL on success. The hook fires the success toast; the caller
   *     should close the modal when it sees null.
   *
   * Validation rules (identical to handleRecordPurchase in app/page.js):
   *   • date must be non-empty
   *   • items must be non-empty
   *   • each item qty must be > 0
   *   • each item unitCost must be >= 0
   */
  /** Every purchaseDelivery doc. Low volume, and the Income Statement needs
   *  arbitrary historical ranges, so this is unbounded rather than date-scoped. */
  purchaseDeliveries: PurchaseDelivery[];
  recordPurchase: (input: RecordPurchaseInput) => Promise<string | null>;
  /**
   * Moves stock between two outlets by writing a matched pair of purchase
   * docs in one atomic batch — a negative-quantity entry for `fromBranch` and
   * a positive-quantity entry for `toBranch`, both tagged `isTransfer: true`.
   * The batch guarantees neither side is ever written without the other.
   *
   * Control-flow contract mirrors recordPurchase: non-null error string on
   * validation failure/exception (caller keeps the modal open), null on
   * success (caller closes it).
   */
  recordTransfer: (input: RecordTransferInput) => Promise<string | null>;
  /**
   * Edits a purchase line. Cost fields are optional and only written when
   * supplied: a line belonging to a delivery has no cost of its own, so a
   * quantity edit on one must leave its (inert, historical) cost figures alone
   * rather than recomputing them from a unit cost nobody was ever billed.
   */
  updatePurchase: (
    purchaseId: string,
    data: { quantity: string | number; unitCost?: string | number; totalCost?: string | number },
  ) => Promise<void>;
  /**
   * The lines currently stored for a delivery, read straight from Firestore.
   *
   * The purchases table is a paginated window, so the lines it happens to be
   * showing are NOT necessarily all of them. Prefilling an edit form from the
   * screen would make the save diff treat never-loaded lines as deleted — hence
   * this authoritative read.
   */
  fetchDeliveryLines: (deliveryId: string) => Promise<DeliveryLine[]>;
  /**
   * Applies a delivery's whole intended end state: its cost, its date, and its
   * product quantities. A blank cost leaves the stored cost alone (and a pending
   * delivery still pending), so fixing a quantity never requires inventing a
   * figure. Diffs against what is stored — quantities that changed
   * are updated, products that gained a quantity are created, products whose
   * quantity is gone are deleted — so untouched lines keep their own docs and
   * `createdAt`.
   *
   * A date change cascades to every line, because inventory's PURCHASES column
   * is scoped by the LINE's date: moving the delivery alone would show the stock
   * arriving on one day and its cost on another.
   *
   * Control-flow contract mirrors recordPurchase: error string, or null on success.
   */
  updateDelivery: (input: UpdateDeliveryInput) => Promise<string | null>;
  deletePurchase: (purchaseId: string) => Promise<void>;
  /** Deletes both docs of a transfer pair together, atomically, by their shared transferGroupId. */
  deleteTransfer: (transferGroupId: string) => Promise<void>;
}

export function usePurchasesData(deps: UsePurchasesDataDeps): UsePurchasesData {
  const { branch, inventoryDate, purchaseSections, onToast } = deps;

  // ---- FIREBASE: Purchases browsing list (live window, grows a page at a time) ----
  // A single listener whose limit grows with pageCount — always a true
  // contiguous "N most recent" prefix, so there's no gap for a newly-recorded
  // purchase to open up between a live window and separately-cursored older
  // pages. Re-arming on a bigger limit re-reads the whole (bigger) window,
  // but that's still bounded by what the user actually asked to see, unlike
  // the old unconditional full-history fetch.
  const [pageCount, setPageCount] = useState(1);
  const [purchaseTransactions, setPurchaseTransactions] = useState<Purchase[]>([]);
  const [hasMorePurchases, setHasMorePurchases] = useState(false);
  const [loadingMorePurchases, setLoadingMorePurchases] = useState(false);

  useEffect(() => {
    const pageLimit = PURCHASES_PAGE_SIZE * pageCount;
    // Fetch one extra doc beyond the window so hasMorePurchases doesn't
    // false-positive when the collection size happens to be an exact
    // multiple of PURCHASES_PAGE_SIZE (which would otherwise show a "Load
    // older purchases" button that re-reads the same window and finds nothing new).
    const unsub = onSnapshot(
      query(collection(db, "purchases"), orderBy("createdAt", "desc"), limit(pageLimit + 1)),
      (snapshot) => {
        const list: Purchase[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Purchase));
        setHasMorePurchases(list.length > pageLimit);
        setPurchaseTransactions(list.slice(0, pageLimit));
        setLoadingMorePurchases(false);
      },
    );
    return () => unsub();
  }, [pageCount]);

  const loadMorePurchases = useCallback(() => {
    setLoadingMorePurchases(true);
    setPageCount((p) => p + 1);
  }, []);

  // Bumped by every successful mutation below — lets the Purchases screen's
  // one-time range query (fetchPurchasesInRange isn't a listener, so it can't
  // notice a write on its own) know to refetch.
  const [purchasesVersion, setPurchasesVersion] = useState(0);

  // One-time query for the Purchases screen's From/To date filters — these
  // must search all of Firestore, not just whatever's paginated into
  // purchaseTransactions above, or the filter silently misses older history.
  const fetchPurchasesInRange = useCallback(async (from: string, to: string): Promise<{ purchases: Purchase[]; truncated: boolean }> => {
    if (!from && !to) return { purchases: [], truncated: false };
    const constraints: QueryConstraint[] = [orderBy("date", "desc"), limit(RANGE_QUERY_LIMIT)];
    if (from) constraints.push(where("date", ">=", from));
    if (to) constraints.push(where("date", "<=", to));
    const snap = await getDocs(query(collection(db, "purchases"), ...constraints));
    return {
      purchases: snap.docs.map((d) => ({ id: d.id, ...d.data() } as Purchase)),
      truncated: snap.size === RANGE_QUERY_LIMIT,
    };
  }, []);

  // ---- FIREBASE: date+branch-scoped listener (feeds resolvedInventory) ----
  // Always complete for the viewed date, regardless of how much of the
  // paginated purchaseTransactions list above has been loaded.
  const [purchaseDeliveries, setPurchaseDeliveries] = useState<PurchaseDelivery[]>([]);

  // ---- FIREBASE: purchase delivery listener ----
  // Unbounded on purpose: a handful of docs per week, and the Income Statement
  // reports arbitrary historical ranges, so a date-scoped listener would make it
  // silently under-report older periods.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "purchaseDelivery"), (snapshot) => {
      const list: PurchaseDelivery[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as PurchaseDelivery));
      setPurchaseDeliveries(list);
    });
    return () => unsub();
  }, []);

  const [datePurchaseTransactions, setDatePurchaseTransactions] = useState<Purchase[]>([]);
  // True once the CURRENT scope's first snapshot has arrived. AppDataProvider's
  // debounced auto-save effect should skip saving while this is false, so a
  // slow/cold-start snapshot after a branch/date switch can't get raced by
  // the 2s debounce into persisting purchases=0 for the new scope.
  const [datePurchasesLoaded, setDatePurchasesLoaded] = useState(false);

  // Without this, switching branch/date leaves the previous scope's purchases
  // on screen (and feeding resolvedInventory) until the new listener's first
  // snapshot arrives. Same "adjust state during render" pattern useSalesData
  // uses for its branch switch.
  const scope = `${branch}|${inventoryDate}`;
  const [prevScope, setPrevScope] = useState(scope);
  if (prevScope !== scope) {
    setPrevScope(scope);
    setDatePurchaseTransactions([]);
    setDatePurchasesLoaded(false);
  }

  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, "purchases"),
        where("date", "==", inventoryDate),
        where("branch", "==", branch),
      ),
      (snapshot) => {
        const list: Purchase[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Purchase));
        setDatePurchaseTransactions(list);
        setDatePurchasesLoaded(true);
      },
    );
    return () => unsub();
  }, [inventoryDate, branch]);

  // ---- recordPurchase ----
  const recordPurchase = useCallback(async (input: RecordPurchaseInput): Promise<string | null> => {
    const { items, date } = input;

    // --- Validation (identical rules to handleRecordPurchase in app/page.js) ---
    if (!date) return "Please select a date.";
    if (!items || items.length === 0) return "Please add at least one item.";

    for (const item of items) {
      const qty = parseInt(String(item.qty)) || 0;
      if (qty <= 0) return "Each item must have a quantity of at least 1.";
    }
    const deliveryTotal = parseFloat(String(input.totalCost));
    // Empty is rejected but 0 is allowed: a delivery genuinely billed at zero
    // (a supplier replacement, say) is a real thing, and silently treating a
    // blank as 0 is how a month ends up uncosted without anyone noticing.
    if (String(input.totalCost).trim() === "" || Number.isNaN(deliveryTotal)) {
      return "Enter the total cost for this delivery.";
    }
    if (deliveryTotal < 0) return "Total cost can't be negative.";

    try {
      const now = Timestamp.now();
      let totalItems = 0;

      // The delivery doc is written FIRST so every line can carry its id. If a
      // line write then fails, the delivery is orphaned (cost with no
      // quantities) rather than the reverse — lines whose deliveryId points
      // nowhere would be counted as free stock by purchaseCost().
      const deliveryRef = await addDoc(collection(db, "purchaseDelivery"), {
        date, branch: DEFAULT_BRANCH_ID, totalCost: deliveryTotal, createdAt: now,
      });

      for (const item of items) {
        const sec = purchaseSections.find((s) => s.key === item.section);
        const qty = parseInt(String(item.qty)) || 1;

        await addDoc(collection(db, "purchases"), {
          purchaseSection: item.section,
          product: item.product,
          productCategory: sec?.productCategory || "cylinder",
          quantity: qty,
          // No unitCost/totalCost: cost is not known per product at purchase
          // time. purchaseCost() reads this line's delivery instead. Writing 0
          // here would look like free stock.
          deliveryId: deliveryRef.id,
          date,
          // Purchases aren't outlet-scoped (one shared screen/collection), but
          // every doc still gets a default branch stamp for schema consistency
          // with the other collections.
          branch: DEFAULT_BRANCH_ID,
          createdAt: now,
        });
        totalItems += qty;
      }

      onToast({
        type: "success",
        message: `Purchase recorded: ${totalItems} item${totalItems > 1 ? "s" : ""}`,
      });
      setPurchasesVersion((v) => v + 1);
      // Return null on success — caller should close the modal when it sees null.
      return null;
    } catch (error) {
      console.error("Purchase error:", error);
      return "Failed to record purchase.";
    }
  }, [purchaseSections, onToast]);

  // ---- recordTransfer ----
  const recordTransfer = useCallback(async (input: RecordTransferInput): Promise<string | null> => {
    const { fromBranch, toBranch, items, date } = input;

    if (!date) return "Please select a date.";
    if (!fromBranch || !toBranch) return "Please select both outlets.";
    if (fromBranch === toBranch) return "Source and destination outlets must be different.";
    if (!items || items.length === 0) return "Please add at least one item.";

    for (const item of items) {
      const qty = parseInt(String(item.qty)) || 0;
      if (qty <= 0) return "Each item must have a quantity of at least 1.";
    }

    try {
      const now = Timestamp.now();
      const batch = writeBatch(db);
      let totalItems = 0;

      for (const item of items) {
        const sec = purchaseSections.find((s) => s.key === item.section);
        const quantity = parseInt(String(item.qty)) || 1;
        // Shared by both docs in this item's pair so the UI can merge them
        // back into a single displayed row, and so deleteTransfer can find
        // and remove both sides together.
        const transferGroupId = doc(collection(db, "purchases")).id;
        const base = {
          purchaseSection: item.section,
          product: item.product,
          productCategory: sec?.productCategory || "cylinder",
          unitCost: 0,
          totalCost: 0,
          date,
          isTransfer: true,
          transferGroupId,
          createdAt: now,
        };

        // One atomic batch for the whole transfer — every item's pair commits
        // together, or none of them do.
        batch.set(doc(collection(db, "purchases")), {
          ...base, quantity: -quantity, branch: fromBranch, transferBranch: toBranch,
        });
        batch.set(doc(collection(db, "purchases")), {
          ...base, quantity, branch: toBranch, transferBranch: fromBranch,
        });
        totalItems += quantity;
      }

      await batch.commit();

      onToast({
        type: "success",
        message: `Transferred ${totalItems} item${totalItems > 1 ? "s" : ""} from ${fromBranch} to ${toBranch}.`,
      });
      setPurchasesVersion((v) => v + 1);
      return null;
    } catch (error) {
      console.error("Transfer error:", error);
      return "Failed to record transfer.";
    }
  }, [purchaseSections, onToast]);

  // ---- updatePurchase ----
  const updatePurchase = useCallback(async (
    purchaseId: string,
    data: { quantity: string | number; unitCost?: string | number; totalCost?: string | number },
  ): Promise<void> => {
    try {
      // Absent cost fields are left untouched rather than coerced to 0 — the
      // caller omits them precisely because this line's cost lives on its
      // delivery, and writing 0 here would read as free stock if the link were
      // ever lost.
      const patch: Record<string, number> = {
        quantity: parseInt(String(data.quantity)) || 0,
      };
      if (data.unitCost !== undefined) patch.unitCost = parseFloat(String(data.unitCost)) || 0;
      if (data.totalCost !== undefined) patch.totalCost = parseFloat(String(data.totalCost)) || 0;
      await updateDoc(doc(db, "purchases", purchaseId), patch);
      onToast({ type: "success", message: "Purchase updated." });
      setPurchasesVersion((v) => v + 1);
    } catch (error) {
      console.error("Update purchase error:", error);
      onToast({ type: "error", message: "Failed to update purchase." });
    }
  }, [onToast]);

  // ---- fetchDeliveryLines ----
  // Groups by section+product and SUMS. 19 of the 90 backfilled deliveries hold
  // more than one doc for the same product, because the migration grouped lines
  // by (branch, date) and two recording sessions on one day collapsed into one
  // delivery. Showing one of the two docs' quantities would understate the
  // delivery — and saving that understatement would delete the rest.
  const fetchDeliveryLines = useCallback(async (deliveryId: string): Promise<DeliveryLine[]> => {
    const snap = await getDocs(
      query(collection(db, "purchases"), where("deliveryId", "==", deliveryId)),
    );
    const summed = new Map<string, DeliveryLine>();
    for (const d of snap.docs) {
      const o = d.data();
      const key = purchaseLineKey(o.purchaseSection as string, o.product as string);
      const prior = summed.get(key);
      if (prior) prior.qty += (o.quantity as number) || 0;
      else summed.set(key, {
        section: o.purchaseSection as string,
        product: o.product as string,
        qty: (o.quantity as number) || 0,
      });
    }
    return [...summed.values()];
  }, []);

  // ---- updateDelivery ----
  const updateDelivery = useCallback(async (input: UpdateDeliveryInput): Promise<string | null> => {
    const { deliveryId, items, date } = input;

    if (!date) return "Please select a date.";

    // Blank cost means "leave the cost as it is" — NOT an error, unlike
    // recordPurchase where a blank would silently create an uncosted delivery.
    // Here the delivery already has whatever cost it has, and someone editing a
    // quantity on one of the uncosted deliveries must not be forced to invent a
    // figure to get past the form. A pending delivery therefore stays pending.
    const rawCost = String(input.totalCost).trim();
    const costGiven = rawCost !== "";
    const deliveryTotal = costGiven ? parseFloat(rawCost) : 0;
    if (costGiven && Number.isNaN(deliveryTotal)) {
      return "Total cost must be a number, or blank to leave it unchanged.";
    }
    if (costGiven && deliveryTotal < 0) return "Total cost can't be negative.";

    try {
      // Read the stored lines here rather than accepting them from the caller —
      // the diff decides what to delete, so it must be computed against what is
      // actually in Firestore.
      const snap = await getDocs(
        query(collection(db, "purchases"), where("deliveryId", "==", deliveryId)),
      );
      // quantity is the SUM across every doc sharing this section+product, not the
      // first one found. 19 backfilled deliveries hold duplicates (the migration
      // grouped by (branch, date), so two sessions on one day merged), together
      // holding 1,041 units that a first-doc-wins diff would have discarded on a
      // Save that changed nothing.
      const existing = new Map<string, { id: string; quantity: number; date: string }>();
      const duplicates: string[] = [];
      for (const d of snap.docs) {
        const o = d.data();
        const key = purchaseLineKey(o.purchaseSection as string, o.product as string);
        const prior = existing.get(key);
        if (prior) {
          prior.quantity += (o.quantity as number) || 0;
          // The survivor carries the whole quantity, so the extra docs go — but
          // only after their units have been counted into it.
          duplicates.push(d.id);
        } else {
          existing.set(key, { id: d.id, quantity: (o.quantity as number) || 0, date: o.date as string });
        }
      }

      // Only lines the form could actually show are candidates for deletion.
      // `items` carries just what the modal rendered, and the modal renders from
      // purchaseSections — which excludes hidden categories (borrowed,
      // cylinder_deposit) and any product since deleted. Treating "absent from
      // the form" as "the operator removed it" would silently delete a line the
      // operator was never shown. No live data hits this today, but it is this
      // repo's most common bug class — see .claude/skills/safe-category-change.md.
      const representable = new Set<string>();
      for (const sec of purchaseSections) {
        const products = sec.subgroups
          ? sec.subgroups.flatMap((g) => g.products)
          : (sec.products || []);
        for (const product of products) representable.add(purchaseLineKey(sec.key, product));
      }

      const now = Timestamp.now();
      const batch = writeBatch(db);
      const wanted = new Set<string>();
      let totalItems = 0;

      for (const item of items) {
        const key = purchaseLineKey(item.section, item.product);
        wanted.add(key);
        const qty = parseInt(String(item.qty)) || 0;
        totalItems += qty;
        const prior = existing.get(key);
        if (prior) {
          // Only write when something actually differs — an untouched line keeps
          // its document exactly as it was.
          if (prior.quantity !== qty || prior.date !== date) {
            batch.update(doc(db, "purchases", prior.id), { quantity: qty, date });
          }
        } else {
          const sec = purchaseSections.find((s) => s.key === item.section);
          batch.set(doc(collection(db, "purchases")), {
            purchaseSection: item.section,
            product: item.product,
            productCategory: sec?.productCategory || "cylinder",
            quantity: qty,
            // No unitCost/totalCost, same as recordPurchase: cost is the
            // delivery's, and a 0 here would read as free stock.
            deliveryId,
            date,
            branch: DEFAULT_BRANCH_ID,
            createdAt: now,
          });
        }
      }

      // Cleared quantities mean the product was not part of this delivery after
      // all. The delivery itself survives with its cost — deleting lines adjusts
      // inventory, it does not unbill the supplier.
      for (const [key, prior] of existing) {
        if (!wanted.has(key) && representable.has(key)) {
          batch.delete(doc(db, "purchases", prior.id));
        }
      }
      for (const id of duplicates) batch.delete(doc(db, "purchases", id));

      // The date always applies; the cost only when one was actually given, so a
      // blank leaves both totalCost and costPending exactly as they were.
      batch.update(doc(db, "purchaseDelivery", deliveryId), costGiven
        ? { date, totalCost: deliveryTotal, costPending: deleteField() }
        : { date });

      // One batch for the delivery and all its lines: a partial apply could leave
      // the cost on one date and the stock on another.
      await batch.commit();

      onToast({
        type: "success",
        message: `Delivery updated: ${totalItems} item${totalItems !== 1 ? "s" : ""}`,
      });
      setPurchasesVersion((v) => v + 1);
      return null;
    } catch (error) {
      console.error("Update delivery error:", error);
      return "Failed to update delivery.";
    }
  }, [purchaseSections, onToast]);

  // ---- deletePurchase ----
  const deletePurchase = useCallback(async (purchaseId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "purchases", purchaseId));
      onToast({ type: "success", message: "Purchase deleted." });
      setPurchasesVersion((v) => v + 1);
    } catch (error) {
      console.error("Delete purchase error:", error);
      onToast({ type: "error", message: "Failed to delete purchase." });
    }
  }, [onToast]);

  // ---- deleteTransfer ----
  const deleteTransfer = useCallback(async (transferGroupId: string): Promise<void> => {
    try {
      const snap = await getDocs(query(collection(db, "purchases"), where("transferGroupId", "==", transferGroupId)));
      const batch = writeBatch(db);
      snap.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      onToast({ type: "success", message: "Transfer deleted." });
      setPurchasesVersion((v) => v + 1);
    } catch (error) {
      console.error("Delete transfer error:", error);
      onToast({ type: "error", message: "Failed to delete transfer." });
    }
  }, [onToast]);

  return {
    purchaseTransactions,
    datePurchaseTransactions,
    datePurchasesLoaded,
    hasMorePurchases,
    loadingMorePurchases,
    loadMorePurchases,
    fetchPurchasesInRange,
    purchasesVersion,
    purchaseDeliveries,
    recordPurchase,
    recordTransfer,
    updatePurchase,
    fetchDeliveryLines,
    updateDelivery,
    deletePurchase,
    deleteTransfer,
  };
}
