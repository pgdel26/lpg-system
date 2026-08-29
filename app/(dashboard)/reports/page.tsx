"use client";
import { useEffect, useMemo, useState } from "react";
import { useSalesRangeData } from "../../../lib/hooks/useSalesRangeData";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { monthBounds, monthOf, targetProductScope } from "../../../lib/customerTargets";
import { today, presetThisMonth } from "../../../lib/utils";
import ReportsPage from "../../../views/reports/ReportsPage";

export default function ReportsRoutePage() {
  const { branches, customerTargets, salesSections } = useAppData();
  const { loading, error, data, fetchRange } = useSalesRangeData("Failed to load volume per customer.");
  // A SECOND fetch, over the whole target month, feeding the target tags only.
  //
  // It cannot share the grid's array: a target is measured over the whole month,
  // and the grid's array holds exactly the picked range. Pick 15–20 August and
  // the month is still "2026-08", but six days of sales would be all the tag had
  // to count — so a customer sitting at 300/300 on the Target Volume screen
  // would tag as "290 to go" here. Same scan, different input, opposite answer.
  const { data: targetMonthSales, fetchRange: fetchTargetMonth } =
    useSalesRangeData("Could not check monthly targets.");

  // Defaults to THIS MONTH, 1st to today — the same window the This Month
  // preset sets, so the default state is one the buttons can return you to.
  //
  // It used to open on today alone, because the columns are one per product+type
  // ordered and a wide range opens the screen on dozens of them. The Products
  // multi-select is the answer to that now: the width is something the operator
  // controls, so the default can be the period they actually review.
  //
  // Computed once per mount, so a page left open across midnight keeps the
  // window it loaded with.
  const [startDate, setStartDate] = useState(() => presetThisMonth(today()).start);
  const [endDate, setEndDate] = useState(() => presetThisMonth(today()).end);

  // The Firestore call sits in the route page, not the view — see CLAUDE.md's
  // data-layer rule. An inverted range would query nothing useful, so it's
  // skipped rather than sent.
  useEffect(() => {
    if (startDate > endDate) return;
    fetchRange(startDate, endDate);
  }, [startDate, endDate, fetchRange]);

  // Targets are a WHOLE-MONTH agreement, so they can only be read against a
  // range that sits inside one month. Decided here rather than in the view
  // because it is what governs the fetch below.
  const targetMonth = monthOf(startDate) === monthOf(endDate) ? monthOf(startDate) : null;

  useEffect(() => {
    if (!targetMonth) return;
    const { start, end } = monthBounds(targetMonth);
    fetchTargetMonth(start, end);
  }, [targetMonth, fetchTargetMonth]);

  // The same scope the Target Volume screen measures with — derived from the
  // sale sections, never spelled out again here. Two spellings of "what counts"
  // is how one screen says a target is reached while the other says six to go.
  const targetCategories = useMemo(
    () => targetProductScope(salesSections).categories,
    [salesSections],
  );

  return (
    <ReportsPage
      saleTransactions={data?.saleTransactions || []}
      startDate={startDate}
      endDate={endDate}
      onChangeRange={(start, end) => { setStartDate(start); setEndDate(end); }}
      branches={branches}
      targets={customerTargets}
      targetCategories={targetCategories}
      targetMonth={targetMonth}
      targetMonthSales={targetMonthSales?.saleTransactions || []}
      loading={loading}
      error={error}
    />
  );
}
