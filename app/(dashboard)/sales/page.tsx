"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import TransactionsPage from "../../../views/transactions/TransactionsPage";
import SaleModal from "../../../components/SaleModal";
import SwapModal from "../../../components/SwapModal";
import RefundModal from "../../../components/RefundModal";
import type { RecordRefundInput } from "../../../lib/hooks/useRefundsData";
import type { RecordSaleInput } from "../../../lib/hooks/useSalesData";

// Page-id → route map (mirrors the old activePage string identifiers).
const ROUTE_FOR: Record<string, string> = {
  transactions: "/sales",
  purchases: "/purchases",
  inventory: "/inventory",
  products: "/pricing",
  customers: "/customers",
  receivables: "/receivables",
  staff: "/staff",
  notifications: "/notifications",
  contact: "/contact",
};

export default function SalesPage() {
  const router = useRouter();
  const data = useAppData();

  // ---- Sale modal UI state ----
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleModalInvoice, setSaleModalInvoice] = useState("");
  const [saleModalCustomer, setSaleModalCustomer] = useState("");
  const [saleModalNewCustomer, setSaleModalNewCustomer] = useState(false);
  const [saleModalNewName, setSaleModalNewName] = useState("");
  const [saleModalNewPhone, setSaleModalNewPhone] = useState("");
  const [saleModalPayment, setSaleModalPayment] = useState("cash");
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
    setSaleModalPayment("cash");
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
    gcashRef = "",
  ) => {
    setSaleModalError("");
    const err = await data.recordSale({
      items,
      globalDiscount,
      saleDate,
      deliveryCharge,
      checkData,
      gcashRef,
      paymentType: saleModalPayment,
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
    setSaleModalPayment("cash");
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
        onNavigate={(page: string) => {
          const route = ROUTE_FOR[page];
          if (route) router.push(route);
        }}
        saleTransactions={data.saleTransactions}
        swaps={data.swaps}
        refunds={data.refunds}
        expenses={data.expenses}
        staff={data.staff}
        dailyReport={data.dailyReport}
        onUpdateDailyStaff={data.updateDailyStaff}
        allRefunds={data.allRefunds}
        arTransactions={data.arTransactions}
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
          payment={saleModalPayment}
          setPayment={setSaleModalPayment}
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
          allAccessoryProducts={data.allAccessoryProducts}
          error={refundModalError}
          onClose={() => setRefundModalOpen(false)}
          onSubmit={handleRecordRefund}
        />
      )}
    </>
  );
}
