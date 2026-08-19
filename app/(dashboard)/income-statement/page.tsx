"use client";
import { useEffect, useState } from "react";
import { useIncomeStatementData } from "../../../lib/hooks/useIncomeStatementData";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import IncomeStatementPage from "../../../views/incomeStatement/IncomeStatementPage";
import { today } from "../../../lib/utils";

export default function IncomeStatementRoutePage() {
  const { branches, arTransactions } = useAppData();
  const { loading, error, data, fetchRange } = useIncomeStatementData();

  // Default period: current calendar month to date.
  const [startDate, setStartDate] = useState(() => `${today().slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(() => today());

  useEffect(() => {
    fetchRange(startDate, endDate);
  }, [startDate, endDate, fetchRange]);

  return (
    <IncomeStatementPage
      startDate={startDate}
      endDate={endDate}
      onChangeRange={(start, end) => { setStartDate(start); setEndDate(end); }}
      loading={loading}
      error={error}
      saleTransactions={data?.saleTransactions || []}
      swaps={data?.swaps || []}
      refunds={data?.refunds || []}
      purchases={data?.purchases || []}
      purchaseDeliveries={data?.purchaseDeliveries || []}
      expenses={data?.expenses || []}
      branches={branches}
      arTransactions={arTransactions}
    />
  );
}
