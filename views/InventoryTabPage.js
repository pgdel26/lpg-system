import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx-js-style";
import InventoryPage from "./InventoryPage";
import AuditPage from "./AuditPage";
import InventoryTable from "../components/InventoryTable";
import { DownloadIcon, PlusIcon, XIcon } from "../components/Icons";
import { db } from "../lib/firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { today } from "../lib/utils";

function getDatesInRange(start, end) {
  const dates = [];
  const current = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (current <= last) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export default function InventoryTabPage({
  inventoryDate, setInventoryDate,
  resolvedInventory, totalCylinderData, inventorySections,
  onInventoryChange, onSaveSection,
  inventory, staff,
}) {
  const [subTab, setSubTab] = useState("inventory");
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeEndDate, setRangeEndDate] = useState("");
  const [rangeInventory, setRangeInventory] = useState(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditSelected, setAuditSelected] = useState(new Set());
  const [auditSearch, setAuditSearch] = useState("");
  const [auditDropdownOpen, setAuditDropdownOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [rangeDailyData, setRangeDailyData] = useState(null);
  const exportBtnRef = useRef(null);

  const subTabs = [
    { key: "inventory", label: "Inventory" },
    { key: "audit", label: "Audited Records" },
  ];

  // ---- Export ----
  const getMergedRow = (section, product) => {
    const sectionData = resolvedInventory[section.key] || {};
    const row = { ...(sectionData[product] || {}) };
    for (const col of section.columns) {
      if (col.source) {
        const srcData = resolvedInventory[col.source.section] || {};
        row[col.field] = (srcData[product] || {})[col.source.field] || 0;
      }
      if (col.salesSource || col.purchaseSource || col.swapSource || col.refundSource) {
        row[col.field] = sectionData[product]?.[col.field] || 0;
      }
    }
    return row;
  };

  const exportInventory = () => {
    const boldSz = (sz) => ({ font: { bold: true, sz } });
    const sectionHeader = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
    const tableHeader = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
    const subgroupHeader = { font: { bold: true, sz: 10, color: { rgb: "64748B" } }, fill: { fgColor: { rgb: "F1F5F9" } } };
    const totalRowStyle = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };

    const sectionRows = [];
    const tableHeaderRows = [];
    const subgroupRows = [];
    const totalRows = [];

    const data = [];
    const merges = [];
    let r;

    data.push(["DAILY INVENTORY REPORT"]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
    data.push([rangeMode && rangeEndDate ? `Date: ${inventoryDate} to ${rangeEndDate}` : `Date: ${inventoryDate}`]);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
    data.push([]);

    for (const section of inventorySections) {
      r = data.length;
      data.push([section.label.toUpperCase()]);
      sectionRows.push(r);
      merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });

      r = data.length;
      data.push(["Product", ...section.columns.map((c) => c.label)]);
      tableHeaderRows.push(r);

      const renderProducts = (products) => {
        for (const product of products) {
          const row = getMergedRow(section, product);
          const endVal = section.calcEnd ? section.calcEnd(row) : (row.end || 0);
          const varVal = (row.aud != null && row.aud !== "")
            ? (parseFloat(row.aud) || 0) - endVal
            : null;

          const cells = [product];
          for (const col of section.columns) {
            if (col.field === "end") cells.push(endVal);
            else if (col.field === "var") cells.push(varVal != null ? varVal : "");
            else {
              const v = row[col.field];
              cells.push(v != null && v !== "" ? v : 0);
            }
          }
          data.push(cells);
        }
      };

      if (section.subgroups && section.subgroups.length > 0) {
        for (const sg of section.subgroups) {
          r = data.length;
          data.push([sg.label]);
          subgroupRows.push(r);
          merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });
          renderProducts(sg.products);
        }
      } else {
        renderProducts(section.products);
      }
      data.push([]);
    }

    r = data.length;
    data.push(["TOTAL CYLINDER (Full + Empty)"]);
    sectionRows.push(r);
    merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
    r = data.length;
    data.push(["Product", "BEG", "END", "DIFF"]);
    tableHeaderRows.push(r);
    for (const row of totalCylinderData) {
      data.push([row.product, row.beg, row.end, row.var != null ? row.var : ""]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws["!merges"] = merges;
    const colWidths = [{ wch: 20 }];
    for (let i = 0; i < 9; i++) colWidths.push({ wch: 10 });
    ws["!cols"] = colWidths;

    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        if (!ws[addr]) continue;
        if (R === 0) ws[addr].s = boldSz(16);
        else if (R === 1) ws[addr].s = boldSz(12);
        else if (sectionRows.includes(R)) ws[addr].s = sectionHeader;
        else if (tableHeaderRows.includes(R)) ws[addr].s = tableHeader;
        else if (subgroupRows.includes(R)) ws[addr].s = subgroupHeader;
        else if (totalRows.includes(R)) ws[addr].s = { ...totalRowStyle };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, rangeMode && rangeEndDate ? `Inventory_${inventoryDate}_to_${rangeEndDate}.xlsx` : `Inventory_${inventoryDate}.xlsx`);
  };

  // ---- Daily range export ----
  const exportDailyReports = () => {
    if (!rangeDailyData) return;
    const boldSz = (sz) => ({ font: { bold: true, sz } });
    const sectionHeader = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
    const tableHeader = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
    const subgroupHeader = { font: { bold: true, sz: 10, color: { rgb: "64748B" } }, fill: { fgColor: { rgb: "F1F5F9" } } };

    const wb = XLSX.utils.book_new();
    const dates = getDatesInRange(inventoryDate, rangeEndDate);

    for (const date of dates) {
      const dayData = rangeDailyData[date] || {};
      const sectionRows = [], tableHeaderRows = [], subgroupRows = [];
      const data = [], merges = [];
      let r;

      data.push(["DAILY INVENTORY REPORT"]);
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } });
      data.push([`Date: ${date}`]);
      merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 9 } });
      data.push([]);

      for (const section of inventorySections) {
        r = data.length;
        data.push([section.label.toUpperCase()]);
        sectionRows.push(r);
        merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });

        r = data.length;
        data.push(["Product", ...section.columns.map((c) => c.label)]);
        tableHeaderRows.push(r);

        const sectionData = dayData[section.key] || {};

        const renderProducts = (products) => {
          for (const product of products) {
            const row = sectionData[product] || {};
            const endVal = section.calcEnd ? section.calcEnd(row) : (row.end || 0);
            const varVal = (row.aud != null && row.aud !== "")
              ? (parseFloat(row.aud) || 0) - endVal : null;

            const cells = [product];
            for (const col of section.columns) {
              if (col.field === "end") cells.push(endVal);
              else if (col.field === "var") cells.push(varVal != null ? varVal : "");
              else {
                const v = row[col.field];
                cells.push(v != null && v !== "" ? v : 0);
              }
            }
            data.push(cells);
          }
        };

        if (section.subgroups && section.subgroups.length > 0) {
          for (const sg of section.subgroups) {
            r = data.length;
            data.push([sg.label]);
            subgroupRows.push(r);
            merges.push({ s: { r, c: 0 }, e: { r, c: section.columns.length } });
            renderProducts(sg.products);
          }
        } else {
          renderProducts(section.products);
        }
        data.push([]);
      }

      // Total cylinder summary
      const fullSection = inventorySections.find((s) => s.key === "full");
      const emptySection = inventorySections.find((s) => s.key === "empty");
      if (fullSection && emptySection) {
        r = data.length;
        data.push(["TOTAL CYLINDER (Full + Empty)"]);
        sectionRows.push(r);
        merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
        r = data.length;
        data.push(["Product", "BEG", "END", "DIFF"]);
        tableHeaderRows.push(r);
        for (const product of fullSection.products) {
          const fr = (dayData.full || {})[product] || {};
          const er = (dayData.empty || {})[product] || {};
          const beg = (fr.beg || 0) + (er.beg || 0);
          const end = fullSection.calcEnd(fr) + emptySection.calcEnd(er);
          const fAud = fr.aud != null && fr.aud !== "" ? parseFloat(fr.aud) || 0 : null;
          const eAud = er.aud != null && er.aud !== "" ? parseFloat(er.aud) || 0 : null;
          const varVal = (fAud != null && eAud != null) ? (fAud + eAud) - end : null;
          data.push([product, beg, end, varVal != null ? varVal : ""]);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!merges"] = merges;
      const colWidths = [{ wch: 20 }];
      for (let i = 0; i < 9; i++) colWidths.push({ wch: 10 });
      ws["!cols"] = colWidths;

      const range = XLSX.utils.decode_range(ws["!ref"]);
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[addr]) continue;
          if (R === 0) ws[addr].s = boldSz(16);
          else if (R === 1) ws[addr].s = boldSz(12);
          else if (sectionRows.includes(R)) ws[addr].s = sectionHeader;
          else if (tableHeaderRows.includes(R)) ws[addr].s = tableHeader;
          else if (subgroupRows.includes(R)) ws[addr].s = subgroupHeader;
        }
      }

      XLSX.utils.book_append_sheet(wb, ws, date);
    }

    XLSX.writeFile(wb, `Inventory_${inventoryDate}_to_${rangeEndDate}.xlsx`);
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
          const sectData = {};
          await Promise.all(sectionKeys.map(async (sectionKey) => {
            const snap = await getDoc(doc(db, "dailyInventory", `${date}_${sectionKey}`));
            sectData[sectionKey] = snap.exists() ? (snap.data().items || {}) : {};
          }));
          return { date, sectData };
        })),
        Promise.all(dates.map(async (date) => {
          const [salesSnap, purchasesSnap, swapsSnap, refundsSnap] = await Promise.all([
            getDocs(query(collection(db, "saleTransactions"), where("date", "==", date))),
            getDocs(query(collection(db, "purchases"), where("date", "==", date))),
            getDocs(query(collection(db, "swaps"), where("date", "==", date))),
            getDocs(query(collection(db, "refunds"), where("date", "==", date))),
          ]);

          const saleCounts = {};
          salesSnap.forEach((d) => {
            const t = d.data();
            if (!saleCounts[t.saleSection]) saleCounts[t.saleSection] = {};
            saleCounts[t.saleSection][t.product] = (saleCounts[t.saleSection][t.product] || 0) + (t.quantity || 1);
          });

          const purchaseCounts = {};
          purchasesSnap.forEach((d) => {
            const t = d.data();
            if (!purchaseCounts[t.purchaseSection]) purchaseCounts[t.purchaseSection] = {};
            purchaseCounts[t.purchaseSection][t.product] = (purchaseCounts[t.purchaseSection][t.product] || 0) + (t.quantity || 1);
          });

          const swapToCounts = {}, swapFromCounts = {};
          swapsSnap.forEach((d) => {
            const t = d.data();
            swapToCounts[t.productTo] = (swapToCounts[t.productTo] || 0) + 1;
            if (cylinderProducts.includes(t.productFrom)) {
              swapFromCounts[t.productFrom] = (swapFromCounts[t.productFrom] || 0) + 1;
            }
          });

          const refundCounts = {}, refundNonDefectiveCounts = {};
          refundsSnap.forEach((d) => {
            (d.data().items || []).forEach((item) => {
              const { section: sec, product: prod, qty, defective } = item;
              const q = parseInt(qty) || 1;
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

      const invData = {};
      invResults.forEach(({ date, sectData }) => { invData[date] = sectData; });
      const txData = {};
      txResults.forEach((tx) => { txData[tx.date] = tx; });

      // Compute fresh resolved inventory per day (mirrors resolvedInventory logic in page.js)
      const perDay = {};
      for (const date of dates) {
        const tx = txData[date];
        const inv = invData[date];
        const resolved = {};

        // Pass 1: transactions → field values
        for (const section of inventorySections) {
          resolved[section.key] = {};
          for (const product of section.products) {
            const row = { beg: (inv[section.key]?.[product] || {}).beg || 0 };
            for (const col of section.columns) {
              if (col.salesSource) row[col.field] = (tx.saleCounts[col.salesSource] || {})[product] || 0;
              if (col.purchaseSource) {
                const sources = Array.isArray(col.purchaseSource) ? col.purchaseSource : [col.purchaseSource];
                row[col.field] = sources.reduce((sum, src) => sum + ((tx.purchaseCounts[src] || {})[product] || 0), 0);
              }
              if (col.swapSource === "to") row[col.field] = tx.swapToCounts[product] || 0;
              if (col.swapSource === "from") row[col.field] = tx.swapFromCounts[product] || 0;
              if (col.refundSource) {
                const src = col.refundSource;
                const counts = src.defective === false ? tx.refundNonDefectiveCounts : tx.refundCounts;
                row[col.field] = (counts[src.section] || {})[product] || 0;
              }
            }
            resolved[section.key][product] = row;
          }
        }
        // Pass 2: cross-section sources
        for (const section of inventorySections) {
          for (const product of section.products) {
            for (const col of section.columns) {
              if (col.source) {
                resolved[section.key][product][col.field] = resolved[col.source.section]?.[product]?.[col.source.field] || 0;
              }
            }
          }
        }
        perDay[date] = resolved;
      }

      setRangeDailyData(perDay);

      // Consolidate: beg from first day, activity fields summed
      const consolidated = {};
      for (const section of inventorySections) {
        consolidated[section.key] = {};
        for (const product of section.products) {
          const row = { beg: perDay[dates[0]][section.key][product]?.beg || 0 };
          for (const col of section.columns) {
            if (["beg", "end", "aud", "var"].includes(col.field)) continue;
            row[col.field] = dates.reduce((sum, date) => sum + ((perDay[date][section.key][product] || {})[col.field] || 0), 0);
          }
          consolidated[section.key][product] = row;
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
  }, [rangeMode, inventoryDate, rangeEndDate, inventorySections]);

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
        beg: (fullRow.beg || 0) + (emptyRow.beg || 0),
        end: fullSection.calcEnd(fullRow) + emptySection.calcEnd(emptyRow),
      };
    });
  }, [rangeInventory, inventorySections]);

  const rangeValid = rangeMode && rangeEndDate && rangeEndDate > inventoryDate;
  const showRangeView = rangeValid && rangeInventory && !rangeLoading;

  return (
    <div className="animate-fade">
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: "0", marginBottom: "0" }}>
        {subTabs.map((tab) => {
          const isActive = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              style={{
                padding: "10px 24px", cursor: "pointer",
                fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
                borderRadius: "0",
                border: "1px solid rgba(200,210,220,0.5)",
                borderBottom: isActive ? "1px solid var(--bg-card)" : "1px solid rgba(200,210,220,0.5)",
                background: isActive ? "var(--bg-card)" : "transparent",
                color: isActive ? "var(--accent-blue)" : "var(--text-dim)",
                position: "relative",
                zIndex: isActive ? 1 : 0,
                marginBottom: "-1px",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{
        background: "var(--bg-card)", borderRadius: "0 0 0 0",
        border: "1px solid var(--border)", padding: "24px",
      }}>
        {subTab === "inventory" && (
          <>
            {/* Top row: view toggle + date controls + action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
              <div style={{ display: "flex" }}>
                {["Single Day", "Date Range"].map((label, i) => {
                  const isRange = i === 1;
                  const active = rangeMode === isRange;
                  return (
                    <button
                      key={label}
                      onClick={() => setRangeMode(isRange)}
                      style={{
                        padding: "6px 14px", cursor: "pointer",
                        fontSize: "12px", fontWeight: 600, fontFamily: "inherit",
                        border: "1px solid var(--border-light)",
                        borderRadius: i === 0 ? "8px 0 0 8px" : "0 8px 8px 0",
                        marginLeft: i === 1 ? "-1px" : 0,
                        background: active ? "rgba(37,99,235,0.1)" : "transparent",
                        color: active ? "var(--accent-blue)" : "var(--text-dim)",
                        transition: "all 0.15s",
                        position: "relative", zIndex: active ? 1 : 0,
                      }}
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
                style={{
                  padding: "6px 10px", borderRadius: "8px",
                  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                  color: "var(--text-secondary)", fontSize: "13px",
                  fontFamily: "var(--font-mono)", outline: "none",
                }}
              />

              {!rangeMode && inventoryDate !== today() && (
                <button
                  onClick={() => setInventoryDate(today())}
                  style={{
                    padding: "6px 12px", borderRadius: "8px", border: "none",
                    cursor: "pointer", background: "rgba(37,99,235,0.1)",
                    color: "var(--accent-blue)", fontSize: "12px", fontWeight: 600,
                    fontFamily: "inherit",
                  }}
                >
                  Go to Today
                </button>
              )}

              {rangeMode && (
                <>
                  <span style={{ color: "var(--text-dim)", fontSize: "12px" }}>to</span>
                  <input
                    type="date"
                    value={rangeEndDate}
                    min={inventoryDate}
                    onChange={(e) => setRangeEndDate(e.target.value)}
                    style={{
                      padding: "6px 10px", borderRadius: "8px",
                      background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                      color: "var(--text-secondary)", fontSize: "13px",
                      fontFamily: "var(--font-mono)", outline: "none",
                    }}
                  />
                </>
              )}

              <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                <div style={{ position: "relative" }}>
                  <button
                    ref={exportBtnRef}
                    onClick={() => {
                      if (showRangeView) setExportMenuOpen((v) => !v);
                      else exportInventory();
                    }}
                    style={{
                      padding: "6px 14px", borderRadius: "8px",
                      border: "1px solid var(--border-light)", background: "transparent",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                      color: "var(--text-muted)", fontSize: "12px", fontWeight: 600,
                      fontFamily: "inherit",
                    }}
                  >
                    <DownloadIcon /> Export
                  </button>
                  {exportMenuOpen && showRangeView && (
                    <>
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 99 }}
                        onClick={() => setExportMenuOpen(false)}
                      />
                      <div style={{
                        position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                        background: "var(--bg-secondary)", border: "1px solid var(--border)",
                        borderRadius: "10px", boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                        minWidth: "200px", overflow: "hidden",
                      }}>
                        <button
                          onClick={() => { exportInventory(); setExportMenuOpen(false); }}
                          style={{
                            display: "block", width: "100%", padding: "10px 16px",
                            textAlign: "left", background: "none", border: "none",
                            cursor: "pointer", fontSize: "12px", fontWeight: 600,
                            color: "var(--text-secondary)", fontFamily: "inherit",
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(241,245,249,0.8)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                        >
                          Consolidated Report
                        </button>
                        <button
                          onClick={() => { exportDailyReports(); setExportMenuOpen(false); }}
                          style={{
                            display: "block", width: "100%", padding: "10px 16px",
                            textAlign: "left", background: "none", border: "none",
                            cursor: "pointer", fontSize: "12px", fontWeight: 600,
                            color: "var(--text-secondary)", fontFamily: "inherit",
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(241,245,249,0.8)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                        >
                          Daily Reports (per day)
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    const existing = new Set();
                    inventorySections.forEach((s) => {
                      const sectionData = inventory?.[s.key] || {};
                      Object.entries(sectionData).forEach(([product, row]) => {
                        if (row.aud != null && row.aud !== "") existing.add(`${s.key}:${product}`);
                      });
                    });
                    setAuditSelected(existing);
                    setAuditSearch("");
                    setAuditDropdownOpen(false);
                    setAuditModalOpen(true);
                  }}
                  style={{
                    padding: "6px 14px", borderRadius: "8px", border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
                    background: "#22c55e", color: "#fff",
                    fontSize: "12px", fontWeight: 700, fontFamily: "inherit",
                    boxShadow: "0 2px 8px rgba(34,197,94,0.3)",
                  }}
                >
                  <PlusIcon /> Add Audit
                </button>
              </div>
            </div>

            {/* Single day view */}
            {!rangeMode && (
              <InventoryPage
                inventoryDate={inventoryDate}
                resolvedInventory={resolvedInventory}
                totalCylinderData={totalCylinderData}
                inventorySections={inventorySections}
                onInventoryChange={onInventoryChange}
                onSaveSection={onSaveSection}
                inventory={inventory}
              />
            )}

            {/* Range mode: waiting for end date */}
            {rangeMode && !rangeEndDate && (
              <p style={{ color: "var(--text-dim)", fontSize: "13px" }}>
                Select an end date to view consolidated inventory for the period.
              </p>
            )}

            {/* Range mode: invalid date range */}
            {rangeMode && rangeEndDate && rangeEndDate <= inventoryDate && (
              <p style={{ color: "#f87171", fontSize: "13px" }}>
                End date must be after start date.
              </p>
            )}

            {/* Range mode: loading */}
            {rangeValid && rangeLoading && (
              <div style={{ padding: "40px", textAlign: "center", color: "var(--text-dim)", fontSize: "13px" }}>
                Loading range data...
              </div>
            )}

            {/* Range mode: consolidated view */}
            {showRangeView && (
              <div className="animate-fade">
                <div style={{
                  padding: "8px 14px", borderRadius: "8px", marginBottom: "20px",
                  background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)",
                  fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5,
                }}>
                  Consolidated from <strong>{inventoryDate}</strong> to <strong>{rangeEndDate}</strong>.
                  BEG is from the first day; activity columns are totals for the period; END is the final day&apos;s closing balance.
                </div>

                {inventorySections.map((section) => (
                  <div key={section.key} style={{ marginBottom: "28px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: section.color }} />
                      <h3 style={{
                        fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)",
                        textTransform: "uppercase", letterSpacing: "0.5px",
                      }}>
                        {section.label}
                      </h3>
                    </div>
                    <InventoryTable
                      section={section}
                      data={rangeInventory[section.key] || {}}
                      allInventory={rangeInventory}
                      onChange={() => {}}
                      onSaveSection={() => {}}
                    />
                  </div>
                ))}

                {/* Total Cylinder summary */}
                <div style={{ marginBottom: "28px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#94a3b8" }} />
                    <h3 style={{
                      fontSize: "13px", fontWeight: 700, color: "var(--text-secondary)",
                      textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>
                      TOTAL CYLINDER (Full + Empty)
                    </h3>
                  </div>
                  <div style={{
                    overflowX: "auto", borderRadius: "12px",
                    border: "1px solid var(--border)", background: "var(--bg-card)",
                  }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "400px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{
                            padding: "8px 12px", textAlign: "left", fontSize: "11px",
                            fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase",
                            letterSpacing: "1px", minWidth: "120px",
                          }}>Product</th>
                          <th style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>BEG</th>
                          <th style={{ padding: "8px 4px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>END</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rangeTotalCylinderData.map((row) => (
                          <tr key={row.product} style={{ borderBottom: "1px solid rgba(15,23,42,0.04)" }}>
                            <td style={{ padding: "6px 12px", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                              {row.product}
                            </td>
                            <td style={{ padding: "4px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                              {row.beg}
                            </td>
                            <td style={{ padding: "4px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                              {row.end}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Audit Modal */}
            {auditModalOpen && (() => {
              const allProducts = inventorySections.flatMap((s) =>
                s.products.map((p) => ({ sectionKey: s.key, sectionLabel: s.label, sectionColor: s.color, product: p, key: `${s.key}:${p}` }))
              );
              const searchLower = auditSearch.toLowerCase();
              const suggestions = auditDropdownOpen
                ? allProducts.filter((p) => !auditSelected.has(p.key) && (!auditSearch || p.product.toLowerCase().includes(searchLower)))
                : [];
              const allSelected = allProducts.every((p) => auditSelected.has(p.key));

              const handleAddProduct = (key) => {
                setAuditSelected((prev) => new Set([...prev, key]));
                setAuditSearch("");
                setAuditDropdownOpen(false);
              };
              const handleRemoveProduct = (key) => {
                setAuditSelected((prev) => { const next = new Set(prev); next.delete(key); return next; });
              };
              const handleShowAll = () => {
                setAuditSelected(new Set(allProducts.map((p) => p.key)));
                setAuditSearch("");
              };

              const handleAudChange = (sectionKey, product, value) => {
                const numVal = value === "" ? "" : parseFloat(value) || 0;
                onInventoryChange(sectionKey, product, "aud", numVal);
              };
              const handleReasonChange = (sectionKey, product, value) => {
                onInventoryChange(sectionKey, product, "audReason", value);
              };
              const handleSaveAndClose = () => {
                inventorySections.forEach((s) => onSaveSection(s.key));
                setAuditModalOpen(false);
              };

              return (
                <div
                  style={{
                    position: "fixed", inset: 0, zIndex: 1000,
                    background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                  onClick={(e) => { if (e.target === e.currentTarget) handleSaveAndClose(); }}
                >
                  <div style={{
                    background: "var(--bg-secondary)", borderRadius: "16px",
                    border: "1px solid var(--border)", padding: "24px",
                    width: "100%", maxWidth: "640px",
                    boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
                    maxHeight: "90vh", overflowY: "auto",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                        Audit Inventory
                      </h3>
                      <button
                        onClick={handleSaveAndClose}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
                      >
                        <XIcon />
                      </button>
                    </div>

                    {/* Product picker */}
                    <div style={{ marginBottom: "20px" }}>
                      <p style={{ fontSize: "12px", color: "var(--text-dim)", margin: "0 0 8px 0" }}>
                        Select a product below or click Show All to audit everything.
                      </p>
                      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                        <div style={{ position: "relative", flex: 1 }}>
                          <input
                            type="text"
                            value={auditSearch}
                            onChange={(e) => setAuditSearch(e.target.value)}
                            onFocus={() => setAuditDropdownOpen(true)}
                            onBlur={() => setTimeout(() => setAuditDropdownOpen(false), 150)}
                            placeholder="Select a product..."
                            style={{
                              width: "100%", padding: "8px 12px", borderRadius: "8px",
                              background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                              color: "var(--text-secondary)", fontSize: "13px",
                              fontFamily: "inherit", outline: "none", boxSizing: "border-box",
                            }}
                          />
                          {suggestions.length > 0 && (
                            <div style={{
                              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 10,
                              background: "var(--bg-secondary)", border: "1px solid var(--border)",
                              borderRadius: "8px", boxShadow: "0 8px 24px rgba(15,23,42,0.1)",
                              overflow: "auto", maxHeight: "220px",
                            }}>
                              {suggestions.map((p) => (
                                <button
                                  key={p.key}
                                  onClick={() => handleAddProduct(p.key)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: "8px",
                                    width: "100%", padding: "8px 12px", background: "none",
                                    border: "none", cursor: "pointer", textAlign: "left",
                                    fontSize: "12px", color: "var(--text-secondary)", fontFamily: "inherit",
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = "rgba(241,245,249,0.8)"}
                                  onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                                >
                                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: p.sectionColor, flexShrink: 0 }} />
                                  <span style={{ fontWeight: 600 }}>{p.product}</span>
                                  <span style={{ color: "var(--text-dim)", fontSize: "11px" }}>{p.sectionLabel}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {!allSelected && (
                          <button
                            onClick={handleShowAll}
                            style={{
                              padding: "8px 14px", borderRadius: "8px", border: "1px solid var(--border-light)",
                              background: "transparent", cursor: "pointer", whiteSpace: "nowrap",
                              fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", fontFamily: "inherit",
                            }}
                          >
                            Show All
                          </button>
                        )}
                      </div>

                      {/* Selected product chips */}
                      {auditSelected.size > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                          {[...auditSelected].map((key) => {
                            const p = allProducts.find((x) => x.key === key);
                            if (!p) return null;
                            return (
                              <span key={key} style={{
                                display: "inline-flex", alignItems: "center", gap: "5px",
                                padding: "3px 8px 3px 6px", borderRadius: "20px",
                                background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)",
                                fontSize: "11px", fontWeight: 600, color: "var(--accent-blue)",
                              }}>
                                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: p.sectionColor }} />
                                {p.product}
                                <button
                                  onClick={() => handleRemoveProduct(key)}
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-dim)", display: "flex", lineHeight: 1 }}
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                    </div>

                    {/* Audit table — only selected products */}
                    {auditSelected.size > 0 && inventorySections.map((section) => {
                      const sectionProducts = section.products.filter((p) => auditSelected.has(`${section.key}:${p}`));
                      if (sectionProducts.length === 0) return null;
                      const colCount = 5;

                      const renderRows = (products) =>
                        products.map((product) => {
                          const row = getMergedRow(section, product);
                          const endVal = section.calcEnd ? section.calcEnd(row) : (row.end || 0);
                          const audVal = inventory?.[section.key]?.[product]?.aud;
                          const audReason = inventory?.[section.key]?.[product]?.audReason || "";
                          const hasAud = audVal != null && audVal !== "";
                          const variance = hasAud ? (parseFloat(audVal) || 0) - endVal : null;
                          const hasDiscrepancy = variance != null && variance !== 0;

                          return (
                            <tr key={product} style={{ borderBottom: "1px solid rgba(15,23,42,0.04)" }}>
                              <td style={{ padding: "6px 12px", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                {product}
                              </td>
                              <td style={{ padding: "4px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                                {endVal}
                              </td>
                              <td style={{ padding: "2px 4px", textAlign: "center" }}>
                                <input
                                  type="number"
                                  value={hasAud ? audVal : ""}
                                  placeholder="—"
                                  onChange={(e) => handleAudChange(section.key, product, e.target.value)}
                                  onBlur={() => onSaveSection(section.key)}
                                  style={{
                                    width: "60px", padding: "5px 6px", borderRadius: "6px",
                                    background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                                    color: "var(--text-secondary)", fontSize: "12px", outline: "none",
                                    fontFamily: "var(--font-mono)", textAlign: "center",
                                  }}
                                />
                              </td>
                              <td style={{
                                padding: "4px 6px", textAlign: "center", fontSize: "11px",
                                fontFamily: "var(--font-mono)", fontWeight: 700, minWidth: "40px",
                                color: variance == null ? "var(--text-dim)" : variance > 0 ? "#4ade80" : variance < 0 ? "#f87171" : "var(--text-dim)",
                              }}>
                                {variance != null ? (variance > 0 ? `+${variance}` : variance) : "—"}
                              </td>
                              <td style={{ padding: "2px 6px" }}>
                                {hasDiscrepancy ? (
                                  <input
                                    type="text"
                                    value={audReason}
                                    placeholder="Reason..."
                                    onChange={(e) => handleReasonChange(section.key, product, e.target.value)}
                                    onBlur={() => onSaveSection(section.key)}
                                    style={{
                                      width: "100%", padding: "5px 8px", borderRadius: "6px",
                                      background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.15)",
                                      color: "var(--text-secondary)", fontSize: "11px", outline: "none",
                                      fontFamily: "inherit", minWidth: "120px",
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: "11px", color: "var(--text-dim)" }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        });

                      return (
                        <div key={section.key} style={{ marginBottom: "16px" }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: "6px",
                            padding: "8px 12px", borderRadius: "8px 8px 0 0",
                            background: "rgba(241,245,249,0.8)", borderBottom: "1px solid var(--border)",
                          }}>
                            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: section.color }} />
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                              {section.label}
                            </span>
                          </div>
                          <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                  <th style={{ padding: "6px 12px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                                  <th style={{ padding: "6px 6px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>END</th>
                                  <th style={{ padding: "6px 6px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "#22c55e", textTransform: "uppercase" }}>Audit</th>
                                  <th style={{ padding: "6px 6px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>DIFF</th>
                                  <th style={{ padding: "6px 6px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {section.subgroups && section.subgroups.length > 0 ? (
                                  section.subgroups.map((sg) => {
                                    const sgProducts = sg.products.filter((p) => auditSelected.has(`${section.key}:${p}`));
                                    if (sgProducts.length === 0) return null;
                                    return (
                                      <React.Fragment key={sg.label}>
                                        <tr>
                                          <td colSpan={colCount} style={{
                                            padding: "5px 12px", fontSize: "10px", fontWeight: 700,
                                            color: "var(--text-dim)", textTransform: "uppercase",
                                            letterSpacing: "1px", background: "rgba(241,245,249,0.4)",
                                          }}>
                                            {sg.label}
                                          </td>
                                        </tr>
                                        {renderRows(sgProducts)}
                                      </React.Fragment>
                                    );
                                  })
                                ) : (
                                  renderRows(sectionProducts)
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                      <button
                        onClick={handleSaveAndClose}
                        style={{
                          padding: "10px 24px", borderRadius: "10px", border: "none",
                          cursor: "pointer",
                          background: "linear-gradient(135deg, #22c55e, #16a34a)",
                          color: "#fff", fontSize: "13px", fontWeight: 700,
                          fontFamily: "inherit",
                          boxShadow: "0 2px 8px rgba(34,197,94,0.3)",
                        }}
                      >
                        Save & Close
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {subTab === "audit" && (
          <AuditPage
            inventorySections={inventorySections}
            staff={staff}
          />
        )}
      </div>
    </div>
  );
}
