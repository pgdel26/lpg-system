import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { XIcon, DownloadIcon } from "./Icons";
import { today } from "../lib/utils";
import CustomerSearch from "./CustomerSearch";
import styles from "./ExportCustomerSalesModal.module.css";
import type { Customer, CustomerTransaction } from "../lib/types";

const TYPE_LABEL: Record<string, string> = { sale: "Sale", swap: "Swap", refund: "Refund" };

const getTxDescription = (tx: CustomerTransaction): string => {
  if (tx.type === "sale") return `${(tx.product as string) || "Item"} x${(tx.quantity as number) || 1}`;
  if (tx.type === "swap") return `${(tx.productFrom as string) || "?"} → ${(tx.productTo as string) || "?"}`;
  if (tx.type === "refund") return `${(tx.product as string) || (tx.saleSection as string) || "Refund"}${tx.quantity ? ` x${tx.quantity}` : ""}`;
  return "";
};

const getTxAmount = (tx: CustomerTransaction): number => {
  if (tx.type === "sale") return (tx.totalAmount as number) || 0;
  if (tx.type === "swap") return (tx.price as number) || 0;
  if (tx.type === "refund") return (tx.totalRefund as number) || (tx.refundAmount as number) || 0;
  return 0;
};

interface ExportCustomerSalesModalProps {
  customers: Customer[];
  onFetchCustomerTransactions: (customerId: string) => Promise<CustomerTransaction[]>;
  onClose: () => void;
}

export default function ExportCustomerSalesModal({ customers, onFetchCustomerTransactions, onClose }: ExportCustomerSalesModalProps) {
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

      const setStyle = (addr: string, style: Record<string, unknown>) => {
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
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget && !exporting) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Export Customer Sales</h3>
          <button
            onClick={onClose}
            disabled={exporting}
            className={`${styles.closeButton} ${exporting ? styles.closeButtonBusy : styles.closeButtonNormal}`}
          >
            <XIcon />
          </button>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>Customer</label>
          <CustomerSearch customers={customers} value={customerId} onChange={setCustomerId} />
        </div>

        <div className={styles.dateRow}>
          <div className={styles.dateCol}>
            <label className={styles.dateLabel}>From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.dateCol}>
            <label className={styles.dateLabel}>To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
        </div>

        {error && <p className={styles.errorText}>{error}</p>}

        <div className={styles.actions}>
          <button
            onClick={onClose}
            disabled={exporting}
            className={`${styles.cancelButton} ${exporting ? styles.cancelButtonBusy : styles.cancelButtonNormal}`}
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className={`${styles.exportButton} ${exporting ? styles.exportButtonBusy : styles.exportButtonNormal}`}
          >
            <DownloadIcon /> {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
