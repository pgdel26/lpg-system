"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import RefundsPage from "../../../views/refunds/RefundsPage";

export default function RefundsRoutePage() {
  const data = useAppData();

  // allRefunds is company-wide and live (see useRefundsData) — no fetch of its
  // own here, and edits/deletes on this screen reflect immediately.
  return (
    <RefundsPage
      allRefunds={data.allRefunds}
      branches={data.branches}
      onUpdateRefund={data.updateRefund}
      onDeleteRefund={data.deleteRefund}
    />
  );
}
