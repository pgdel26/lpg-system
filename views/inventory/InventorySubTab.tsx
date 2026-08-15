import { useState, useEffect, useMemo } from "react";
import InventoryPage from "../InventoryPage";
import InventoryControls from "./InventoryControls";
import RangeView from "./RangeView";
import TransferModal from "../../components/TransferModal";
import { db } from "../../lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { today } from "../../lib/utils";
import type { InventoryState, InventoryCell, Branch } from "../../lib/types";
import type { InventorySection, PurchaseSection } from "../../lib/constants";
import type { RecordTransferInput } from "../../lib/hooks/usePurchasesData";
import { getDatesInRange, exportInventory, exportDailyReports } from "./inventoryExport";
import styles from "./InventorySubTab.module.css";

interface TotalCylinderRow {
  product: string;
  beg: number;
  end: number;
}

interface RangeTxData {
  date: string;
  saleCounts: Record<string, Record<string, number>>;
  purchaseCounts: Record<string, Record<string, number>>;
  swapToCounts: Record<string, number>;
  swapFromCounts: Record<string, number>;
  refundCounts: Record<string, Record<string, number>>;
  refundNonDefectiveCounts: Record<string, Record<string, number>>;
}

interface InventorySubTabProps {
  branch: string;
  branches: Branch[];
  purchaseSections: PurchaseSection[];
  onRecordTransfer: (input: RecordTransferInput) => Promise<string | null>;
  inventoryDate: string;
  setInventoryDate: (v: string) => void;
  resolvedInventory: InventoryState;
  totalCylinderData: TotalCylinderRow[];
  inventorySections: InventorySection[];
  onInventoryChange: (sectionKey: string, product: string, field: keyof InventoryCell, value: number | string) => void;
  onSaveSection: (sectionKey: string) => void;
  onFixBeginning: () => void;
  inventory: unknown;
}

export default function InventorySubTab({
  branch, branches, purchaseSections, onRecordTransfer,
  inventoryDate, setInventoryDate,
  resolvedInventory, totalCylinderData, inventorySections,
  onInventoryChange, onSaveSection, onFixBeginning,
  inventory,
}: InventorySubTabProps) {
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeEndDate, setRangeEndDate] = useState("");
  const [rangeInventory, setRangeInventory] = useState<InventoryState | null>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [showAudit, setShowAudit] = useState(true);
  const [rangeDailyData, setRangeDailyData] = useState<Record<string, InventoryState> | null>(null);
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

  // ---- Range fetch ----
  useEffect(() => {
    let cancelled = false;
    const fetchRange = async () => {
      if (!rangeMode || !rangeEndDate || rangeEndDate <= inventoryDate) {
        setRangeInventory(null);
        setRangeDailyData(null);
        return;
      }
      setRangeLoading(true);
      const dates = getDatesInRange(inventoryDate, rangeEndDate);
      const sectionKeys = inventorySections.map((s) => s.key);
      const cylinderProducts = inventorySections.find((s) => s.key === "full")?.products || [];

      // Fetch dailyInventory docs (for beg/aud) AND live transactions per date in parallel
      const [invResults, txResults] = await Promise.all([
        Promise.all(dates.map(async (date) => {
          const sectData: Record<string, Record<string, InventoryCell>> = {};
          await Promise.all(sectionKeys.map(async (sectionKey) => {
            const snap = await getDoc(doc(db, "dailyInventory", `${date}_${branch}_${sectionKey}`));
            sectData[sectionKey] = snap.exists() ? (snap.data().items || {}) : {};
          }));
          return { date, sectData };
        })),
        Promise.all(dates.map(async (date): Promise<RangeTxData> => {
          // Purchases isn't a separate screen per outlet, but each purchase still
          // carries a branch tag so this outlet's range view only counts its own.
          const [salesSnap, purchasesSnap, swapsSnap, refundsSnap] = await Promise.all([
            getDocs(query(collection(db, "saleTransactions"), where("date", "==", date), where("branch", "==", branch))),
            getDocs(query(collection(db, "purchases"), where("date", "==", date), where("branch", "==", branch))),
            getDocs(query(collection(db, "swaps"), where("date", "==", date), where("branch", "==", branch))),
            getDocs(query(collection(db, "refunds"), where("date", "==", date), where("branch", "==", branch))),
          ]);

          const saleCounts: Record<string, Record<string, number>> = {};
          salesSnap.forEach((d) => {
            const t = d.data();
            if (!saleCounts[t.saleSection]) saleCounts[t.saleSection] = {};
            saleCounts[t.saleSection][t.product] = (saleCounts[t.saleSection][t.product] || 0) + (t.quantity || 1);
          });

          const purchaseCounts: Record<string, Record<string, number>> = {};
          purchasesSnap.forEach((d) => {
            const t = d.data();
            if (!purchaseCounts[t.purchaseSection]) purchaseCounts[t.purchaseSection] = {};
            purchaseCounts[t.purchaseSection][t.product] = (purchaseCounts[t.purchaseSection][t.product] || 0) + (t.quantity || 1);
          });

          const swapToCounts: Record<string, number> = {}, swapFromCounts: Record<string, number> = {};
          swapsSnap.forEach((d) => {
            const t = d.data();
            swapToCounts[t.productTo] = (swapToCounts[t.productTo] || 0) + 1;
            if (cylinderProducts.includes(t.productFrom)) {
              swapFromCounts[t.productFrom] = (swapFromCounts[t.productFrom] || 0) + 1;
            }
          });

          const refundCounts: Record<string, Record<string, number>> = {}, refundNonDefectiveCounts: Record<string, Record<string, number>> = {};
          refundsSnap.forEach((d) => {
            (d.data().items || []).forEach((item: { section: string; product: string; qty: number | string; defective?: boolean }) => {
              const { section: sec, product: prod, qty, defective } = item;
              const q = parseInt(String(qty)) || 1;
              if (!refundCounts[sec]) refundCounts[sec] = {};
              refundCounts[sec][prod] = (refundCounts[sec][prod] || 0) + q;
              if (!defective) {
                if (!refundNonDefectiveCounts[sec]) refundNonDefectiveCounts[sec] = {};
                refundNonDefectiveCounts[sec][prod] = (refundNonDefectiveCounts[sec][prod] || 0) + q;
              }
            });
          });

          return { date, saleCounts, purchaseCounts, swapToCounts, swapFromCounts, refundCounts, refundNonDefectiveCounts };
        })),
      ]);

      if (cancelled) return;

      const invData: Record<string, Record<string, Record<string, InventoryCell>>> = {};
      invResults.forEach(({ date, sectData }) => { invData[date] = sectData; });
      const txData: Record<string, RangeTxData> = {};
      txResults.forEach((tx) => { txData[tx.date] = tx; });

      // Compute fresh resolved inventory per day (mirrors resolvedInventory logic in page.js)
      const perDay: Record<string, InventoryState> = {};
      for (const date of dates) {
        const tx = txData[date];
        const inv = invData[date];
        const resolved: InventoryState = {};

        // Pass 1: transactions → field values
        for (const section of inventorySections) {
          resolved[section.key] = {};
          for (const product of section.products) {
            const row: Record<string, unknown> = { beg: (inv[section.key]?.[product] || {}).beg || 0 };
            for (const col of section.columns) {
              if (col.salesSource) row[col.field] = (tx.saleCounts[col.salesSource] || {})[product] || 0;
              if (col.purchaseSource) {
                const sources = Array.isArray(col.purchaseSource) ? col.purchaseSource : [col.purchaseSource];
                row[col.field] = sources.reduce((sum: number, src: string) => sum + ((tx.purchaseCounts[src] || {})[product] || 0), 0);
              }
              if (col.swapSource === "to") row[col.field] = tx.swapToCounts[product] || 0;
              if (col.swapSource === "from") row[col.field] = tx.swapFromCounts[product] || 0;
              if (col.refundSource) {
                const src = col.refundSource;
                const counts = src.defective === false ? tx.refundNonDefectiveCounts : tx.refundCounts;
                row[col.field] = (counts[src.section] || {})[product] || 0;
              }
            }
            resolved[section.key][product] = row as InventoryCell;
          }
        }
        // Pass 2: cross-section sources
        for (const section of inventorySections) {
          for (const product of section.products) {
            for (const col of section.columns) {
              if (col.source) {
                (resolved[section.key][product] as Record<string, unknown>)[col.field] =
                  (resolved[col.source.section]?.[product] as Record<string, unknown> | undefined)?.[col.source.field] || 0;
              }
            }
          }
        }
        perDay[date] = resolved;
      }

      setRangeDailyData(perDay);

      // Consolidate: beg from first day, activity fields summed
      const consolidated: InventoryState = {};
      for (const section of inventorySections) {
        consolidated[section.key] = {};
        for (const product of section.products) {
          const row: Record<string, unknown> = { beg: (perDay[dates[0]][section.key][product] as Record<string, unknown>)?.beg || 0 };
          for (const col of section.columns) {
            if (["beg", "end", "aud", "var"].includes(col.field)) continue;
            row[col.field] = dates.reduce((sum: number, date) => sum + (((perDay[date][section.key][product] || {}) as Record<string, unknown>)[col.field] as number || 0), 0);
          }
          consolidated[section.key][product] = row as InventoryCell;
        }
      }

      setRangeInventory(consolidated);
      setRangeLoading(false);
    };
    fetchRange().catch((err) => {
      console.error("Range fetch error:", err);
      setRangeLoading(false);
    });
    return () => { cancelled = true; };
  }, [rangeMode, inventoryDate, rangeEndDate, inventorySections, branch]);

  // ---- Range total cylinder ----
  const rangeTotalCylinderData = useMemo(() => {
    if (!rangeInventory) return [];
    const fullSection = inventorySections.find((s) => s.key === "full");
    const emptySection = inventorySections.find((s) => s.key === "empty");
    if (!fullSection || !emptySection) return [];
    return fullSection.products.map((product) => {
      const fullRow = rangeInventory.full?.[product] || {};
      const emptyRow = rangeInventory.empty?.[product] || {};
      return {
        product,
        beg: ((fullRow.beg as number) || 0) + ((emptyRow.beg as number) || 0),
        end: fullSection.calcEnd(fullRow) + emptySection.calcEnd(emptyRow),
      };
    });
  }, [rangeInventory, inventorySections]);

  const rangeValid = rangeMode && !!rangeEndDate && rangeEndDate > inventoryDate;
  const showRangeView = !!(rangeValid && rangeInventory && !rangeLoading);

  return (
    <>
      <InventoryControls
        inventoryDate={inventoryDate}
        setInventoryDate={setInventoryDate}
        rangeMode={rangeMode}
        setRangeMode={setRangeMode}
        rangeEndDate={rangeEndDate}
        setRangeEndDate={setRangeEndDate}
        exportMenuOpen={exportMenuOpen}
        setExportMenuOpen={setExportMenuOpen}
        showAudit={showAudit}
        setShowAudit={setShowAudit}
        showRangeView={showRangeView}
        onFixBeginning={onFixBeginning}
        onExportInventory={() => exportInventory({ resolvedInventory, totalCylinderData, inventorySections, inventoryDate, rangeMode, rangeEndDate })}
        onExportDailyReports={() => exportDailyReports({ rangeDailyData, inventorySections, inventoryDate, rangeEndDate })}
        showTransfer={destinationBranches.length > 0}
        onOpenTransfer={handleOpenTransferModal}
      />

      {/* Single day view */}
      {!rangeMode && (
        <InventoryPage
          inventoryDate={inventoryDate}
          resolvedInventory={resolvedInventory}
          totalCylinderData={totalCylinderData}
          inventorySections={inventorySections}
          // InventoryPage's prop types `field` as the wider `string`; our handler
          // (from the provider) narrows it to keyof InventoryCell. The fields
          // InventoryTable emits are always real cell keys, so widen at the boundary.
          onInventoryChange={(sectionKey, product, field, value) => onInventoryChange(sectionKey, product, field as keyof InventoryCell, value)}
          onSaveSection={onSaveSection}
          inventory={inventory}
          showAudit={showAudit}
        />
      )}

      {/* Range mode: waiting for end date */}
      {rangeMode && !rangeEndDate && (
        <p className={styles.hint}>
          Select an end date to view consolidated inventory for the period.
        </p>
      )}

      {/* Range mode: invalid date range */}
      {rangeMode && rangeEndDate && rangeEndDate <= inventoryDate && (
        <p className={styles.error}>
          End date must be after start date.
        </p>
      )}

      {/* Range mode: loading */}
      {rangeValid && rangeLoading && (
        <div className={styles.loading}>
          Loading range data...
        </div>
      )}

      {/* Range mode: consolidated view */}
      {showRangeView && rangeInventory && (
        <RangeView
          inventoryDate={inventoryDate}
          rangeEndDate={rangeEndDate}
          rangeInventory={rangeInventory}
          inventorySections={inventorySections}
          rangeTotalCylinderData={rangeTotalCylinderData}
        />
      )}

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
    </>
  );
}
