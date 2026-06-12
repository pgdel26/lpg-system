"use client";
import React, { useState, useMemo } from "react";
import { auth } from "../lib/firebase";
import { today } from "../lib/utils";
import { LoadingIcon, MenuIcon } from "../components/Icons";
import LoginPage from "../components/LoginPage";
import Sidebar from "../components/Sidebar";
import TransactionsPage from "../views/TransactionsPage";
import ProductsPage from "../views/ProductsPage";
import CustomersPage from "../views/CustomersPage";
import SaleModal from "../components/SaleModal";
import SwapModal from "../components/SwapModal";
import PurchasesPage from "../views/PurchasesPage";
import PurchaseModal from "../components/PurchaseModal";
import RefundModal from "../components/RefundModal";
import ReceivablesPage from "../views/ReceivablesPage";
import StaffPage from "../views/StaffPage";
import NotificationsPage from "../views/NotificationsPage";
import ContactUsPage from "../views/ContactUsPage";
import InventoryTabPage from "../views/InventoryTabPage";
import { useAuth } from "../lib/hooks/useAuth";
import { AppDataProvider, useAppData } from "../lib/providers/AppDataProvider";

// ============================================================
// TOP-LEVEL: auth gate. When authenticated, mount the data
// provider and render the dashboard inside it.
// ============================================================
export default function GasulTracker() {
  const { authUser, authLoading, accessDenied, logout } = useAuth();

  // Auth loading
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <LoadingIcon />
      </div>
    );
  }

  // Not logged in, or access denied. onRetry logs out, which fires the auth
  // listener with no user and clears accessDenied (matches the old reset).
  if (!authUser) {
    return (
      <LoginPage
        denied={accessDenied}
        deniedEmail={auth.currentUser?.email || ""}
        onRetry={logout}
      />
    );
  }

  return (
    <AppDataProvider currentUserEmail={authUser.email}>
      <Dashboard authUser={authUser} onLogout={logout} />
    </AppDataProvider>
  );
}

// ============================================================
// DASHBOARD: holds local UI state (active page, sidebar, modal
// state) and sources all data/handlers from useAppData().
// ============================================================
function Dashboard({
  authUser,
  onLogout,
}: {
  authUser: { email: string | null; photoURL: string | null; displayName: string | null };
  onLogout: () => void;
}) {
  const data = useAppData();

  // ---- Local UI state ----
  const [activePage, setActivePage] = useState("transactions");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sale modal UI state
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleModalInvoice, setSaleModalInvoice] = useState("");
  const [saleModalCustomer, setSaleModalCustomer] = useState("");
  const [saleModalNewCustomer, setSaleModalNewCustomer] = useState(false);
  const [saleModalNewName, setSaleModalNewName] = useState("");
  const [saleModalNewPhone, setSaleModalNewPhone] = useState("");
  const [saleModalPayment, setSaleModalPayment] = useState("cash");
  const [saleModalError, setSaleModalError] = useState("");

  // Swap modal UI state
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

  // Purchase modal UI state
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseModalDate, setPurchaseModalDate] = useState(today());
  const [purchaseModalError, setPurchaseModalError] = useState("");

  // Refund modal UI state
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundModalError, setRefundModalError] = useState("");

  // ---- Total Cylinder computed view (cross-section, view-only) ----
  // Lives here (not in a hook) because it is purely derived from the
  // already-exposed resolvedInventory / inventorySections / cylinderProducts.
  const totalCylinderData = useMemo(() => {
    const fullSection = data.inventorySections.find((s) => s.key === "full");
    const emptySection = data.inventorySections.find((s) => s.key === "empty");
    if (!fullSection || !emptySection) return [];

    return data.cylinderProducts.map((product) => {
      const fullRow = data.resolvedInventory.full?.[product] || {};
      const emptyRow = data.resolvedInventory.empty?.[product] || {};
      // Read raw cell values loosely: at runtime `aud` may be a number, a string,
      // null, or absent. The typed InventoryRow narrows `aud` to number|FieldValue,
      // so go through `unknown` to reproduce page.js's permissive checks.
      const fullAudRaw = (fullRow as Record<string, unknown>).aud;
      const emptyAudRaw = (emptyRow as Record<string, unknown>).aud;

      const fullBeg = (fullRow.beg as number) || 0;
      const emptyBeg = (emptyRow.beg as number) || 0;
      const fullEnd = fullSection.calcEnd(fullRow);
      const emptyEnd = emptySection.calcEnd(emptyRow);
      const fullAud = fullAudRaw != null && fullAudRaw !== "" ? parseFloat(String(fullAudRaw)) || 0 : null;
      const emptyAud = emptyAudRaw != null && emptyAudRaw !== "" ? parseFloat(String(emptyAudRaw)) || 0 : null;

      const beg = fullBeg + emptyBeg;
      const end = fullEnd + emptyEnd;
      const aud = (fullAud != null && emptyAud != null) ? fullAud + emptyAud : null;
      const variance = aud != null ? aud - end : null;

      return { product, beg, end, aud, var: variance };
    });
  }, [data.resolvedInventory, data.inventorySections, data.cylinderProducts]);

  // ---- Modal open handlers (UI state) ----
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

  const handleOpenPurchaseModal = () => {
    setPurchaseModalOpen(true);
    setPurchaseModalDate(today());
    setPurchaseModalError("");
  };

  const handleOpenRefundModal = () => {
    setRefundModalOpen(true);
    setRefundModalError("");
  };

  // ---- Record-mutation wrappers: build the input object from the modal's
  // callback args + local modal state, call data.record*, then reproduce the
  // old behavior (set modal error on failure / close + reset on success). ----
  const handleRecordSale = async (
    items: Array<{ section: string; product: string; qty: string | number }>,
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

  const handleRecordPurchase = async (
    items: Array<{ section: string; product: string; qty: string | number; price: string | number }>,
  ) => {
    setPurchaseModalError("");
    const err = await data.recordPurchase({ items, date: purchaseModalDate });
    if (err) {
      setPurchaseModalError(err);
      return;
    }
    setPurchaseModalOpen(false);
  };

  const handleRecordRefund = async (refund: {
    invoice: string;
    customerName: string;
    customerId: string;
    items: Array<{ section: string; product: string; qty: string | number; value: string | number; defective: boolean }>;
    totalRefund: number;
    reason: string;
  }) => {
    setRefundModalError("");
    const err = await data.recordRefund(refund);
    if (err) {
      setRefundModalError(err);
      return;
    }
    setRefundModalOpen(false);
  };

  const sidebarWidth = sidebarCollapsed ? 60 : 250;

  // Show the connecting gate until the first products snapshot arrives
  // (matches page.js's original `loading` state behavior).
  if (data.loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <LoadingIcon />
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Connecting to Firebase...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Ambient glows */}
      <div style={{ position: "fixed", top: "-200px", right: "-200px", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-300px", left: "-200px", width: "700px", height: "700px", background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Sidebar */}
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content */}
      <div style={{ marginLeft: `${sidebarWidth}px`, transition: "margin-left 0.25s ease", minHeight: "100vh" }}>
        {/* Top bar */}
        <header style={{
          padding: "16px 24px", borderBottom: "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 30,
          backdropFilter: "blur(20px)", background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.8)", display: "flex", padding: "4px",
              }}
            >
              <MenuIcon />
            </button>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
              {activePage === "transactions" ? "Sales" : activePage === "purchases" ? "Purchases" : activePage === "inventory" ? "Inventory" : activePage === "customers" ? "Customers" : activePage === "staff" ? "Staff" : activePage === "receivables" ? "Accounts Receivable" : activePage === "notifications" ? "Notifications" : "Pricing"}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-mono)" }}>
              {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </div>
            {/* User info + logout */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {authUser.photoURL && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={authUser.photoURL}
                  alt={authUser.displayName || ""}
                  style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)" }}
                />
              )}
              <button
                onClick={onLogout}
                style={{
                  padding: "5px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.2)",
                  cursor: "pointer", background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.7)", fontSize: "11px", fontWeight: 600,
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ padding: "20px 24px" }}>
          {activePage === "transactions" && (
            <TransactionsPage
              inventoryDate={data.inventoryDate}
              setInventoryDate={data.setInventoryDate}
              onNavigate={setActivePage}
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
          )}

          {activePage === "purchases" && (
            <PurchasesPage
              purchaseTransactions={data.purchaseTransactions}
              onOpenPurchaseModal={handleOpenPurchaseModal}
              onUpdatePurchase={data.updatePurchase}
              onDeletePurchase={data.deletePurchase}
            />
          )}

          {activePage === "inventory" && (
            <InventoryTabPage
              inventoryDate={data.inventoryDate}
              setInventoryDate={data.setInventoryDate}
              resolvedInventory={data.resolvedInventory}
              totalCylinderData={totalCylinderData}
              inventorySections={data.inventorySections}
              onInventoryChange={data.handleInventoryChange}
              onSaveSection={data.saveSection}
              onFixBeginning={data.handleFixBeginning}
              inventory={data.inventory}
              staff={data.staff}
            />
          )}

          {activePage === "products" && (
            <ProductsPage
              products={data.products}
              pricebooks={data.pricebooks}
              activePricebook={data.activePricebook}
              onCreatePricebook={data.createPricebook}
              onUpdatePricebook={data.updatePricebook}
              onActivatePricebook={data.activatePricebook}
              onDeletePricebook={data.deletePricebook}
              onAddProduct={data.addProduct}
              onUpdateProduct={data.updateProduct}
              onDeleteProduct={data.deleteProduct}
            />
          )}

          {activePage === "customers" && (
            <CustomersPage
              customers={data.customers}
              onAddCustomer={data.addCustomer}
              onUpdateCustomer={data.updateCustomer}
              onDeleteCustomer={data.deleteCustomer}
              onFetchCustomerTransactions={data.fetchCustomerTransactions}
            />
          )}

          {activePage === "receivables" && (
            <ReceivablesPage
              arTransactions={data.arTransactions}
              onMarkCollected={data.markArCollected}
              onUpdateSale={data.updateSale}
              onDeleteSale={data.deleteSale}
            />
          )}

          {activePage === "staff" && (
            <StaffPage
              staff={data.staff}
              onAddStaff={data.addStaff}
              onUpdateStaff={data.updateStaff}
              onDeleteStaff={data.deleteStaff}
            />
          )}

          {activePage === "notifications" && (
            <NotificationsPage
              recipients={data.notificationRecipients}
              onAddRecipient={data.addRecipient}
              onRemoveRecipient={data.removeRecipient}
            />
          )}

          {activePage === "contact" && (
            <ContactUsPage
              currentUserEmail={authUser?.email || ""}
              onSendSupportMessage={data.sendSupportMessage}
            />
          )}
        </main>
      </div>

      {/* ---- MODALS ---- */}
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
    </div>
  );
}
