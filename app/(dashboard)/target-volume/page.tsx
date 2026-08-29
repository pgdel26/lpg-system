"use client";
import { useEffect, useMemo } from "react";
import { useSalesRangeData } from "../../../lib/hooks/useSalesRangeData";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { monthBounds, monthOf, targetProductScope } from "../../../lib/customerTargets";
import { today } from "../../../lib/utils";
import TargetVolumePage from "../../../views/customerTargets/TargetVolumePage";

export default function TargetVolumeRoutePage() {
  const {
    customers, customerCategories, salesSections, customerTargets, targetsLoaded,
    saveCustomerTargetQty, setCustomerDiscount, removeCustomerTarget,
  } = useAppData();
  const { loading, error, data, fetchRange } =
    useSalesRangeData("Failed to load this month's sales.");

  // Fixed to the current month, and no longer a control. The agreements are
  // standing, so there is no other month to look at — this only decides the
  // window the Actual column measures, which always resets on the 1st.
  //
  // Computed once per mount: a page left open across midnight keeps the month it
  // loaded with, the same as every other screen here.
  const month = useMemo(() => monthOf(today()), []);

  // The Firestore call sits in the route page, not the view — see CLAUDE.md's
  // data-layer rule. A one-shot range fetch rather than a live subscription:
  // this screen is read as a monthly review, and a month of sale documents is
  // not something to keep subscribed for a whole session.
  //
  // The WHOLE month, including days still ahead in the current month — a target
  // is a whole-month agreement, so the window it is measured over doesn't shrink
  // because the month is unfinished.
  useEffect(() => {
    const { start, end } = monthBounds(month);
    fetchRange(start, end);
  }, [month, fetchRange]);

  // Every sellable product, plus the categories they sell under. Derived from
  // the sale sections rather than from a category test written here — that is
  // this app's one definition of "sellable", so a category added later lists
  // its products with no code change. See .claude/skills/safe-category-change.md.
  const scope = useMemo(() => targetProductScope(salesSections), [salesSections]);

  return (
    <TargetVolumePage
      month={month}
      customers={customers}
      customerCategories={customerCategories}
      products={scope.products}
      countedCategories={scope.categories}
      targets={customerTargets}
      saleTransactions={data?.saleTransactions || []}
      onSaveTargetQty={saveCustomerTargetQty}
      onSetDiscount={setCustomerDiscount}
      onRemoveTarget={removeCustomerTarget}
      loading={loading || !targetsLoaded}
      error={error}
    />
  );
}
