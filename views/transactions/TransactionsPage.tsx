import { useState } from "react";

import ConfirmModal from "../../components/ConfirmModal";
import SalesReportTab from "./SalesReportTab";
import DailySalesTab from "./DailySalesTab";
import RefundsPage from "./RefundsPage";

import { exportFullReport } from "./transactionsExport";
import { titleCaseCategory } from "../../lib/utils";

import type {
  EditData, PendingDelete, DailyReportWithCash, RefundItemInput,
  UpdateSaleFn, UpdateSwapFn, UpdateRefundFn, UpdateExpenseFn,
} from "./transactionsTypes";

import type { SaleTransaction, Swap, Refund, Expense, Staff } from "../../lib/types";

import styles from "./TransactionsPage.module.css";

interface TransactionsPageProps {
  inventoryDate: string;
  setInventoryDate: (v: string) => void;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  expenses: Expense[];
  staff: Staff[];
  dailyReport: DailyReportWithCash;
  onUpdateDailyStaff: (data: DailyReportWithCash) => Promise<void>;
  allRefunds: Refund[];
  arTransactions: SaleTransaction[];
  onOpenSaleModal: () => void;
  onOpenSwapModal: () => void;
  onOpenRefundModal: () => void;
  onUpdateSale: UpdateSaleFn;
  onUpdateSwap: UpdateSwapFn;
  onUpdateRefund: UpdateRefundFn;
  onDeleteSale: (id: string) => Promise<void>;
  onDeleteSwap: (id: string) => Promise<void>;
  onDeleteRefund: (id: string) => Promise<void>;
  onAddExpense: (description: string, amount: string | number) => Promise<void>;
  onUpdateExpense: UpdateExpenseFn;
  onDeleteExpense: (id: string) => Promise<void>;
  onViewInventory: () => void;
}

const subTabs = [
  { key: "report", label: "Sales Report" },
  { key: "sales", label: "Daily Sales" },
  { key: "refunds", label: "Refunds / Returns" },
];

export default function TransactionsPage({
  inventoryDate, setInventoryDate,
  saleTransactions, swaps, refunds,
  expenses,
  staff, dailyReport, onUpdateDailyStaff,
  allRefunds, arTransactions,
  onOpenSaleModal, onOpenSwapModal, onOpenRefundModal,
  onUpdateSale, onUpdateSwap, onUpdateRefund,
  onDeleteSale, onDeleteSwap, onDeleteRefund,
  onAddExpense, onUpdateExpense, onDeleteExpense,
  onViewInventory,
}: TransactionsPageProps) {
  const [subTab, setSubTab] = useState("report");
  // Inline-edit state is shared across the Sales Report tab (expenses) and the
  // Daily Sales tab (sales/swaps/refunds rows), so it lives in the parent.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const saleTypeLabel = (section: string) => {
    if (section === "cylinderWithRefill") return "Full Cylinder";
    if (section === "refill") return "Refill";
    // Single-price categories use the category key as their section.
    return titleCaseCategory(section);
  };

  const sorted = [...saleTransactions].sort((a, b) => {
    const invA = (a.invoice || "").toLowerCase();
    const invB = (b.invoice || "").toLowerCase();
    if (invA !== invB) return invA.localeCompare(invB);
    const tA = a.createdAt?.seconds || 0;
    const tB = b.createdAt?.seconds || 0;
    return tA - tB;
  });

  const totalRevenue = sorted.reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
  const swapTotal = swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const refundTotal = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const grandTotal = totalRevenue + swapTotal - refundTotal;

  const handleExportFullReport = () => {
    exportFullReport({
      date: inventoryDate,
      saleTransactions, swaps, refunds, expenses,
      staff, dailyReport, arTransactions,
    });
  };

  const startEdit = (type: "sale" | "swap" | "refund", item: SaleTransaction | Swap | Refund) => {
    setEditingId(`${type}_${item.id}`);
    if (type === "sale") {
      const t = item as SaleTransaction;
      setEditData({
        type: "sale",
        id: t.id,
        invoice: t.invoice || "",
        customerName: t.customerName || "",
        discount: t.discount || 0,
        totalAmount: t.totalAmount || t.finalPrice || 0,
        paymentType: t.paymentType || "cash",
        srp: t.srp || 0,
        quantity: t.quantity || 1,
      });
    } else if (type === "swap") {
      const s = item as Swap;
      setEditData({
        type: "swap",
        id: s.id,
        productFrom: s.productFrom || "",
        productTo: s.productTo || "",
        price: s.price || 0,
      });
    } else if (type === "refund") {
      const r = item as Refund;
      setEditData({
        type: "refund",
        id: r.id,
        invoice: r.invoice || "",
        customerName: r.customerName || "",
        reason: r.reason || "",
        totalRefund: r.totalRefund || 0,
        items: (r.items || []).map((it) => ({ ...it })),
      });
    }
  };

  const cancelEdit = () => { setEditingId(null); setEditData(null); };

  const saveEdit = async () => {
    if (!editData) return;
    if (editData.type === "sale") {
      await onUpdateSale(editData.id, editData);
    } else if (editData.type === "swap") {
      await onUpdateSwap(editData.id, editData);
    } else if (editData.type === "refund") {
      const totalRefund = editData.items.reduce((sum, it) => sum + (parseFloat(String(it.value)) || 0), 0);
      await onUpdateRefund(editData.id, {
        invoice: editData.invoice,
        customerName: editData.customerName,
        reason: editData.reason,
        totalRefund,
        items: editData.items as unknown as RefundItemInput[],
      });
    }
    setEditingId(null);
    setEditData(null);
  };

  return (
    <div className="animate-fade">
      {/* Sub-tabs */}
      <div className={styles.subTabs}>
        {subTabs.map((tab) => {
          const isActive = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`${styles.subTab} ${isActive ? styles.subTabActive : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className={styles.card}>
        {subTab === "report" && (
          <SalesReportTab
            inventoryDate={inventoryDate}
            setInventoryDate={setInventoryDate}
            saleTransactions={saleTransactions}
            swaps={swaps}
            refunds={refunds}
            expenses={expenses}
            staff={staff}
            dailyReport={dailyReport}
            arTransactions={arTransactions}
            onUpdateDailyStaff={onUpdateDailyStaff}
            onAddExpense={onAddExpense}
            onUpdateExpense={onUpdateExpense}
            onExportFullReport={handleExportFullReport}
            editingId={editingId}
            editData={editData}
            setEditData={setEditData}
            setEditingId={setEditingId}
            cancelEdit={cancelEdit}
            setPendingDelete={setPendingDelete}
          />
        )}

        {subTab === "sales" && (
          <DailySalesTab
            inventoryDate={inventoryDate}
            setInventoryDate={setInventoryDate}
            sorted={sorted}
            swaps={swaps}
            refunds={refunds}
            swapTotal={swapTotal}
            refundTotal={refundTotal}
            grandTotal={grandTotal}
            saleTypeLabel={saleTypeLabel}
            onOpenSaleModal={onOpenSaleModal}
            onOpenSwapModal={onOpenSwapModal}
            onOpenRefundModal={onOpenRefundModal}
            onViewInventory={onViewInventory}
            onExportFullReport={handleExportFullReport}
            editingId={editingId}
            editData={editData}
            setEditData={setEditData}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
            setPendingDelete={setPendingDelete}
          />
        )}

        {subTab === "refunds" && (
          <RefundsPage
            allRefunds={allRefunds}
            onUpdateRefund={onUpdateRefund}
            onDeleteRefund={onDeleteRefund}
          />
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title={`Delete ${pendingDelete.type}`}
          message={`Are you sure you want to delete this ${pendingDelete.type}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => {
            if (pendingDelete.type === "sale") onDeleteSale(pendingDelete.id);
            else if (pendingDelete.type === "swap") onDeleteSwap(pendingDelete.id);
            else if (pendingDelete.type === "refund") onDeleteRefund(pendingDelete.id);
            else if (pendingDelete.type === "expense") onDeleteExpense(pendingDelete.id);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
