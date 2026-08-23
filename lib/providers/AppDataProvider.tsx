"use client";
import React, {
  createContext, useContext, useCallback, useState, useEffect, useMemo,
} from "react";
import { useParams } from "next/navigation";
import Toast from "../../components/Toast";
import { DEFAULT_BRANCH_ID } from "../constants";
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
import { useBranchesData, type UseBranchesData } from "../hooks/useBranchesData";
import { usePermissionsData, type UsePermissionsData } from "../hooks/usePermissionsData";
import { isAdminEmail } from "../allowedEmails";
import type { InventoryState, Refund } from "../types";

// The composed context value: the union of every domain hook's return shape.
// The 12 interfaces have no overlapping property names, so this intersection
// is a clean merge (verified during the integration step). If two hooks ever
// export the same field name with incompatible types, TS will error here.
export interface AppData extends
  UseProductsData, UsePricebooksData, UseInventoryData, UseCustomersData,
  UseSalesData, UseSwapsData, UsePurchasesData, UseRefundsData,
  UseExpensesData, UseStaffData, UseNotificationsData, UseReceivablesData,
  UseBranchesData, UsePermissionsData {
  // Cross-domain derived values computed in the provider (not owned by any
  // single hook). resolvedInventory merges raw inventory + movements; refunds
  // is allRefunds filtered to the viewed date (page.js passed this as `refunds`).
  resolvedInventory: InventoryState;
  refunds: Refund[];

  // ---- Access control (UX only — see CLAUDE.md; the real boundary is
  // Firestore rules, which this app does not yet have) ----
  /** True when the signed-in address has role "admin" in lib/allowedEmails.ts. */
  isAdmin: boolean;
  /** Permission keys hidden from the signed-in user. Always empty for an admin. */
  deniedNavKeys: string[];
  /** Whether `key` is visible to the signed-in user. */
  canAccess: (key: string) => boolean;
}

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

  // Auto-dismiss toasts after 3s (matches page.js's original toast effect).
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---- Active outlet ----
  // Comes from the URL's first segment (/[branch], e.g. /pili).
  // Routes outside a [branch] segment (e.g. /customers, /income-statement) get no
  // branch param — DEFAULT_BRANCH_ID is a harmless fallback there since none of
  // those screens read branch-scoped data.
  const routeParams = useParams<{ branch?: string }>();
  const branch = routeParams.branch || DEFAULT_BRANCH_ID;

  // ---- Compose the 12 domain hooks in dependency order ----
  const products = useProductsData(onToast);
  const pricebooks = usePricebooksData(onToast);
  const inventory = useInventoryData(branch, products.inventorySections, onToast);
  const customers = useCustomersData(onToast);
  const sales = useSalesData({
    branch,
    salesSections: products.salesSections,
    activePricebook: pricebooks.activePricebook,
    inventoryDate: inventory.inventoryDate,
    findOrCreateCustomer: customers.findOrCreateCustomer,
    onToast,
  });
  const swaps = useSwapsData({
    branch,
    inventoryDate: inventory.inventoryDate,
    findOrCreateCustomer: customers.findOrCreateCustomer,
    onToast,
  });
  const purchases = usePurchasesData({
    branch,
    inventoryDate: inventory.inventoryDate,
    purchaseSections: products.purchaseSections,
    onToast,
  });
  const refunds = useRefundsData({
    branch,
    inventoryDate: inventory.inventoryDate,
    onToast,
  });
  const expenses = useExpensesData({
    branch,
    inventoryDate: inventory.inventoryDate,
    onToast,
  });
  const staff = useStaffData(branch, inventory.inventoryDate, onToast);
  const notifications = useNotificationsData(currentUserEmail, onToast);
  const receivables = useReceivablesData(onToast);
  const branches = useBranchesData();
  const permissions = usePermissionsData(onToast);

  // ---- Cross-domain effect 1: resolved inventory ----
  // Relocated verbatim from app/page.js. This computation merges raw inventory
  // with sales / purchase / swap / refund movements, so it spans every domain
  // and can't live in the inventory hook alone. page.js filtered allRefunds to
  // the viewed date before feeding this memo, so we reproduce that filter here.
  //
  // The branch filter is load-bearing and explicit: allRefunds is company-wide
  // (the Returns & Refunds screen lists every outlet), so without it this memo
  // would feed another outlet's returns into THIS outlet's inventory. It used
  // to come for free from the listener's own `where` clause, which meant the
  // invariant lived in a different file from the code depending on it.
  const dateRefunds = useMemo(
    () => refunds.allRefunds.filter(
      (r) => r.date === inventory.inventoryDate && r.branch === branch,
    ),
    [refunds.allRefunds, inventory.inventoryDate, branch],
  );

  const resolvedInventory = useMemo(() => {
    const resolved: InventoryState = {};

    // Aggregate purchase quantities for current date: { [purchaseSection]: { [product]: totalQty } }
    // datePurchaseTransactions is already scoped to inventory.inventoryDate +
    // branch (see usePurchasesData) — unlike purchaseTransactions, which is
    // paginated and not guaranteed to cover every date, this listener always
    // has the full set for whatever date is currently viewed.
    const purchaseCounts: Record<string, Record<string, number>> = {};
    purchases.datePurchaseTransactions.forEach((t) => {
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
        for (const col of section.columns) {
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
        for (const col of section.columns) {
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
    purchases.datePurchaseTransactions,
    swaps.swaps,
    dateRefunds,
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
  // Stable string dep: only changes when the category structure changes, not on
  // every products snapshot. Prevents the auto-save timer from being re-armed
  // (and writing all section docs) on unrelated product field updates.
  const inventorySectionKeysString = products.inventorySections.map((s) => s.key).join(",");
  useEffect(() => {
    // Skip while datePurchaseTransactions' first snapshot for the current
    // scope hasn't arrived yet (e.g. right after a branch/date switch) — a
    // slow/cold-start snapshot could otherwise lose the race against this
    // 2s debounce and get saveSection to persist purchases=0 for the new scope.
    if (!purchases.datePurchasesLoaded) return;
    // Same race on the other side. saveSection now writes whenever MOVEMENTS
    // exist, even with nothing typed, so it no longer implicitly waits for the
    // dailyInventory docs the way its old empty-rawItems bail did. Without this
    // gate, cold-starting an outlet where sales land before the inventory
    // snapshots persists an END computed from an absent BEG — and
    // scripts/daily-init-beg.mjs carries END into tomorrow's BEG.
    if (!inventory.inventoryLoaded) return;
    const sectionKeys = inventorySectionKeysString.split(",").filter(Boolean);
    const timer = setTimeout(() => {
      sectionKeys.forEach((key) => saveSection(key));
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    sales.sales,
    purchases.datePurchaseTransactions,
    purchases.datePurchasesLoaded,
    inventory.inventoryLoaded,
    swaps.swaps,
    dateRefunds,
    saveSection,
    inventorySectionKeysString,
  ]);

  // ---- Access control ----
  // An admin bypasses restrictions entirely: they're the only account that can
  // edit them, so a self-inflicted lockout has to be impossible.
  const isAdmin = isAdminEmail(currentUserEmail);
  const deniedNavKeys = useMemo(() => {
    if (isAdmin) return [];
    const email = (currentUserEmail || "").trim().toLowerCase();
    return permissions.deniedByEmail[email] || [];
  }, [isAdmin, currentUserEmail, permissions.deniedByEmail]);

  const canAccess = useCallback((key: string) => {
    if (isAdmin) return true;
    // Until the first snapshot lands, treat nothing as denied — a brief
    // over-permissive moment is better than tabs visibly popping out of the
    // sidebar a beat after login.
    if (!permissions.permissionsLoaded) return true;
    return !deniedNavKeys.includes(key);
  }, [isAdmin, permissions.permissionsLoaded, deniedNavKeys]);

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
    ...branches,
    ...permissions,
    resolvedInventory,
    refunds: dateRefunds,
    isAdmin,
    deniedNavKeys,
    canAccess,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
      {toast && <Toast toast={toast} />}
    </AppDataContext.Provider>
  );
}
