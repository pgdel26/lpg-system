"use client";
import { useState } from "react";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import PurchasesPage from "../../../views/PurchasesPage";
import PurchaseModal from "../../../components/PurchaseModal";
import { today } from "../../../lib/utils";

export default function PurchasesRoutePage() {
  const data = useAppData();

  // ---- Purchase modal UI state ----
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseModalDate, setPurchaseModalDate] = useState(today());
  const [purchaseModalError, setPurchaseModalError] = useState("");

  // ---- Modal open handler ----
  const handleOpenPurchaseModal = () => {
    setPurchaseModalOpen(true);
    setPurchaseModalDate(today());
    setPurchaseModalError("");
  };

  // ---- Record-mutation wrapper ----
  const handleRecordPurchase = async (
    items: Array<{ section: string; product: string; qty: string | number }>,
    totalCost: string,
  ) => {
    setPurchaseModalError("");
    const err = await data.recordPurchase({ items, totalCost, date: purchaseModalDate });
    if (err) {
      setPurchaseModalError(err);
      return;
    }
    setPurchaseModalOpen(false);
  };

  return (
    <>
      <PurchasesPage
        purchaseTransactions={data.purchaseTransactions}
        purchaseDailyCosts={data.purchaseDailyCosts}
        branches={data.branches}
        hasMorePurchases={data.hasMorePurchases}
        loadingMorePurchases={data.loadingMorePurchases}
        onLoadMorePurchases={data.loadMorePurchases}
        fetchPurchasesInRange={data.fetchPurchasesInRange}
        purchasesVersion={data.purchasesVersion}
        onOpenPurchaseModal={handleOpenPurchaseModal}
        onUpdatePurchase={data.updatePurchase}
        onDeletePurchase={data.deletePurchase}
        onDeleteTransfer={data.deleteTransfer}
      />

      {purchaseModalOpen && (
        <PurchaseModal
          date={purchaseModalDate}
          setDate={setPurchaseModalDate}
          error={purchaseModalError}
          purchaseSections={data.purchaseSections}
          onClose={() => setPurchaseModalOpen(false)}
          onSubmit={handleRecordPurchase}
        />
      )}
    </>
  );
}
