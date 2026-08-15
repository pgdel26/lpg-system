"use client";
import { useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAppData } from "../../../../lib/providers/AppDataProvider";

import TransactionsPage from "../../../../views/transactions/TransactionsPage";
import SaleModal from "../../../../components/SaleModal";
import SwapModal from "../../../../components/SwapModal";
import RefundModal from "../../../../components/RefundModal";

import type { RecordRefundInput } from "../../../../lib/hooks/useRefundsData";
import type { RecordSaleInput, RecordSalePaymentInput } from "../../../../lib/hooks/useSalesData";

export default function SalesPage() {
  const router = useRouter();
  const { branch } = useParams<{ branch: string }>();
  const data = useAppData();

  // useReceivablesData fetches AR company-wide (the standalone Receivables
  // page is intentionally not branch-scoped) — but the Sales Report's
  // Collections figure must only count this outlet's own collections, or a
  // collection made at one branch bleeds into every other branch's report.
  const branchArTransactions = useMemo(
    () => data.arTransactions.filter((t) => t.branch === branch),
    [data.arTransactions, branch],
  );

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

  return (
    <>
      <TransactionsPage
        inventoryDate={data.inventoryDate}
        setInventoryDate={data.setInventoryDate}
        onViewInventory={() => router.push(`/${branch}/inventory`)}
        saleTransactions={data.saleTransactions}
        swaps={data.swaps}
        refunds={data.refunds}
        expenses={data.expenses}
        staff={data.staff}
        dailyReport={data.dailyReport}
        onUpdateDailyStaff={data.updateDailyStaff}
        allRefunds={data.allRefunds}
        arTransactions={branchArTransactions}
        onOpenSaleModal={handleOpenSaleModal}
        onOpenSwapModal={handleOpenSwapModal}
        onOpenRefundModal={handleOpenRefundModal}
        onUpdateSale={data.updateSale}
        onUpdateSwap={data.updateSwap}
        onUpdateRefund={data.updateRefund}
        onDeleteSale={data.deleteSale}
        onDeleteSwap={data.deleteSwap}
        onDeleteRefund={data.deleteRefund}
        onAddExpense={data.addExpense}
        onUpdateExpense={data.updateExpense}
        onDeleteExpense={data.deleteExpense}
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
