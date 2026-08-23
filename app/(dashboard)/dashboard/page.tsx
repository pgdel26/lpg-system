"use client";
import { useEffect, useMemo } from "react";
import { useDashboardData } from "../../../lib/hooks/useDashboardData";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { DEFAULT_BRANCH_ID } from "../../../lib/constants";
import { today } from "../../../lib/utils";
import DashboardHome from "../../../views/dashboard/DashboardHome";

export default function DashboardRoutePage() {
  const { branches, cylinderProducts, arTransactions, staff, canAccess } = useAppData();
  const { loading, error, data, fetchFor } = useDashboardData();

  // The dashboard always reports on today; there is no date filter. Safe to
  // call per render — it returns the same string, so the effect below sees a
  // stable dependency rather than a new value each time.
  const date = today();

  // Joined into a primitive so the effect doesn't re-fire on every provider
  // snapshot that hands back a new-but-equal branches array.
  const branchIdsKey = branches.map((b) => b.id).join(",");

  useEffect(() => {
    if (!branchIdsKey) return;
    fetchFor(date, branchIdsKey.split(","));
  }, [date, branchIdsKey, fetchFor]);

  const onHandByBranch = useMemo(() => data?.onHandByBranch || {}, [data]);

  return (
    <DashboardHome
      date={date}
      saleTransactions={data?.saleTransactions || []}
      swaps={data?.swaps || []}
      refunds={data?.refunds || []}
      expenses={data?.expenses || []}
      staff={staff}
      arTransactions={arTransactions}
      onHandByBranch={onHandByBranch}
      cylinderProducts={cylinderProducts}
      branches={branches}
      defaultBranchId={DEFAULT_BRANCH_ID}
      canAccess={canAccess}
      loading={loading}
      error={error}
    />
  );
}
