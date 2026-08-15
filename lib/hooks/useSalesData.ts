import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { getPricebookSrp, fmt } from "../utils";
import { buildSalesSections } from "../constants";
import type { SaleTransaction, Pricebook, PaymentType, SalePayment } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// Sales count map: { [saleSection]: { [product]: qty } }
// This mirrors the shape derived from saleTransactions in page.js.
export type SalesMap = Record<string, Record<string, number>>;

// One payment leg entered in the modal — for a non-split sale this is a
// single-entry array; a split sale has up to 3 (one per method).
export interface RecordSalePaymentInput {
  method: PaymentType;
  amount: number | string;
  gcashRef?: string;
}

// Input for recordSale. Bundles the line items, sale-level fields, and the
// customer-selection fields that the modal collects, replacing what used to be
// component state read directly inside handleRecordSale in page.js.
export interface RecordSaleInput {
  items: Array<{ section: string; product: string; qty: string | number }>;
  globalDiscount: number;
  saleDate: string;
  /** Must sum to exactly the sale's grand total (subtotal − discount + delivery). */
  payments: RecordSalePaymentInput[];
  invoice: string;
  isNewCustomer: boolean;
  selectedCustomerId: string;
  newCustomerName: string;
  newCustomerPhone: string;
  deliveryCharge?: number;
  checkData?: { checkDate: string; checkAmount: number } | null;
}

export interface UseSalesDataDeps {
  branch: string;
  salesSections: ReturnType<typeof buildSalesSections>;
  activePricebook: Pricebook | null;
  inventoryDate: string;
  /**
   * Owned by the customers hook (built separately). Injected here so
   * recordSale can look up or create a customer without owning that logic.
   */
  findOrCreateCustomer: (
    isNew: boolean,
    selectedId: string,
    newName: string,
    newPhone: string,
  ) => Promise<{ id: string; name: string }>;
  onToast: ToastFn;
}

export interface UseSalesData {
  sales: SalesMap;
  saleTransactions: SaleTransaction[];
  /**
   * Records a multi-item sale.
   *
   * Control-flow contract (replaces the setSaleModalError / setSaleModalOpen
   * entanglement from page.js):
   *   - Returns a non-null error STRING for every validation failure and for
   *     any caught exception. The caller is responsible for surfacing this to
   *     the user (e.g. setting modal error state) and must NOT close the modal.
   *   - Returns NULL on success. The hook fires the success toast itself; the
   *     caller should close the modal when it sees null.
   *
   * Validation rules:
   *   • at least one item
   *   • customer selected or new-customer mode active
   *   • new-customer name non-empty when in new-customer mode
   *   • at least one payment with a positive amount
   *   • GCash ref, if provided on a payment, must be exactly 13 digits
   *   • payments must sum to exactly the sale total (subtotal − discount +
   *     delivery), compared in centavos — no partial/over payment allowed
   *
   * Payments are allocated across line items waterfall-style (in payment-row
   * order) so each line-item doc's own `payments` array sums to that doc's
   * `totalAmount` — see lib/payments.ts for how these get summed back up for
   * reporting.
   */
  recordSale: (input: RecordSaleInput) => Promise<string | null>;
  updateSale: (
    saleId: string,
    data: {
      invoice?: string;
      customerName?: string;
      discount?: number | string;
      totalAmount?: number | string;
      paymentType?: string;
    },
  ) => Promise<void>;
  deleteSale: (saleId: string) => Promise<void>;
}

export function useSalesData(deps: UseSalesDataDeps): UseSalesData {
  const {
    branch,
    salesSections,
    activePricebook,
    inventoryDate,
    findOrCreateCustomer,
    onToast,
  } = deps;

  const [saleTransactions, setSaleTransactions] = useState<SaleTransaction[]>([]);
  const [sales, setSales] = useState<SalesMap>({});

  // ---- Branch-switch safety ----
  // Without this, switching outlets leaves the previous branch's data on
  // screen under the new branch's label until the new listener's first
  // snapshot arrives. React's documented "adjust state during render"
  // pattern (tracked via useState, not a ref) clears it immediately.
  const [prevBranch, setPrevBranch] = useState(branch);
  if (prevBranch !== branch) {
    setPrevBranch(branch);
    setSaleTransactions([]);
    setSales({});
  }

  // ---- FIREBASE: Sale transactions listener (by date + branch) ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, "saleTransactions"),
        where("date", "==", inventoryDate),
        where("branch", "==", branch),
        orderBy("createdAt", "desc"),
      ),
      (snapshot) => {
        const list: SaleTransaction[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as SaleTransaction));
        setSaleTransactions(list);

        // Compute sale counts from live transactions (full replace, no merge with legacy data)
        const saleCounts: SalesMap = {};
        list.forEach((t) => {
          if (!saleCounts[t.saleSection]) saleCounts[t.saleSection] = {};
          saleCounts[t.saleSection][t.product] =
            (saleCounts[t.saleSection][t.product] || 0) + (t.quantity || 1);
        });
        setSales(saleCounts);
      },
    );
    return () => unsub();
  }, [inventoryDate, branch]);

  // ---- recordSale ----
  const recordSale = useCallback(async (input: RecordSaleInput): Promise<string | null> => {
    const {
      items,
      globalDiscount,
      saleDate,
      payments,
      invoice,
      isNewCustomer,
      selectedCustomerId,
      newCustomerName,
      newCustomerPhone,
      deliveryCharge = 0,
      checkData = null,
    } = input;
    // --- Validation ---
    if (!items || items.length === 0) {
      return "Please add at least one item.";
    }
    if (!selectedCustomerId && !isNewCustomer) {
      return "Please select or add a customer.";
    }
    if (isNewCustomer && !newCustomerName.trim()) {
      return "Please enter customer name.";
    }

    const cleanPayments = (payments || [])
      .map((p) => ({
        method: p.method,
        amount: parseFloat(String(p.amount)) || 0,
        gcashRef: p.gcashRef?.trim() || undefined,
      }))
      .filter((p) => p.amount > 0);

    if (cleanPayments.length === 0) {
      return "Please enter at least one payment.";
    }
    for (const p of cleanPayments) {
      if (p.method === "gcash" && p.gcashRef && !/^\d{13}$/.test(p.gcashRef)) {
        return "GCash reference number must be exactly 13 digits.";
      }
    }

    try {
      const { id: customerId, name: customerName } = await findOrCreateCustomer(
        isNewCustomer,
        selectedCustomerId,
        newCustomerName,
        newCustomerPhone,
      );

      const invoiceTrimmed = invoice.trim();
      const now = Timestamp.now();
      // Shared across every line-item doc this call writes — the closest
      // thing to a "sale id" today, since each item is its own doc.
      const saleGroupId = doc(collection(db, "saleTransactions")).id;

      // Calculate subtotal to distribute discount proportionally
      const subtotal = items.reduce((sum, item) => {
        const saleSec = salesSections.find((s) => s.key === item.section);
        if (!saleSec) return sum;
        const prodKey = `${saleSec.productCategory}_${item.product}`;
        const srp = getPricebookSrp(item.section, prodKey, activePricebook?.prices);
        return sum + srp * (parseInt(String(item.qty)) || 1);
      }, 0);

      // --- Pass 1: per-line discount/delivery/total (unchanged formula) ---
      const lineComputations: Array<{
        item: typeof items[number];
        saleSec: ReturnType<typeof salesSections.find>;
        srp: number;
        qty: number;
        lineDiscount: number;
        lineDelivery: number;
        totalAmount: number;
      }> = [];

      let discountRemaining = globalDiscount || 0;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const saleSec = salesSections.find((s) => s.key === item.section);
        if (!saleSec) continue;
        const prodKey = `${saleSec.productCategory}_${item.product}`;
        const srp = getPricebookSrp(item.section, prodKey, activePricebook?.prices);
        const qty = parseInt(String(item.qty)) || 1;
        const lineSubtotal = srp * qty;

        // Distribute discount proportionally; last item gets the remainder
        let lineDiscount = 0;
        if (discountRemaining > 0 && subtotal > 0) {
          if (i === items.length - 1) {
            lineDiscount = discountRemaining;
          } else {
            lineDiscount = Math.round((lineSubtotal / subtotal) * (globalDiscount || 0) * 100) / 100;
            discountRemaining -= lineDiscount;
          }
        }

        // Add delivery charge to the first item only
        const lineDelivery = i === 0 ? (deliveryCharge || 0) : 0;
        const totalAmount = Math.max(0, lineSubtotal - lineDiscount + lineDelivery);

        lineComputations.push({ item, saleSec, srp, qty, lineDiscount, lineDelivery, totalAmount });
      }

      // Grand total must match the sum of payments exactly — compare in
      // centavos (integers) to avoid float drift.
      const toCentavos = (n: number): number => Math.round(n * 100);
      const grandTotalCents = lineComputations.reduce((sum, l) => sum + toCentavos(l.totalAmount), 0);
      const paymentsTotalCents = cleanPayments.reduce((sum, p) => sum + toCentavos(p.amount), 0);
      if (grandTotalCents !== paymentsTotalCents) {
        return `Payments must add up to the sale total (${fmt(grandTotalCents / 100)}).`;
      }

      // --- Pass 2: allocate payments across lines, waterfall in row order ---
      const fromCentavos = (c: number): number => c / 100;
      const paymentQueue = cleanPayments.map((p) => ({ ...p, remaining: toCentavos(p.amount) }));
      const linePayments: SalePayment[][] = lineComputations.map(() => []);

      lineComputations.forEach((line, idx) => {
        let remainingForLine = toCentavos(line.totalAmount);
        while (remainingForLine > 0) {
          const row = paymentQueue.find((p) => p.remaining > 0);
          if (!row) break; // shouldn't happen — totals validated above
          const take = Math.min(remainingForLine, row.remaining);
          if (take <= 0) break;
          const existing = linePayments[idx].find((lp) => lp.method === row.method);
          if (existing) {
            existing.amount += fromCentavos(take);
          } else {
            linePayments[idx].push({
              method: row.method,
              amount: fromCentavos(take),
              ...(row.method === "gcash" && row.gcashRef ? { gcashRef: row.gcashRef } : {}),
            });
          }
          row.remaining -= take;
          remainingForLine -= take;
        }
      });

      // paymentType stays the method with the largest allocation on that doc,
      // or "ar" whenever any AR allocation is present — existing
      // where("paymentType","==","ar") queries (Receivables, cron report)
      // keep working unchanged. The real breakdown lives in `payments`.
      const dominantPaymentType = (linePays: SalePayment[]): PaymentType => {
        if (linePays.some((p) => p.method === "ar" && p.amount > 0)) return "ar";
        if (linePays.length === 0) return "cash";
        return linePays.reduce((best, p) => (p.amount > best.amount ? p : best)).method;
      };

      for (let i = 0; i < lineComputations.length; i++) {
        const { item, saleSec, srp, qty, lineDiscount, lineDelivery, totalAmount } = lineComputations[i];
        if (!saleSec) continue;
        const linePays = linePayments[i];
        const paymentType = dominantPaymentType(linePays);
        const lineGcashRef = linePays.find((p) => p.method === "gcash" && p.gcashRef)?.gcashRef;

        await addDoc(collection(db, "saleTransactions"), {
          saleSection: item.section,
          product: item.product,
          productCategory: saleSec.productCategory,
          srp,
          discount: lineDiscount,
          deliveryCharge: lineDelivery,
          finalPrice: srp,
          quantity: qty,
          totalAmount,
          invoice: invoiceTrimmed,
          customerId,
          customerName,
          paymentType,
          payments: linePays,
          saleGroupId,
          pricebookId: activePricebook?.id || null,
          date: saleDate || inventoryDate,
          branch,
          createdAt: now,
          ...(checkData ? { checkDate: checkData.checkDate, checkAmount: checkData.checkAmount } : {}),
          ...(lineGcashRef ? { gcashRef: lineGcashRef } : {}),
        });
      }

      const totalItems = items.reduce((sum, i) => sum + (parseInt(String(i.qty)) || 1), 0);
      onToast({
        type: "success",
        message: `Sale recorded: ${totalItems} item${totalItems > 1 ? "s" : ""} for ${customerName}`,
      });
      // Return null on success — caller should close the modal when it sees null.
      return null;
    } catch (error) {
      console.error("Sale error:", error);
      return "Failed to record sale.";
    }
  }, [branch, salesSections, activePricebook, inventoryDate, findOrCreateCustomer, onToast]);

  // ---- updateSale ----
  const updateSale = useCallback(async (
    saleId: string,
    data: {
      invoice?: string;
      customerName?: string;
      discount?: number | string;
      totalAmount?: number | string;
      paymentType?: string;
    },
  ): Promise<void> => {
    try {
      await updateDoc(doc(db, "saleTransactions", saleId), {
        invoice: data.invoice ?? "",
        customerName: data.customerName ?? "",
        discount: parseFloat(String(data.discount)) || 0,
        totalAmount: parseFloat(String(data.totalAmount)) || 0,
        paymentType: data.paymentType || "cash",
      });
      onToast({ type: "success", message: "Sale updated." });
    } catch (error) {
      console.error("Update sale error:", error);
      onToast({ type: "error", message: "Failed to update sale." });
    }
  }, [onToast]);

  // ---- deleteSale ----
  const deleteSale = useCallback(async (saleId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, "saleTransactions", saleId));
      onToast({ type: "success", message: "Sale deleted." });
    } catch (error) {
      console.error("Delete sale error:", error);
      onToast({ type: "error", message: "Failed to delete sale." });
    }
  }, [onToast]);

  return {
    sales,
    saleTransactions,
    recordSale,
    updateSale,
    deleteSale,
  };
}
