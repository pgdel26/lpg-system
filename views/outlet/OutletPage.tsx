import { useMemo, useState } from "react";

import ConfirmModal from "../../components/ConfirmModal";
import SalesReportTab from "../transactions/SalesReportTab";
import DailySalesTab from "../transactions/DailySalesTab";
import InventoryPage from "../InventoryPage";
import TransferModal from "../../components/TransferModal";
import { DownloadIcon, PlusIcon } from "../../components/Icons";

import type { ExpenseSubmission } from "../../components/ExpenseModal";

import { exportOutletWorkbook } from "./outletExport";
import { today } from "../../lib/utils";
import { collectionBatches, collectionsOnDate, type CollectionBatch } from "../../lib/receivables";

import type {
  EditData, PendingDelete, DailyReportWithCash, RefundItemInput,
  UpdateSaleFn, UpdateSwapFn, UpdateRefundFn, UpdateExpenseFn,
} from "../transactions/transactionsTypes";

import type {
  SaleTransaction, Swap, Refund, Expense, Staff, Branch,
  InventoryState, InventoryCell,
} from "../../lib/types";
import type { InventorySection, PurchaseSection } from "../../lib/constants";
import type { RecordTransferInput } from "../../lib/hooks/usePurchasesData";

import styles from "./OutletPage.module.css";

interface TotalCylinderRow {
  product: string;
  beg: number;
  end: number;
}

interface OutletPageProps {
  inventoryDate: string;
  setInventoryDate: (v: string) => void;
  saleTransactions: SaleTransaction[];
  swaps: Swap[];
  refunds: Refund[];
  expenses: Expense[];
  staff: Staff[];
  dailyReport: DailyReportWithCash;
  onUpdateDailyStaff: (data: DailyReportWithCash) => Promise<void>;
  arTransactions: SaleTransaction[];
  branch: string;
  onOpenSaleModal: () => void;
  onOpenSwapModal: () => void;
  onOpenRefundModal: () => void;
  onOpenCollectionModal: () => void;
  /** Both take the whole batch, not just its id — the route page owns the edit
   *  modal and the void confirmation, and each needs the collection's current
   *  figures to prefill and to state what it is about to reverse. */
  onEditCollection: (batch: CollectionBatch) => void;
  onVoidCollection: (batch: CollectionBatch) => void;
  onUpdateSale: UpdateSaleFn;
  onUpdateSwap: UpdateSwapFn;
  onUpdateRefund: UpdateRefundFn;
  onDeleteSale: (id: string) => Promise<void>;
  onDeleteSwap: (id: string) => Promise<void>;
  onDeleteRefund: (id: string) => Promise<void>;
  onAddExpense: (input: ExpenseSubmission) => Promise<void>;
  onUpdateExpense: UpdateExpenseFn;
  onDeleteExpense: (id: string) => Promise<void>;

  // ---- Inventory tab ----
  branches: Branch[];
  purchaseSections: PurchaseSection[];
  onRecordTransfer: (input: RecordTransferInput) => Promise<string | null>;
  resolvedInventory: InventoryState;
  totalCylinderData: TotalCylinderRow[];
  inventorySections: InventorySection[];
  onInventoryChange: (sectionKey: string, product: string, field: keyof InventoryCell, value: number | string) => void;
  onSaveSection: (sectionKey: string) => void;
  onFixBeginning: () => void;
}

const subTabs = [
  { key: "report", label: "Sales Report" },
  { key: "sales", label: "Transactions" },
  { key: "inventory", label: "Inventory" },
];

export default function OutletPage({
  inventoryDate, setInventoryDate,
  saleTransactions, swaps, refunds,
  expenses,
  staff, dailyReport, onUpdateDailyStaff,
  arTransactions, branch,
  onOpenSaleModal, onOpenSwapModal, onOpenRefundModal, onOpenCollectionModal,
  onEditCollection, onVoidCollection,
  onUpdateSale, onUpdateSwap, onUpdateRefund,
  onDeleteSale, onDeleteSwap, onDeleteRefund,
  onAddExpense, onUpdateExpense, onDeleteExpense,
  branches, purchaseSections, onRecordTransfer,
  resolvedInventory, totalCylinderData, inventorySections,
  onInventoryChange, onSaveSection, onFixBeginning,
}: OutletPageProps) {
  const [subTab, setSubTab] = useState("report");
  // Inline-edit state is shared across the Sales Report tab (expenses) and the
  // Transactions tab (sales/swaps/refunds rows), so it lives in the parent.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const sorted = [...saleTransactions].sort((a, b) => {
    const invA = (a.invoice || "").toLowerCase();
    const invB = (b.invoice || "").toLowerCase();
    if (invA !== invB) return invA.localeCompare(invB);
    const tA = a.createdAt?.seconds || 0;
    const tB = b.createdAt?.seconds || 0;
    return tA - tB;
  });

  const swapTotal = swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const refundTotal = (refunds || []).reduce((sum, r) => sum + (r.totalRefund || 0), 0);

  // ---- A/R collections for this outlet, on this date ----
  // Scoped by the EVENT's branch, not the invoice's: a customer can owe at PILI
  // and pay at CADLAN, and the outlet that physically took the money is the one
  // that has to account for it. Same rule collectionEventsOnDate uses for the
  // Sales Report, so the two tabs can't disagree about whose day this is.
  const collections = useMemo(
    () => collectionBatches(arTransactions, { startDate: inventoryDate, endDate: inventoryDate, branch }),
    [arTransactions, inventoryDate, branch]
  );
  const collectionTotal = useMemo(
    () => collections.reduce((sum, b) => sum + b.amount, 0),
    [collections]
  );
  // Not derived by re-filtering `collections` on method: the Sales Report's
  // figure comes from collectionsOnDate, and deriving this one the same way is
  // what guarantees the panel's "of which cash" line equals the Collections row
  // the operator reconciles against.
  // Memoized because collectionsOnDate scans every AR doc's every event, and
  // arTransactions is the unbounded live list — without this it re-runs on each
  // OutletPage render, including every keystroke in the inline sale editor.
  const collectionCashTotal = useMemo(
    () => collectionsOnDate(arTransactions, inventoryDate, branch),
    [arTransactions, inventoryDate, branch]
  );

  // ---- Stock transfer ----
  // Lifted from the inventory sub-tab that used to own it: the button that opens
  // this modal now lives in the page header, and a header button can't open a
  // modal owned by a child that isn't mounted on the other two tabs.
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferModalDate, setTransferModalDate] = useState(today());
  const [transferModalError, setTransferModalError] = useState("");

  const fromBranch = branches.find((b) => b.id === branch);
  const destinationBranches = branches.filter((b) => b.id !== branch);

  // Current on-hand (END) per purchase-section+product at this outlet, for the
  // transfer modal's max-qty validation. Full Cylinder/Refill purchase sections
  // both feed the "full" inventory section's END (see purchaseSource in
  // buildInventorySections); single-price categories map to their own same-key
  // inventory section.
  const availableStock = useMemo(() => {
    const stock: Record<string, Record<string, number>> = {};
    for (const purchaseSection of purchaseSections) {
      const invSectionKey = (purchaseSection.key === "cylinderWithRefill" || purchaseSection.key === "refill")
        ? "full"
        : purchaseSection.key;
      const invSection = inventorySections.find((s) => s.key === invSectionKey);
      if (!invSection) continue;
      const products = purchaseSection.subgroups
        ? purchaseSection.subgroups.flatMap((g) => g.products)
        : (purchaseSection.products || []);
      const map: Record<string, number> = {};
      for (const product of products) {
        const row = resolvedInventory[invSectionKey]?.[product] || {};
        map[product] = invSection.calcEnd(row);
      }
      stock[purchaseSection.key] = map;
    }
    return stock;
  }, [purchaseSections, inventorySections, resolvedInventory]);

  const handleOpenTransferModal = () => {
    setTransferModalOpen(true);
    setTransferModalDate(today());
    setTransferModalError("");
  };

  const handleRecordTransfer = async (input: { toBranch: string; items: Array<{ section: string; product: string; qty: string | number }> }) => {
    setTransferModalError("");
    const err = await onRecordTransfer({ ...input, fromBranch: branch, date: transferModalDate });
    if (err) {
      setTransferModalError(err);
      return;
    }
    setTransferModalOpen(false);
  };

  // One workbook, three sheets — one per tab, all for the selected date. This
  // is the only export on the screen: the Inventory tab's separate range export
  // went with the date-range mode.
  const branchName = branches.find((b) => b.id === branch)?.name || branch;
  const handleExport = () => {
    exportOutletWorkbook({
      date: inventoryDate,
      branchName,
      salesReport: {
        date: inventoryDate,
        saleTransactions, swaps, refunds, expenses,
        staff, dailyReport, arTransactions, branch,
      },
      saleTransactions, swaps, refunds,
      resolvedInventory, totalCylinderData, inventorySections,
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
        deliveryCharge: t.deliveryCharge || 0,
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
      {/* One date filter and one Export for all three tabs. Both used to be
          duplicated inside each tab's own toolbar; the date was already shared
          state in AppDataProvider, so the controls were three views of one
          value. */}
      <div className={styles.outletHeader}>
        <div className={styles.dateGroup}>
          <span className={styles.dateLabel}>Date</span>
          <input
            type="date"
            value={inventoryDate}
            onChange={(e) => setInventoryDate(e.target.value)}
            className={styles.dateInput}
          />
          {inventoryDate !== today() && (
            <button onClick={() => setInventoryDate(today())} className={styles.todayButton}>
              Today
            </button>
          )}
        </div>

        {/* One joined button group rather than separate pills — the "Primary
            Horizontal" pattern: a single blue bar with hairline seams between
            segments, rounded only on the outer corners. Every action here is
            outlet-wide rather than tab-specific, which is what makes them one
            set. Order is deliberate: the three record actions, then the two
            corrections, then Export. */}
        <div className={styles.buttonGroup} role="group" aria-label="Outlet actions">
          <button onClick={() => onOpenSaleModal()} className={styles.groupButton}>
            <PlusIcon /> Add Sale
          </button>
          {/* Money coming in on an old invoice is part of the same day's
              takings, so it belongs on the day's own screen rather than only on
              Receivables. */}
          <button onClick={onOpenCollectionModal} className={styles.groupButton}>
            <PlusIcon /> Add AR Collection
          </button>
          <button onClick={onOpenRefundModal} className={styles.groupButton}>
            <PlusIcon /> Add Refund
          </button>
          <button
            onClick={onFixBeginning}
            title="Re-pull this date's beginning inventory from the previous day's audited count (or ending inventory where no audit was recorded)"
            className={styles.groupButton}
          >
            Fix Inventory Beginning
          </button>
          {/* Conditional, and the seam still lands right: the divider is a
              :not(:first-child) border, so it keys off actual DOM position
              rather than a hardcoded index. */}
          {destinationBranches.length > 0 && (
            <button
              onClick={handleOpenTransferModal}
              title="Move stock between outlets"
              className={styles.groupButton}
            >
              Transfer Stock
            </button>
          )}
          <button onClick={handleExport} className={styles.groupButton}>
            <DownloadIcon /> Export
          </button>
        </div>
      </div>

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
            saleTransactions={saleTransactions}
            swaps={swaps}
            refunds={refunds}
            expenses={expenses}
            staff={staff}
            dailyReport={dailyReport}
            arTransactions={arTransactions}
            branch={branch}
            onUpdateDailyStaff={onUpdateDailyStaff}
            onAddExpense={onAddExpense}
            onUpdateExpense={onUpdateExpense}
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
            sorted={sorted}
            swaps={swaps}
            refunds={refunds}
            swapTotal={swapTotal}
            refundTotal={refundTotal}
            inventoryDate={inventoryDate}
            onOpenSwapModal={onOpenSwapModal}
            onOpenCollectionModal={onOpenCollectionModal}
            collections={collections}
            collectionTotal={collectionTotal}
            collectionCashTotal={collectionCashTotal}
            branches={branches}
            onEditCollection={onEditCollection}
            onVoidCollection={onVoidCollection}
            editingId={editingId}
            editData={editData}
            setEditData={setEditData}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
            setPendingDelete={setPendingDelete}
          />
        )}

        {subTab === "inventory" && (
          <InventoryPage
            inventoryDate={inventoryDate}
            resolvedInventory={resolvedInventory}
            totalCylinderData={totalCylinderData}
            inventorySections={inventorySections}
            // InventoryPage types `field` as the wider `string`; our handler (from
            // the provider) narrows it to keyof InventoryCell. The fields
            // InventoryTable emits are always real cell keys, so widen here.
            onInventoryChange={(sectionKey, product, field, value) => onInventoryChange(sectionKey, product, field as keyof InventoryCell, value)}
            onSaveSection={onSaveSection}
          />
        )}
      </div>

      {transferModalOpen && fromBranch && (
        <TransferModal
          fromBranch={fromBranch}
          destinationBranches={destinationBranches}
          date={transferModalDate}
          setDate={setTransferModalDate}
          error={transferModalError}
          purchaseSections={purchaseSections}
          availableStock={availableStock}
          onClose={() => setTransferModalOpen(false)}
          onSubmit={handleRecordTransfer}
        />
      )}

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
