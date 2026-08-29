"use client";
import { useEffect, useMemo } from "react";
import { useSalesRangeData } from "../../../lib/hooks/useSalesRangeData";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { today, trailingMonths } from "../../../lib/utils";
import ProductSalesPage from "../../../views/reports/ProductSalesPage";

/**
 * Six columns: the current month plus the five before it.
 *
 * Enough to see a season turn without the table needing horizontal scrolling on
 * a laptop, which is the width at which a trend stops being readable at a
 * glance. Anything longer is the Export button's job.
 */
const MONTHS_SHOWN = 6;

export default function ProductSalesRoutePage() {
  const { branches } = useAppData();
  const { loading, error, data, fetchRange } = useSalesRangeData("Failed to load product sales.");

  // Fixed to the trailing window rather than driven by date pickers: this
  // report answers "how are the products moving lately", and every screen that
  // has asked that question here has been opened on the same months. Computed
  // once per mount — a page left open across midnight keeps the window it
  // loaded with, same as the date presets it replaces.
  const periods = useMemo(
    () => trailingMonths(today(), MONTHS_SHOWN).map((m) => ({
      startDate: m.start,
      endDate: m.end,
      label: m.label,
      partial: m.partial,
    })),
    [],
  );

  // The Firestore call sits in the route page, not the view — see CLAUDE.md's
  // data-layer rule. ONE query for the whole window, not one per column: the
  // months are consecutive, so they are a single contiguous span, and six
  // queries would re-ask for a range Firestore can return in one.
  useEffect(() => {
    fetchRange(periods[0].startDate, periods[periods.length - 1].endDate);
  }, [periods, fetchRange]);

  return (
    <ProductSalesPage
      saleTransactions={data?.saleTransactions || []}
      periods={periods}
      branches={branches}
      loading={loading}
      error={error}
    />
  );
}
