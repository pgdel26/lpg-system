import React, { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { XIcon, DownloadIcon } from "./Icons";
import { today } from "../lib/utils";
import CustomerSearch from "./CustomerSearch";

const TYPE_LABEL = { sale: "Sale", swap: "Swap", refund: "Refund" };

const getTxDescription = (tx) => {
  if (tx.type === "sale") return `${tx.product || "Item"} x${tx.quantity || 1}`;
  if (tx.type === "swap") return `${tx.productFrom || "?"} → ${tx.productTo || "?"}`;
  if (tx.type === "refund") return `${tx.product || tx.saleSection || "Refund"}${tx.quantity ? ` x${tx.quantity}` : ""}`;
  return "";
};

const getTxAmount = (tx) => {
  if (tx.type === "sale") return tx.totalAmount || 0;
  if (tx.type === "swap") return tx.price || 0;
  if (tx.type === "refund") return tx.totalRefund || tx.refundAmount || 0;
  return 0;
};

const inputStyle = {
  width: "100%", padding: "8px 10px", borderRadius: "8px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "12px", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

export default function ExportCustomerSalesModal({ customers, onFetchCustomerTransactions, onClose }) {
  const firstOfMonth = today().slice(0, 7) + "-01";
  const [customerId, setCustomerId] = useState("");
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(today());
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setError("");
    if (!customerId) { setError("Please select a customer."); return; }
    if (!fromDate || !toDate) { setError("Please select both dates."); return; }
    if (fromDate > toDate) { setError("'From' date must be on or before 'To' date."); return; }

    const customer = customers.find((c) => c.id === customerId);
    if (!customer) { setError("Customer not found."); return; }

    setExporting(true);
    try {
      const allTxs = await onFetchCustomerTransactions(customerId);
      const txs = allTxs.filter((t) => {
        const d = t.date || "";
        return d >= fromDate && d <= toDate;
      });

      if (txs.length === 0) {
        setError("No transactions found in the selected date range.");
        setExporting(false);
        return;
      }

      const sales = txs.filter((t) => t.type === "sale");
      const swapsList = txs.filter((t) => t.type === "swap");
      const refundsList = txs.filter((t) => t.type === "refund");
      const salesTotal = sales.reduce((s, t) => s + getTxAmount(t), 0);
      const swapsTotal = swapsList.reduce((s, t) => s + getTxAmount(t), 0);
      const refundsTotal = refundsList.reduce((s, t) => s + getTxAmount(t), 0);
      const netSpent = salesTotal + swapsTotal - refundsTotal;

      const titleStyle = { font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
      const sectionStyle = { font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } } };
      const labelStyle = { font: { bold: true, sz: 11 } };
      const tableHeader = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
      const totalStyle = { font: { bold: true, sz: 12 }, fill: { fgColor: { rgb: "F1F5F9" } } };
      const numFmt = "#,##0.00";

      const data = [];
      data.push(["Customer Purchase Report"]);
      data.push([]);
      data.push(["Customer", customer.name]);
      data.push(["Phone", customer.phone || ""]);
      data.push(["Period", `${fromDate} to ${toDate}`]);
      data.push([]);
      data.push(["SUMMARY"]);
      data.push(["Total Spent (Net)", netSpent]);
      data.push(["Sales Subtotal", salesTotal, `${sales.length} transaction${sales.length === 1 ? "" : "s"}`]);
      data.push(["Swaps Subtotal", swapsTotal, `${swapsList.length} transaction${swapsList.length === 1 ? "" : "s"}`]);
      data.push(["Refunds Subtotal", refundsTotal, `${refundsList.length} transaction${refundsList.length === 1 ? "" : "s"}`]);
      data.push([]);
      data.push(["TRANSACTIONS"]);
      const headerRowIndex = data.length;
      data.push(["Date", "Type", "Description", "Quantity", "Amount", "Invoice", "Payment", "GCash Ref"]);

      const sortedAsc = [...txs].sort(
        (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
      );
      sortedAsc.forEach((tx) => {
        const amt = getTxAmount(tx);
        data.push([
          tx.date || "",
          TYPE_LABEL[tx.type] || tx.type,
          getTxDescription(tx),
          tx.quantity || "",
          tx.type === "refund" ? -amt : amt,
          tx.invoice || "",
          tx.paymentType || "",
          tx.gcashRef || "",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(data);
      ws["!cols"] = [
        { wch: 22 }, { wch: 14 }, { wch: 32 }, { wch: 10 },
        { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 },
      ];
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
        { s: { r: 6, c: 0 }, e: { r: 6, c: 7 } },
        { s: { r: 12, c: 0 }, e: { r: 12, c: 7 } },
      ];

      const setStyle = (addr, style) => {
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        ws[addr].s = { ...(ws[addr].s || {}), ...style };
      };
      setStyle("A1", titleStyle);
      setStyle("A7", sectionStyle);
      setStyle("A13", sectionStyle);
      ["A3", "A4", "A5", "A8", "A9", "A10", "A11"].forEach((a) => setStyle(a, labelStyle));
      ["B8", "B9", "B10", "B11"].forEach((a) => { setStyle(a, { numFmt }); });
      setStyle("B8", { ...labelStyle, ...totalStyle, numFmt });

      for (let c = 0; c < 8; c++) {
        const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c });
        setStyle(addr, tableHeader);
      }
      for (let r = headerRowIndex + 1; r < data.length; r++) {
        const amtAddr = XLSX.utils.encode_cell({ r, c: 4 });
        setStyle(amtAddr, { numFmt });
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchases");
      const safeName = (customer.name || "Customer").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      XLSX.writeFile(wb, `${safeName || "Customer"}_Purchases_${fromDate}_to_${toDate}.xlsx`);
      onClose();
    } catch (err) {
      console.error("Export customer sales error:", err);
      setError("Failed to generate export.");
      setExporting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget && !exporting) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)", borderRadius: "16px",
        border: "1px solid var(--border)", padding: "24px",
        width: "100%", maxWidth: "440px",
        boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
            Export Customer Sales
          </h3>
          <button
            onClick={onClose}
            disabled={exporting}
            style={{ background: "none", border: "none", cursor: exporting ? "wait" : "pointer", color: "var(--text-muted)", display: "flex" }}
          >
            <XIcon />
          </button>
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: "6px" }}>
            Customer
          </label>
          <CustomerSearch customers={customers} value={customerId} onChange={setCustomerId} />
        </div>

        <div style={{ display: "flex", gap: "12px", marginBottom: "20px" }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              From
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              style={{ ...inputStyle, marginTop: "6px" }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              To
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              style={{ ...inputStyle, marginTop: "6px" }}
            />
          </div>
        </div>

        {error && (
          <p style={{ fontSize: "11px", color: "var(--accent-red)", marginBottom: "12px", fontWeight: 600 }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={exporting}
            style={{
              padding: "8px 16px", borderRadius: "8px",
              border: "1px solid var(--border-light)", background: "transparent",
              cursor: exporting ? "wait" : "pointer", fontSize: "12px", fontWeight: 600,
              color: "var(--text-muted)", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: "8px 16px", borderRadius: "8px", border: "none",
              cursor: exporting ? "wait" : "pointer", fontSize: "12px", fontWeight: 600,
              color: "#fff", fontFamily: "inherit",
              background: "linear-gradient(135deg, #3b82f6, #2563eb)",
              display: "flex", alignItems: "center", gap: "6px",
              opacity: exporting ? 0.7 : 1,
            }}
          >
            <DownloadIcon /> {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
