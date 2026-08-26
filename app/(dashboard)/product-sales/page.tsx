"use client";
import { useEffect, useMemo, useState } from "react";
import { useSalesRangeData } from "../../../lib/hooks/useSalesRangeData";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { presetThisMonth, today } from "../../../lib/utils";
import ProductSalesPage from "../../../views/reports/ProductSalesPage";

export default function ProductSalesRoutePage() {
  const { branches, salesSections } = useAppData();
  const { loading, error, data, fetchRange } = useSalesRangeData("Failed to load product sales.");

  // Defaults to the current month. Unlike Customer Orders — whose columns grow
  // with the range, so it opens on a single day — this report is one row per
  // product with a single quantity column, so a month is readable on arrival
  // and is the period the owner actually asks about.
  const [startDate, setStartDate] = useState(() => presetThisMonth(today()).start);
  const [endDate, setEndDate] = useState(() => presetThisMonth(today()).end);

  // The catalog side of the product picklist, derived from the SALES sections
  // rather than from a category filter of our own — salesSections is already
  // the one definition of "sellable", so a category added later shows up here
  // with no change (and a hidden one stays hidden). Products that only appear
  // on historical sale documents are unioned in by the view.
  const catalogProducts = useMemo(() => {
    const names = new Set<string>();
    for (const section of salesSections) {
      for (const name of section.products || []) names.add(name);
      for (const group of section.subgroups || []) {
        for (const name of group.products || []) names.add(name);
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [salesSections]);

  // The Firestore call sits in the route page, not the view — see CLAUDE.md's
  // data-layer rule. An inverted range would query nothing useful, so it's
  // skipped rather than sent.
  useEffect(() => {
    if (startDate > endDate) return;
    fetchRange(startDate, endDate);
  }, [startDate, endDate, fetchRange]);

  return (
    <ProductSalesPage
      saleTransactions={data?.saleTransactions || []}
      catalogProducts={catalogProducts}
      startDate={startDate}
      endDate={endDate}
      onChangeRange={(start, end) => { setStartDate(start); setEndDate(end); }}
      branches={branches}
      loading={loading}
      error={error}
    />
  );
}
