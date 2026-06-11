"use client";
import React, {
  createContext, useContext, useCallback, useState, useEffect, useMemo,
} from "react";
import Toast from "../../components/Toast";
import { useProductsData, type UseProductsData } from "../hooks/useProductsData";
import { usePricebooksData, type UsePricebooksData } from "../hooks/usePricebooksData";
import { useInventoryData, type UseInventoryData } from "../hooks/useInventoryData";
import { useCustomersData, type UseCustomersData } from "../hooks/useCustomersData";
import { useSalesData, type UseSalesData } from "../hooks/useSalesData";
import { useSwapsData, type UseSwapsData } from "../hooks/useSwapsData";
import { usePurchasesData, type UsePurchasesData } from "../hooks/usePurchasesData";
import { useRefundsData, type UseRefundsData } from "../hooks/useRefundsData";
import { useExpensesData, type UseExpensesData } from "../hooks/useExpensesData";
import { useStaffData, type UseStaffData } from "../hooks/useStaffData";
import { useNotificationsData, type UseNotificationsData } from "../hooks/useNotificationsData";
import { useReceivablesData, type UseReceivablesData } from "../hooks/useReceivablesData";
import type { InventoryState } from "../types";

// The column descriptors come from constants.js (untyped JS). TS infers a wide
// union of per-variant shapes where no single member declares every source key,
// so we read columns through this permissive accessor shape. page.js had no such
// issue because it is plain JS; this only restores that access without changing
// any runtime behavior.
interface InvColumn {
  field: string;
  salesSource?: string;
  purchaseSource?: string | string[];
  swapSource?: "to" | "from";
  refundSource?: { section: string; defective?: boolean };
  source?: { section: string; field: string };
}

// The composed context value: the union of every domain hook's return shape.
// The 12 interfaces have no overlapping property names, so this intersection
// is a clean merge (verified during the integration step). If two hooks ever
// export the same field name with incompatible types, TS will error here.
export interface AppData extends
  UseProductsData, UsePricebooksData, UseInventoryData, UseCustomersData,
  UseSalesData, UseSwapsData, UsePurchasesData, UseRefundsData,
  UseExpensesData, UseStaffData, UseNotificationsData, UseReceivablesData {}

const AppDataContext = createContext<AppData | null>(null);

export function useAppData(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within <AppDataProvider>");
  return ctx;
}

export function AppDataProvider({
  children,
  currentUserEmail,
}: {
  children: React.ReactNode;
  currentUserEmail: string | null | undefined;
}) {
  // Toast state lives in the provider; every hook receives onToast.
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);
  const onToast = useCallback((t: { type: string; message: string }) => setToast(t), []);

  // ---- Compose the 12 domain hooks in dependency order ----
  const products = useProductsData(onToast);
  const pricebooks = usePricebooksData(onToast);
  const inventory = useInventoryData(products.inventorySections, onToast);
  const customers = useCustomersData(onToast);
  const sales = useSalesData({
    salesSections: products.salesSections,
    activePricebook: pricebooks.activePricebook,
    inventoryDate: inventory.inventoryDate,
    findOrCreateCustomer: customers.findOrCreateCustomer,
    onToast,
  });
  const swaps = useSwapsData({
    inventoryDate: inventory.inventoryDate,
    findOrCreateCustomer: customers.findOrCreateCustomer,
    onToast,
  });
  const purchases = usePurchasesData({
    purchaseSections: products.purchaseSections,
    onToast,
  });
  const refunds = useRefundsData({
    inventoryDate: inventory.inventoryDate,
    onToast,
  });
  const expenses = useExpensesData({
    inventoryDate: inventory.inventoryDate,
    onToast,
  });
  const staff = useStaffData(inventory.inventoryDate, onToast);
  const notifications = useNotificationsData(currentUserEmail, onToast);
  const receivables = useReceivablesData(onToast);

  // ---- Cross-domain effect 1: resolved inventory ----
  // Relocated verbatim from app/page.js. This computation merges raw inventory
  // with sales / purchase / swap / refund movements, so it spans every domain
  // and can't live in the inventory hook alone. page.js filtered allRefunds to
  // the viewed date before feeding this memo, so we reproduce that filter here.
  const dateRefunds = useMemo(
    () => refunds.allRefunds.filter((r) => r.date === inventory.inventoryDate),
    [refunds.allRefunds, inventory.inventoryDate],
  );

  const resolvedInventory = useMemo(() => {
    const resolved: InventoryState = {};

    // Aggregate purchase quantities for current date: { [purchaseSection]: { [product]: totalQty } }
    const purchaseCounts: Record<string, Record<string, number>> = {};
    purchases.purchaseTransactions
      .filter((t) => t.date === inventory.inventoryDate)
      .forEach((t) => {
        if (!purchaseCounts[t.purchaseSection]) purchaseCounts[t.purchaseSection] = {};
        purchaseCounts[t.purchaseSection][t.product] =
          (purchaseCounts[t.purchaseSection][t.product] || 0) + (t.quantity || 0);
      });

    // Aggregate refund quantities by section+product: { [refundSection]: { [product]: qty } }
    // Also track non-defective counts separately
    const refundCounts: Record<string, Record<string, number>> = {};
    const refundNonDefectiveCounts: Record<string, Record<string, number>> = {};
    dateRefunds.forEach((r) => {
      (r.items || []).forEach((item) => {
        const sec = item.section;
        const prod = item.product;
        const qty = parseInt(String(item.qty)) || 1;
        if (!refundCounts[sec]) refundCounts[sec] = {};
        refundCounts[sec][prod] = (refundCounts[sec][prod] || 0) + qty;
        if (!item.defective) {
          if (!refundNonDefectiveCounts[sec]) refundNonDefectiveCounts[sec] = {};
          refundNonDefectiveCounts[sec][prod] = (refundNonDefectiveCounts[sec][prod] || 0) + qty;
        }
      });
    });

    // Aggregate swap counts by productTo and productFrom
    const swapToCounts: Record<string, number> = {};   // full cylinders going out
    const swapFromCounts: Record<string, number> = {}; // empty cylinders coming in
    swaps.swaps.forEach((s) => {
      swapToCounts[s.productTo] = (swapToCounts[s.productTo] || 0) + 1;
      // Only count "from" if it's a known product (not a custom/other brand name)
      if (products.cylinderProducts.includes(s.productFrom)) {
        swapFromCounts[s.productFrom] = (swapFromCounts[s.productFrom] || 0) + 1;
      }
    });

    // Pass 1: resolve salesSource, purchaseSource, and swapSource values into each section
    for (const section of products.inventorySections) {
      resolved[section.key] = {};
      for (const product of section.products) {
        const row: Record<string, unknown> = { ...(inventory.inventory[section.key]?.[product] || {}) };
        for (const col of section.columns as InvColumn[]) {
          if (col.salesSource) {
            row[col.field] = (sales.sales[col.salesSource] || {})[product] || 0;
          }
          if (col.purchaseSource) {
            const sources = Array.isArray(col.purchaseSource) ? col.purchaseSource : [col.purchaseSource];
            row[col.field] = sources.reduce(
              (sum: number, src: string) => sum + ((purchaseCounts[src] || {})[product] || 0),
              0,
            );
          }
          if (col.swapSource === "to") {
            row[col.field] = swapToCounts[product] || 0;
          }
          if (col.swapSource === "from") {
            row[col.field] = swapFromCounts[product] || 0;
          }
          if (col.refundSource) {
            const src = col.refundSource;
            const counts = src.defective === false ? refundNonDefectiveCounts : refundCounts;
            row[col.field] = (counts[src.section] || {})[product] || 0;
          }
        }
        resolved[section.key][product] = row as InventoryState[string][string];
      }
    }
    // Pass 2: resolve cross-section sources
    for (const section of products.inventorySections) {
      for (const product of section.products) {
        for (const col of section.columns as InvColumn[]) {
          if (col.source) {
            const srcRow = resolved[col.source.section]?.[product] || {};
            (resolved[section.key][product] as Record<string, unknown>)[col.field] =
              (srcRow as Record<string, unknown>)[col.source.field] || 0;
          }
        }
      }
    }
    return resolved;
  }, [
    inventory.inventory,
    sales.sales,
    purchases.purchaseTransactions,
    swaps.swaps,
    dateRefunds,
    inventory.inventoryDate,
    products.inventorySections,
    products.cylinderProducts,
  ]);

  // Keep resolvedInventoryRef in sync so the inventory hook's debounced saves
  // include the computed values (END, sales/purchase/swap/refund-sourced cols).
  // The inventory hook deliberately exposes this ref for the provider to write;
  // the ref is read only inside the effect (the one place ref access is allowed).
  useEffect(() => {
    inventory.resolvedInventoryRef.current = resolvedInventory;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedInventory]);

  // ---- Cross-domain effect 2: auto-save all sections ----
  // Relocated verbatim from app/page.js. When any movement (sales / purchases /
  // swaps / refunds) changes, end-of-day inventory derives anew, so we debounce
  // a full re-save of every section to keep END current in the DB for reports.
  // 2000ms debounce + cleanup matches page.js exactly.
  const saveSection = inventory.saveSection;
  const inventorySections = products.inventorySections;
  useEffect(() => {
    const timer = setTimeout(() => {
      for (const section of inventorySections) {
        saveSection(section.key);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    sales.sales,
    purchases.purchaseTransactions,
    swaps.swaps,
    dateRefunds,
    saveSection,
    inventorySections,
  ]);

  // Compose the single context value. `...inventory` carries resolvedInventoryRef
  // through to consumers by design (the inventory hook exposes it for this exact
  // cross-hook sharing). We never read its `.current` during render — only inside
  // the sync effect above — so passing the ref object through is safe.
  const value: AppData = {
    ...products,
    ...pricebooks,
    ...inventory,
    ...customers,
    ...sales,
    ...swaps,
    ...purchases,
    ...refunds,
    ...expenses,
    ...staff,
    ...notifications,
    ...receivables,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
      {toast && <Toast toast={toast} />}
    </AppDataContext.Provider>
  );
}
