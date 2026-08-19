import { useRef } from "react";
import { DownloadIcon } from "../../components/Icons";
import { today } from "../../lib/utils";
import styles from "./InventoryControls.module.css";

interface InventoryControlsProps {
  inventoryDate: string;
  setInventoryDate: (v: string) => void;
  rangeMode: boolean;
  setRangeMode: (v: boolean) => void;
  rangeEndDate: string;
  setRangeEndDate: (v: string) => void;
  exportMenuOpen: boolean;
  setExportMenuOpen: (updater: (v: boolean) => boolean) => void;
  showAudit: boolean;
  setShowAudit: (updater: (v: boolean) => boolean) => void;
  showRangeView: boolean;
  onFixBeginning: () => void;
  onExportInventory: () => void;
  onExportDailyReports: () => void;
  showTransfer: boolean;
  onOpenTransfer: () => void;
}

export default function InventoryControls({
  inventoryDate, setInventoryDate,
  rangeMode, setRangeMode,
  rangeEndDate, setRangeEndDate,
  exportMenuOpen, setExportMenuOpen,
  showAudit, setShowAudit,
  showRangeView,
  onFixBeginning,
  onExportInventory,
  onExportDailyReports,
  showTransfer,
  onOpenTransfer,
}: InventoryControlsProps) {
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <div className={styles.bar}>
      <div className={styles.modeToggle}>
        {["Single Day", "Date Range"].map((label, i) => {
          const isRange = i === 1;
          const active = rangeMode === isRange;
          return (
            <button
              key={label}
              onClick={() => setRangeMode(isRange)}
              className={`${styles.modeButton} ${i === 0 ? styles.modeButtonLeft : styles.modeButtonRight} ${active ? styles.modeButtonActive : ""}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <input
        type="date"
        value={inventoryDate}
        onChange={(e) => setInventoryDate(e.target.value)}
        className={styles.dateInput}
      />

      {!rangeMode && inventoryDate !== today() && (
        <button
          onClick={() => setInventoryDate(today())}
          className={styles.todayButton}
        >
          Go to Today
        </button>
      )}

      {rangeMode && (
        <>
          <span className={styles.toLabel}>to</span>
          <input
            type="date"
            value={rangeEndDate}
            min={inventoryDate}
            onChange={(e) => setRangeEndDate(e.target.value)}
            className={styles.dateInput}
          />
        </>
      )}

      <div className={styles.actions}>
        {!rangeMode && (
          <button
            onClick={onFixBeginning}
            title="Re-pull this date's beginning inventory from the previous day's audited count (or ending inventory where no audit was recorded)"
            className={styles.actionButton}
          >
            Fix Beginning
          </button>
        )}
        {showTransfer && (
          <button
            onClick={onOpenTransfer}
            title="Move stock between outlets"
            className={styles.actionButton}
          >
            Transfer Stock
          </button>
        )}
        <div className={styles.exportWrapper}>
          <button
            ref={exportBtnRef}
            onClick={() => {
              if (showRangeView) setExportMenuOpen((v) => !v);
              else onExportInventory();
            }}
            className={styles.exportButton}
          >
            <DownloadIcon /> Export
          </button>
          {exportMenuOpen && showRangeView && (
            <>
              <div
                className={styles.exportBackdrop}
                onClick={() => setExportMenuOpen(() => false)}
              />
              <div className={styles.exportMenu}>
                <button
                  onClick={() => { onExportInventory(); setExportMenuOpen(() => false); }}
                  className={styles.exportMenuItem}
                >
                  Consolidated Report
                </button>
                <button
                  onClick={() => { onExportDailyReports(); setExportMenuOpen(() => false); }}
                  className={styles.exportMenuItem}
                >
                  Daily Reports (per day)
                </button>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setShowAudit((v) => !v)}
          className={`${styles.auditButton} ${showAudit ? styles.auditButtonActive : ""}`}
        >
          {showAudit ? "Hide" : "Show"} Audit
        </button>
      </div>
    </div>
  );
}
