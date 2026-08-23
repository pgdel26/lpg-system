import { useState, useCallback } from "react";
import { fetchRangeCollection } from "../firestoreRange";
import type { SaleTransaction, Swap, Refund, Purchase, Expense, PurchaseDelivery } from "../types";

export interface IncomeStatementRangeData {
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  purchases: Purchase[];
  purchaseDeliveries: PurchaseDelivery[];
  expenses: Expense[];
}

export interface UseIncomeStatementData {
  loading: boolean;
  error: string | null;
  data: IncomeStatementRangeData | null;
  fetchRange: (startDate: string, endDate: string) => Promise<void>;
}

export function useIncomeStatementData(): UseIncomeStatementData {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IncomeStatementRangeData | null>(null);

  const fetchRange = useCallback(async (startDate: string, endDate: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [saleTransactions, swaps, refunds, purchases, purchaseDeliveries, expenses] = await Promise.all([
        fetchRangeCollection<SaleTransaction>("saleTransactions", startDate, endDate),
        fetchRangeCollection<Swap>("swaps", startDate, endDate),
        fetchRangeCollection<Refund>("refunds", startDate, endDate),
        fetchRangeCollection<Purchase>("purchases", startDate, endDate),
        fetchRangeCollection<PurchaseDelivery>("purchaseDelivery", startDate, endDate),
        fetchRangeCollection<Expense>("expenses", startDate, endDate),
      ]);
      setData({ saleTransactions, swaps, refunds, purchases, purchaseDeliveries, expenses });
    } catch (err) {
      console.error("Income statement range fetch error:", err);
      setError("Failed to load income statement data.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, data, fetchRange };
}
