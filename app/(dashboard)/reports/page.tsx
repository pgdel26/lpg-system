"use client";
import { useEffect, useState } from "react";
import { useCustomerOrdersData } from "../../../lib/hooks/useCustomerOrdersData";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { today } from "../../../lib/utils";
import ReportsPage from "../../../views/reports/ReportsPage";

export default function ReportsRoutePage() {
  const { branches } = useAppData();
  const { loading, error, data, fetchRange } = useCustomerOrdersData();

  // Defaults to TODAY only, both ends. The columns are one per product+type
  // actually ordered, so a wide default range would open the screen on dozens
  // of columns; a single day is the readable starting point and the pickers
  // widen it from there.
  const [startDate, setStartDate] = useState(() => today());
  const [endDate, setEndDate] = useState(() => today());

  // The Firestore call sits in the route page, not the view — see CLAUDE.md's
  // data-layer rule. An inverted range would query nothing useful, so it's
  // skipped rather than sent.
  useEffect(() => {
    if (startDate > endDate) return;
    fetchRange(startDate, endDate);
  }, [startDate, endDate, fetchRange]);

  return (
    <ReportsPage
      saleTransactions={data?.saleTransactions || []}
      startDate={startDate}
      endDate={endDate}
      onChangeRange={(start, end) => { setStartDate(start); setEndDate(end); }}
      branches={branches}
      loading={loading}
      error={error}
    />
  );
}
