"use client";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAppData } from "../../../lib/providers/AppDataProvider";

import OutletPage from "../../../views/outlet/OutletPage";
import SaleModal from "../../../components/SaleModal";
import SwapModal from "../../../components/SwapModal";
import RefundModal from "../../../components/RefundModal";
import RecordCollectionModal from "../../../components/RecordCollectionModal";
import EditCollectionModal from "../../../components/EditCollectionModal";
import ConfirmModal from "../../../components/ConfirmModal";

import { fmt, formatDateShort } from "../../../lib/utils";
import { arMethodLabel, type CollectionBatch } from "../../../lib/receivables";
import type { RecordRefundInput } from "../../../lib/hooks/useRefundsData";
import type { RecordSaleInput, RecordSalePaymentInput } from "../../../lib/hooks/useSalesData";

export default function OutletRoutePage() {
  const { branch } = useParams<{ branch: string }>();
  const data = useAppData();

  // ---- Sale modal UI state ----
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleModalInvoice, setSaleModalInvoice] = useState("");
  const [saleModalCustomer, setSaleModalCustomer] = useState("");
  const [saleModalNewCustomer, setSaleModalNewCustomer] = useState(false);
  const [saleModalNewName, setSaleModalNewName] = useState("");
  const [saleModalNewPhone, setSaleModalNewPhone] = useState("");
  const [saleModalError, setSaleModalError] = useState("");

  // ---- Swap modal UI state ----
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapProductFrom, setSwapProductFrom] = useState("");
  const [swapProductTo, setSwapProductTo] = useState("");
  const [swapPrice, setSwapPrice] = useState("");
  const [swapCustomFrom, setSwapCustomFrom] = useState("");
  const [swapCustomer, setSwapCustomer] = useState("");
  const [swapNewCustomer, setSwapNewCustomer] = useState(false);
  const [swapNewName, setSwapNewName] = useState("");
  const [swapNewPhone, setSwapNewPhone] = useState("");
  const [swapModalError, setSwapModalError] = useState("");

  // ---- Refund modal UI state ----
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundModalError, setRefundModalError] = useState("");

  // ---- Modal open handlers ----
  const handleOpenSaleModal = () => {
    setSaleModalOpen(true);
    setSaleModalInvoice("");
    setSaleModalCustomer("");
    setSaleModalNewCustomer(false);
    setSaleModalNewName("");
    setSaleModalNewPhone("");
    setSaleModalError("");
  };

  const handleOpenSwapModal = () => {
    setSwapModalOpen(true);
    setSwapModalError("");
    setSwapProductFrom(data.cylinderProducts[0] || "");
    setSwapProductTo(data.cylinderProducts[1] || "");
    setSwapPrice("");
    setSwapCustomFrom("");
    setSwapCustomer("");
    setSwapNewCustomer(false);
    setSwapNewName("");
    setSwapNewPhone("");
  };

  const handleOpenRefundModal = () => {
    setRefundModalOpen(true);
    setRefundModalError("");
  };

  // ---- Record-mutation wrappers ----
  const handleRecordSale = async (
    items: RecordSaleInput["items"],
    globalDiscount: number,
    saleDate: string,
    deliveryCharge = 0,
    checkData: { checkDate: string; checkAmount: number } | null = null,
    payments: RecordSalePaymentInput[] = [],
  ) => {
    setSaleModalError("");
    const err = await data.recordSale({
      items,
      globalDiscount,
      saleDate,
      deliveryCharge,
      checkData,
      payments,
      invoice: saleModalInvoice,
      isNewCustomer: saleModalNewCustomer,
      selectedCustomerId: saleModalCustomer,
      newCustomerName: saleModalNewName,
      newCustomerPhone: saleModalNewPhone,
    });
    if (err) {
      setSaleModalError(err);
      return;
    }
    setSaleModalOpen(false);
    setSaleModalInvoice("");
    setSaleModalCustomer("");
    setSaleModalNewCustomer(false);
    setSaleModalNewName("");
    setSaleModalNewPhone("");
  };

  const handleRecordSwap = async () => {
    setSwapModalError("");
    const err = await data.recordSwap({
      productFrom: swapProductFrom,
      productTo: swapProductTo,
      price: swapPrice,
      customFrom: swapCustomFrom,
      selectedCustomerId: swapCustomer,
      isNewCustomer: swapNewCustomer,
      newCustomerName: swapNewName,
      newCustomerPhone: swapNewPhone,
    });
    if (err) {
      setSwapModalError(err);
      return;
    }
    setSwapModalOpen(false);
    setSwapProductFrom("");
    setSwapProductTo("");
    setSwapPrice("");
    setSwapCustomFrom("");
    setSwapCustomer("");
    setSwapNewCustomer(false);
    setSwapNewName("");
    setSwapNewPhone("");
  };

  const handleRecordRefund = async (refund: RecordRefundInput) => {
    setRefundModalError("");
    const err = await data.recordRefund(refund);
    if (err) {
      setRefundModalError(err);
      return;
    }
    setRefundModalOpen(false);
  };

  // ---- A/R collection modal ----
  // Same component and same mutation as the Receivables page: a collection is
  // one event, and a second implementation would be a second set of FIFO rules
  // to keep in step.
  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<CollectionBatch | null>(null);
  const [pendingVoidCollection, setPendingVoidCollection] = useState<CollectionBatch | null>(null);

  // ---- Total Cylinder computed view (cross-section, view-only) ----
  // Relocated from the removed [branch]/inventory route page. Lives here (not
  // in a hook) because it is purely derived from the already-exposed
  // resolvedInventory / inventorySections / cylinderProducts.
  const totalCylinderData = useMemo(() => {
    const fullSection = data.inventorySections.find((s) => s.key === "full");
    const emptySection = data.inventorySections.find((s) => s.key === "empty");
    if (!fullSection || !emptySection) return [];

    return data.cylinderProducts.map((product) => {
      const fullRow = data.resolvedInventory.full?.[product] || {};
      const emptyRow = data.resolvedInventory.empty?.[product] || {};
      // BEG + END only. The Total Cylinder table (views/InventoryPage.tsx) and
      // the inventory sheet (views/inventory/inventoryExport.ts) both render
      // exactly three columns — an audit/variance pair was being computed here
      // and discarded by every consumer.
      //
      // `|| 0` is right for a SUM: two sections are being added, and an absent
      // BEG contributes nothing. The absent-vs-zero distinction that matters
      // lives in the per-section grid, which reads the cells directly.
      const beg = ((fullRow.beg as number) || 0) + ((emptyRow.beg as number) || 0);
      const end = fullSection.calcEnd(fullRow) + emptySection.calcEnd(emptyRow);

      return { product, beg, end };
    });
  }, [data.resolvedInventory, data.inventorySections, data.cylinderProducts]);

  return (
    <>
      <OutletPage
        inventoryDate={data.inventoryDate}
        setInventoryDate={data.setInventoryDate}
        saleTransactions={data.saleTransactions}
        swaps={data.swaps}
        refunds={data.refunds}
        expenses={data.expenses}
        staff={data.staff}
        dailyReport={data.dailyReport}
        onUpdateDailyStaff={data.updateDailyStaff}
        arTransactions={data.arTransactions}
        branch={branch}
        onOpenSaleModal={handleOpenSaleModal}
        onOpenSwapModal={handleOpenSwapModal}
        onOpenRefundModal={handleOpenRefundModal}
        onOpenCollectionModal={() => setCollectionModalOpen(true)}
        onEditCollection={setEditingCollection}
        onVoidCollection={setPendingVoidCollection}
        onUpdateSale={data.updateSale}
        onUpdateSwap={data.updateSwap}
        onUpdateRefund={data.updateRefund}
        onDeleteSale={data.deleteSale}
        onDeleteSwap={data.deleteSwap}
        onDeleteRefund={data.deleteRefund}
        onAddExpense={data.addExpense}
        onUpdateExpense={data.updateExpense}
        onDeleteExpense={data.deleteExpense}
        branches={data.branches}
        purchaseSections={data.purchaseSections}
        onRecordTransfer={data.recordTransfer}
        resolvedInventory={data.resolvedInventory}
        totalCylinderData={totalCylinderData}
        inventorySections={data.inventorySections}
        onInventoryChange={data.handleInventoryChange}
        onSaveSection={data.saveSection}
        onFixBeginning={data.handleFixBeginning}
      />

      {swapModalOpen && (
        <SwapModal
          productFrom={swapProductFrom}
          setProductFrom={setSwapProductFrom}
          productTo={swapProductTo}
          setProductTo={setSwapProductTo}
          customFrom={swapCustomFrom}
          setCustomFrom={setSwapCustomFrom}
          price={swapPrice}
          setPrice={setSwapPrice}
          customer={swapCustomer}
          setCustomer={setSwapCustomer}
          newCustomer={swapNewCustomer}
          setNewCustomer={setSwapNewCustomer}
          newName={swapNewName}
          setNewName={setSwapNewName}
          newPhone={swapNewPhone}
          setNewPhone={setSwapNewPhone}
          customers={data.customers}
          cylinderProducts={data.cylinderProducts}
          error={swapModalError}
          onClose={() => setSwapModalOpen(false)}
          onSubmit={handleRecordSwap}
        />
      )}

      {saleModalOpen && (
        <SaleModal
          invoice={saleModalInvoice}
          setInvoice={setSaleModalInvoice}
          customer={saleModalCustomer}
          setCustomer={setSaleModalCustomer}
          newCustomer={saleModalNewCustomer}
          setNewCustomer={setSaleModalNewCustomer}
          newName={saleModalNewName}
          setNewName={setSaleModalNewName}
          newPhone={saleModalNewPhone}
          setNewPhone={setSaleModalNewPhone}
          error={saleModalError}
          customers={data.customers}
          activePricebook={data.activePricebook}
          inventoryDate={data.inventoryDate}
          salesSections={data.salesSections}
          onClose={() => setSaleModalOpen(false)}
          onSubmit={handleRecordSale}
        />
      )}

      {collectionModalOpen && (
        <RecordCollectionModal
          arTransactions={data.arTransactions}
          branches={data.branches}
          // Scoped to what this screen already knows: the day on display and
          // the outlet in the URL. Both stay editable in the modal.
          defaultDate={data.inventoryDate}
          defaultBranch={branch}
          onSubmit={data.recordArCollection}
          onClose={() => setCollectionModalOpen(false)}
        />
      )}

      {editingCollection && (
        <EditCollectionModal
          collection={editingCollection}
          branches={data.branches}
          onSubmit={data.editArCollectionBatch}
          onClose={() => setEditingCollection(null)}
        />
      )}

      {pendingVoidCollection && (
        <ConfirmModal
          title="Void collection?"
          // Spells out the method and, when it was cash, the consequence for
          // the day being closed — voiding a cash collection lowers that day's
          // Expected Cash Remit, which is the number the operator is holding
          // physical money against.
          message={`This reverses ${fmt(pendingVoidCollection.amount)} collected from ${pendingVoidCollection.customerName} by ${arMethodLabel(pendingVoidCollection.method)} across ${pendingVoidCollection.invoices.length} invoice(s), putting the balance back on their account.${
            pendingVoidCollection.method === "cash"
              ? ` It also reduces ${formatDateShort(pendingVoidCollection.date)}'s Expected Cash Remit by that amount.`
              : ""
          }`}
          confirmLabel="Void"
          onConfirm={async () => {
            await data.voidArCollectionBatch(pendingVoidCollection.batchId);
            setPendingVoidCollection(null);
          }}
          onCancel={() => setPendingVoidCollection(null)}
        />
      )}

      {refundModalOpen && (
        <RefundModal
          saleTransactions={data.saleTransactions}
          customers={data.customers}
          cylinderProducts={data.cylinderProducts}
          singlePriceCategories={data.singlePriceCategories}
          error={refundModalError}
          onClose={() => setRefundModalOpen(false)}
          onSubmit={handleRecordRefund}
        />
      )}
    </>
  );
}
