import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, where, orderBy, limit, getDocs,
  addDoc, updateDoc, deleteDoc, doc, Timestamp, writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "../firebase";
import { buildPurchaseSections, DEFAULT_BRANCH_ID } from "../constants";
import type { Purchase, BranchId } from "../types";

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
    /** Unit cost as a string (from input) or number. */
    price: string | number;
  }>;
  /** The date selected in the purchase modal (YYYY-MM-DD). */
  date: string;
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
  updatePurchase: (
    purchaseId: string,
    data: { quantity: string | number; unitCost: string | number; totalCost: string | number },
  ) => Promise<void>;
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
      const unitCost = parseFloat(String(item.price)) || 0;
      if (qty <= 0) return "Each item must have a quantity of at least 1.";
      if (unitCost < 0) return "Each item must have a valid purchase price.";
    }

    try {
      const now = Timestamp.now();
      let totalItems = 0;

      for (const item of items) {
        const sec = purchaseSections.find((s) => s.key === item.section);
        const qty = parseInt(String(item.qty)) || 1;
        const unitCost = parseFloat(String(item.price)) || 0;

        await addDoc(collection(db, "purchases"), {
          purchaseSection: item.section,
          product: item.product,
          productCategory: sec?.productCategory || "cylinder",
          quantity: qty,
          unitCost,
          totalCost: qty * unitCost,
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
    data: { quantity: string | number; unitCost: string | number; totalCost: string | number },
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, "purchases", purchaseId), {
        quantity: parseInt(String(data.quantity)) || 0,
        unitCost: parseFloat(String(data.unitCost)) || 0,
        totalCost: parseFloat(String(data.totalCost)) || 0,
      });
      onToast({ type: "success", message: "Purchase updated." });
      setPurchasesVersion((v) => v + 1);
    } catch (error) {
      console.error("Update purchase error:", error);
      onToast({ type: "error", message: "Failed to update purchase." });
    }
  }, [onToast]);

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
    recordPurchase,
    recordTransfer,
    updatePurchase,
    deletePurchase,
    deleteTransfer,
  };
}
