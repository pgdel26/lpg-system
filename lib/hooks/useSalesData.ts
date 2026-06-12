import { useEffect, useState, useCallback } from "react";
import {
  collection, onSnapshot, query, where, orderBy,
  addDoc, updateDoc, deleteDoc, doc, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { getPricebookSrp } from "../utils";
import { buildSalesSections } from "../constants";
import type { SaleTransaction, Pricebook } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

// Sales count map: { [saleSection]: { [product]: qty } }
// This mirrors the shape derived from saleTransactions in page.js.
export type SalesMap = Record<string, Record<string, number>>;

// Input for recordSale. Bundles the line items, sale-level fields, and the
// customer-selection fields that the modal collects, replacing what used to be
// component state read directly inside handleRecordSale in page.js.
export interface RecordSaleInput {
  items: Array<{ section: string; product: string; qty: string | number }>;
  globalDiscount: number;
  saleDate: string;
  paymentType: string;
  invoice: string;
  isNewCustomer: boolean;
  selectedCustomerId: string;
  newCustomerName: string;
  newCustomerPhone: string;
  deliveryCharge?: number;
  checkData?: { checkDate: string; checkAmount: number } | null;
  gcashRef?: string;
}

export interface UseSalesDataDeps {
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
   * All validation rules are identical to handleRecordSale in page.js:
   *   • at least one item
   *   • customer selected or new-customer mode active
   *   • new-customer name non-empty when in new-customer mode
   *   • GCash ref, if provided, must be exactly 13 digits
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
    salesSections,
    activePricebook,
    inventoryDate,
    findOrCreateCustomer,
    onToast,
  } = deps;

  const [saleTransactions, setSaleTransactions] = useState<SaleTransaction[]>([]);
  const [sales, setSales] = useState<SalesMap>({});

  // ---- FIREBASE: Sale transactions listener (by date) ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(
      query(
        collection(db, "saleTransactions"),
        where("date", "==", inventoryDate),
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
  }, [inventoryDate]);

  // ---- recordSale ----
  const recordSale = useCallback(async (input: RecordSaleInput): Promise<string | null> => {
    const {
      items,
      globalDiscount,
      saleDate,
      paymentType,
      invoice,
      isNewCustomer,
      selectedCustomerId,
      newCustomerName,
      newCustomerPhone,
      deliveryCharge = 0,
      checkData = null,
      gcashRef = "",
    } = input;
    // --- Validation (identical rules to handleRecordSale in page.js) ---
    if (!items || items.length === 0) {
      return "Please add at least one item.";
    }
    if (!selectedCustomerId && !isNewCustomer) {
      return "Please select or add a customer.";
    }
    if (isNewCustomer && !newCustomerName.trim()) {
      return "Please enter customer name.";
    }
    if (paymentType === "gcash" && gcashRef && !/^\d{13}$/.test(gcashRef)) {
      return "GCash reference number must be exactly 13 digits.";
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

      // Calculate subtotal to distribute discount proportionally
      const subtotal = items.reduce((sum, item) => {
        const saleSec = salesSections.find((s) => s.key === item.section);
        if (!saleSec) return sum;
        const prodKey = `${saleSec.productCategory}_${item.product}`;
        const srp = getPricebookSrp(item.section, prodKey, activePricebook?.prices);
        return sum + srp * (parseInt(String(item.qty)) || 1);
      }, 0);

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
          pricebookId: activePricebook?.id || null,
          date: saleDate || inventoryDate,
          createdAt: now,
          ...(checkData ? { checkDate: checkData.checkDate, checkAmount: checkData.checkAmount } : {}),
          ...(gcashRef ? { gcashRef } : {}),
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
  }, [salesSections, activePricebook, inventoryDate, findOrCreateCustomer, onToast]);

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
