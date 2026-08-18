import * as XLSX from "xlsx-js-style";
import { titleCaseCategory } from "../utils";
import { paymentSplit } from "../payments";
import { collectionsOnDate } from "../receivables";

// Local interfaces for report data shapes (admin SDK plain objects)

interface ReportSaleTransaction {
  id?: string;
  invoice?: string;
  customerName?: string;
  product?: string;
  saleSection?: string;
  quantity?: number;
  srp?: number;
  discount?: number;
  deliveryCharge?: number;
  totalAmount?: number;
  finalPrice?: number;
  paymentType?: string;
  payments?: Array<{ method?: string; amount?: number }>;
  gcashRef?: string;
  createdAt?: { seconds?: number; _seconds?: number };
}

interface ReportSwap {
  id?: string;
  customerName?: string;
  productFrom?: string;
  productTo?: string;
  price?: number;
}

interface ReportRefundItem {
  product?: string;
  qty?: number;
}

interface ReportRefund {
  id?: string;
  invoice?: string;
  customerName?: string;
  items?: ReportRefundItem[];
  totalRefund?: number;
}

interface ReportExpense {
  id?: string;
  description?: string;
  amount?: number;
}

interface ReportStaff {
  id?: string;
  name?: string;
  role?: string;
}

interface ReportDailyReport {
  cashier?: string | null;
  staff?: string[];
  actualCashRemit?: string | number | null;
}

interface ReportArTransaction {
  id?: string;
  branch?: string;
  arCollected?: boolean;
  collectedDate?: string;
  collectionMethod?: string;
  arCollections?: Array<{ amount?: number; method?: string; date?: string; branch?: string; batchId?: string }>;
  totalAmount?: number;
  finalPrice?: number;
  paymentType?: string;
  payments?: Array<{ method?: string; amount?: number }>;
}

export interface SalesReportInput {
  date: string;
  saleTransactions?: ReportSaleTransaction[];
  swaps?: ReportSwap[];
  refunds?: ReportRefund[];
  expenses?: ReportExpense[];
  staff?: ReportStaff[];
  dailyReport?: ReportDailyReport;
  arTransactions?: ReportArTransaction[];
  // Omit for an all-outlet report (e.g. the cron email) — collectionsOnDate
  // then counts every branch's collections for the day, matching today's
  // behavior. Pass it to scope to one outlet's own collections (the in-app
  // per-branch Sales Report and its Export button).
  branch?: string;
}

const saleTypeLabel = (section: string): string => {
  if (section === "cylinderWithRefill") return "Full Cylinder";
  if (section === "refill") return "Refill";
  // Single-price categories (accessories + any future one) use the category key
  // as their section; title-case it for display.
  return titleCaseCategory(section);
};

export function buildSalesReportWorkbook({
  date,
  saleTransactions = [],
  swaps = [],
  refunds = [],
  expenses = [],
  staff = [],
  dailyReport = { cashier: null, staff: [] },
  arTransactions = [],
  branch,
}: SalesReportInput): XLSX.WorkBook {
  const sorted = [...saleTransactions].sort((a, b) => {
    const invA = (a.invoice || "").toLowerCase();
    const invB = (b.invoice || "").toLowerCase();
    if (invA !== invB) return invA.localeCompare(invB);
    const tA = a.createdAt?.seconds || a.createdAt?._seconds || 0;
    const tB = b.createdAt?.seconds || b.createdAt?._seconds || 0;
    return tA - tB;
  });

  const grossSales = saleTransactions.reduce((sum, t) => sum + ((t.srp || 0) * (t.quantity || 1)), 0)
    + swaps.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDelivery = saleTransactions.reduce((sum, t) => sum + (t.deliveryCharge || 0), 0);
  const totalDiscount = saleTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalRefunds = refunds.reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const netSales = grossSales + totalDelivery - totalDiscount - totalExpenses - totalRefunds;
  // paymentSplit() is the one shared implementation of the channel rule (also
  // used by DailySalesTab.tsx, SalesReportTab.tsx, ReceivablesPage.tsx,
  // TopDebtorsChart.tsx) — summing across ALL docs (not filtering by
  // paymentType first) is what correctly attributes a split-payment sale's
  // cash/gcash/ar portions instead of booking the whole line to one channel.
  const totalAR = saleTransactions.reduce((sum, t) => sum + paymentSplit(t).ar, 0);
  const totalGCash = saleTransactions.reduce((sum, t) => sum + paymentSplit(t).gcash, 0);
  // Only the cash actually collected ON this date counts — a doc can receive
  // partial collections across several dates, and check/GCash collections
  // never touch the physical drawer. See lib/receivables.ts.
  const totalCollections = collectionsOnDate(arTransactions, date, branch);
  const expectedCashRemit = netSales - totalAR - totalGCash + totalCollections;
  const actual = parseFloat(String(dailyReport?.actualCashRemit ?? "")) || 0;
  const diff = actual - expectedCashRemit;
  const cashierName = dailyReport?.cashier
    ? (staff.find((s) => s.id === dailyReport.cashier)?.name || "")
    : "";
  const assignedStaff = (dailyReport?.staff || [])
    .map((id) => staff.find((s) => s.id === id))
    .filter((s): s is ReportStaff => s !== undefined);
  const hasCashOnHand = dailyReport?.actualCashRemit != null && dailyReport?.actualCashRemit !== "";

  const boldSz = (sz: number): Record<string, unknown> => ({ font: { bold: true, sz } });
  const sectionHeader: Record<string, unknown> = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
  const tableHeader: Record<string, unknown> = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
  const totalRowStyle: Record<string, unknown> = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };
  const numFmt = "#,##0.00";

  const sectionRows: number[] = [];
  const tableHeaderRows: number[] = [];
  const totalRows: number[] = [];

  const data: unknown[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let r: number;

  data.push(["DAILY SALES REPORT"]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } });
  data.push([`Date: ${date}`]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 11 } });
  data.push([]);

  r = data.length;
  data.push(["STAFF ON DUTY"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: 11 } });
  r = data.length;
  data.push(["Role", "Name"]);
  tableHeaderRows.push(r);
  data.push(["Cashier", cashierName || "—"]);
  assignedStaff.forEach((s) => {
    data.push(["Staff", `${s.name}${s.role ? ` (${s.role})` : ""}`]);
  });
  if (assignedStaff.length === 0) data.push(["Staff", "—"]);
  data.push([]);

  r = data.length;
  data.push(["SALES DAILY BREAKDOWN"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: 11 } });
  r = data.length;
  data.push(["", "Amount"]);
  tableHeaderRows.push(r);
  data.push(["Gross Sales", grossSales]);
  data.push(["Delivery Charge", totalDelivery > 0 ? totalDelivery : 0]);
  data.push(["Discounts", totalDiscount > 0 ? -totalDiscount : 0]);
  data.push(["Expenses", totalExpenses > 0 ? -totalExpenses : 0]);
  data.push(["Refunds", totalRefunds > 0 ? -totalRefunds : 0]);
  r = data.length;
  data.push(["Net Sales", netSales]);
  totalRows.push(r);
  data.push([]);
  data.push(["Accounts Receivable", totalAR > 0 ? -totalAR : 0]);
  data.push(["GCash", totalGCash > 0 ? -totalGCash : 0]);
  data.push(["Collections", totalCollections > 0 ? totalCollections : 0]);
  r = data.length;
  data.push(["Expected Cash Remit", expectedCashRemit]);
  totalRows.push(r);
  data.push([]);
  data.push(["Cash On Hand", hasCashOnHand ? actual : ""]);
  if (hasCashOnHand) {
    r = data.length;
    data.push([diff < 0 ? "Short" : diff > 0 ? "Over" : "Short / Over", diff]);
    totalRows.push(r);
  }
  data.push([]);

  r = data.length;
  data.push(["EXPENSES"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: 11 } });
  if (expenses.length > 0) {
    r = data.length;
    data.push(["Description", "Amount"]);
    tableHeaderRows.push(r);
    expenses.forEach((e) => {
      data.push([e.description || "", e.amount || 0]);
    });
    r = data.length;
    data.push(["Total Expenses", totalExpenses]);
    totalRows.push(r);
  } else {
    data.push(["No expenses recorded.", ""]);
  }
  data.push([]);

  r = data.length;
  data.push(["DAILY SALES"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: 11 } });
  if (sorted.length > 0 || swaps.length > 0 || refunds.length > 0) {
    r = data.length;
    data.push(["Invoice", "Customer", "Product", "Type", "Qty", "SRP", "Discount", "Delivery", "Cash", "GCash", "A/R", "GCash Ref No"]);
    tableHeaderRows.push(r);
    // Route each sale's amount into the columns matching its payment split —
    // a split-payment sale can populate two or three of Cash/GCash/A/R for
    // the same row, instead of exactly one.
    sorted.forEach((t) => {
      const split = paymentSplit(t);
      data.push([
        t.invoice || "", t.customerName || "", t.product || "",
        saleTypeLabel(t.saleSection || ""), t.quantity || 1, t.srp || 0,
        t.discount || 0, t.deliveryCharge || 0,
        split.cash > 0 ? split.cash : "",
        split.gcash > 0 ? split.gcash : "",
        split.ar > 0 ? split.ar : "",
        t.gcashRef || "",
      ]);
    });
    // Swaps are settled in cash → Cash column.
    swaps.forEach((s) => {
      data.push([
        "", s.customerName || "", `${s.productFrom} → ${s.productTo}`,
        "Swap", 1, s.price || 0, 0, "", s.price || 0, "", "", "",
      ]);
    });
    // Refunds are cash paid out of the drawer → Cash column (negative).
    refunds.forEach((rf) => {
      data.push([
        rf.invoice || "", rf.customerName || "",
        (rf.items || []).map((it) => it.product).join(", "),
        "Refund", (rf.items || []).reduce((sum, it) => sum + (it.qty || 0), 0),
        "", "", "", -(rf.totalRefund || 0), "", "", "",
      ]);
    });
    // Money-by-channel: Cash = cash sales + swaps − refunds; GCash = gcash
    // sales; A/R = ar sales. The three reconcile to the day's grand total.
    const salesTotalDiscount = sorted.reduce((sum, t) => sum + (t.discount || 0), 0);
    const cashTotal = sorted.reduce((sum, t) => sum + paymentSplit(t).cash, 0)
      + swaps.reduce((sum, s) => sum + (s.price || 0), 0)
      - refunds.reduce((sum, rf) => sum + (rf.totalRefund || 0), 0);
    const gcashTotal = sorted.reduce((sum, t) => sum + paymentSplit(t).gcash, 0);
    const arTotal = sorted.reduce((sum, t) => sum + paymentSplit(t).ar, 0);
    r = data.length;
    data.push(["", "", "", "", "", "", salesTotalDiscount, "", cashTotal, gcashTotal, arTotal, ""]);
    totalRows.push(r);
  } else {
    data.push(["No sales recorded.", "", "", "", "", "", "", "", "", "", "", ""]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 22 }, { wch: 20 }, { wch: 24 }, { wch: 14 },
    { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
  ];

  const range = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      if (R === 0) ws[addr].s = boldSz(16);
      else if (R === 1) ws[addr].s = boldSz(12);
      else if (sectionRows.includes(R)) ws[addr].s = sectionHeader;
      else if (tableHeaderRows.includes(R)) ws[addr].s = tableHeader;
      else if (totalRows.includes(R)) {
        ws[addr].s = { ...totalRowStyle };
        if (typeof ws[addr].v === "number") ws[addr].s.numFmt = numFmt;
      } else if (typeof ws[addr].v === "number") {
        ws[addr].s = { numFmt };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sales Report");
  return wb;
}
