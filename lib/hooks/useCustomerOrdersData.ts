import { useState, useCallback } from "react";
import { fetchRangeCollection } from "../firestoreRange";
import type { SaleTransaction } from "../types";

export interface CustomerOrdersRangeData {
  saleTransactions: SaleTransaction[];
}

export interface UseCustomerOrdersData {
  loading: boolean;
  error: string | null;
  data: CustomerOrdersRangeData | null;
  fetchRange: (startDate: string, endDate: string) => Promise<void>;
}

export function useCustomerOrdersData(): UseCustomerOrdersData {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CustomerOrdersRangeData | null>(null);

  const fetchRange = useCallback(async (startDate: string, endDate: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const saleTransactions =
        await fetchRangeCollection<SaleTransaction>("saleTransactions", startDate, endDate);
      setData({ saleTransactions });
    } catch (err) {
      console.error("Customer orders range fetch error:", err);
      setError("Failed to load customer order history.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, data, fetchRange };
}
