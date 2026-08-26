import { useState, useCallback, useRef } from "react";
import { fetchRangeCollection } from "../firestoreRange";
import type { SaleTransaction } from "../types";

// ---------------------------------------------------------------------------
// One-shot range fetch of saleTransactions, shared by every report that reads
// a free date range of sales (Customer Orders, Product Sales).
//
// getDocs rather than onSnapshot: a multi-month report window doesn't need live
// updates, and subscribing to one is a needless read-cost and memory load.
//
// This exists as ONE hook rather than one per report on purpose. It started as
// two near-identical copies differing only in an error string, which is the
// same duplication lib/firestoreRange.ts was extracted to kill — re-introduced
// a layer up. The error label is a parameter precisely so a second copy is
// never the easy way to reword a message.
// ---------------------------------------------------------------------------

export interface SalesRangeData {
  saleTransactions: SaleTransaction[];
}

export interface UseSalesRangeData {
  loading: boolean;
  error: string | null;
  data: SalesRangeData | null;
  fetchRange: (startDate: string, endDate: string) => Promise<void>;
}

/**
 * @param errorMessage shown to the operator when the fetch fails — phrased for
 *   the calling report, since "failed to load" alone doesn't say what's missing.
 */
export function useSalesRangeData(errorMessage: string): UseSalesRangeData {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SalesRangeData | null>(null);
  // Monotonic request id. Editing "From" then "To" fires two overlapping
  // fetches, and Firestore gives no ordering guarantee between them — if the
  // OLDER one resolves last it would overwrite the newer result while the
  // header and the Excel export both stamp the newer range. A workbook is a
  // durable artifact, so a file named for August holding July's rows is not
  // something anyone catches later. Only the latest request may write state.
  const latestRequest = useRef(0);

  const fetchRange = useCallback(async (startDate: string, endDate: string): Promise<void> => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const saleTransactions =
        await fetchRangeCollection<SaleTransaction>("saleTransactions", startDate, endDate);
      if (requestId !== latestRequest.current) return;
      setData({ saleTransactions });
    } catch (err) {
      console.error("Sales range fetch error:", err);
      if (requestId !== latestRequest.current) return;
      setError(errorMessage);
      setData(null);
    } finally {
      // Guarded too: an older request finishing must not clear the spinner
      // that the newer, still-running one is showing.
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [errorMessage]);

  return { loading, error, data, fetchRange };
}
