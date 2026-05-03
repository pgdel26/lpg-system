import * as XLSX from "xlsx-js-style";

const saleTypeLabel = (section) => {
  if (section === "cylinderWithRefill") return "Full Cylinder";
  if (section === "refill") return "Refill";
  if (section === "accessories") return "Accessories";
  return section;
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
}) {
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
  const totalDiscount = saleTransactions.reduce((sum, t) => sum + (t.discount || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalRefunds = refunds.reduce((sum, r) => sum + (r.totalRefund || 0), 0);
  const netSales = grossSales - totalDiscount - totalExpenses - totalRefunds;
  const totalAR = saleTransactions
    .filter((t) => t.paymentType === "ar")
    .reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
  const totalGCash = saleTransactions
    .filter((t) => t.paymentType === "gcash")
    .reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0);
  const collectionsForDay = arTransactions.filter(
    (t) => t.arCollected && t.collectedDate === date && t.collectionMethod !== "check"
  );
  const totalCollections = collectionsForDay.reduce((sum, t) => sum + (t.totalAmount || 0), 0);
  const expectedCashRemit = netSales - totalAR - totalGCash + totalCollections;
  const actual = parseFloat(dailyReport?.actualCashRemit) || 0;
  const diff = actual - expectedCashRemit;
  const cashierName = dailyReport?.cashier
    ? (staff.find((s) => s.id === dailyReport.cashier)?.name || "")
    : "";
  const assignedStaff = (dailyReport?.staff || [])
    .map((id) => staff.find((s) => s.id === id))
    .filter(Boolean);
  const hasCashOnHand = dailyReport?.actualCashRemit != null && dailyReport?.actualCashRemit !== "";

  const boldSz = (sz) => ({ font: { bold: true, sz } });
  const sectionHeader = { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "2563EB" } }, alignment: { horizontal: "left" } };
  const tableHeader = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "E2E8F0" } }, border: { bottom: { style: "thin", color: { rgb: "94A3B8" } } } };
  const totalRowStyle = { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: "F1F5F9" } }, border: { top: { style: "thin", color: { rgb: "94A3B8" } } } };
  const numFmt = "#,##0.00";

  const sectionRows = [];
  const tableHeaderRows = [];
  const totalRows = [];

  const data = [];
  const merges = [];
  let r;

  data.push(["DAILY SALES REPORT"]);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } });
  data.push([`Date: ${date}`]);
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: 8 } });
  data.push([]);

  r = data.length;
  data.push(["STAFF ON DUTY"]);
  sectionRows.push(r);
  merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
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
  merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
  r = data.length;
  data.push(["", "Amount"]);
  tableHeaderRows.push(r);
  data.push(["Gross Sales", grossSales]);
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
  merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
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
  merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
  if (sorted.length > 0 || swaps.length > 0 || refunds.length > 0) {
    r = data.length;
    data.push(["Invoice", "Customer", "Product", "Type", "Qty", "SRP", "Discount", "Total", "Payment"]);
    tableHeaderRows.push(r);
    sorted.forEach((t) => {
      data.push([
        t.invoice || "", t.customerName || "", t.product || "",
        saleTypeLabel(t.saleSection), t.quantity || 1, t.srp || 0,
        t.discount || 0, t.totalAmount || t.finalPrice || 0,
        t.paymentType === "cash" ? "Cash" : t.paymentType === "gcash" ? "GCash" : "AR",
      ]);
    });
    swaps.forEach((s) => {
      data.push([
        "", s.customerName || "", `${s.productFrom} → ${s.productTo}`,
        "Swap", 1, s.price || 0, 0, s.price || 0, "Cash",
      ]);
    });
    refunds.forEach((rf) => {
      data.push([
        rf.invoice || "", rf.customerName || "",
        (rf.items || []).map((it) => it.product).join(", "),
        "Refund", (rf.items || []).reduce((sum, it) => sum + (it.qty || 0), 0),
        "", "", -(rf.totalRefund || 0), "",
      ]);
    });
    const salesTotalDiscount = sorted.reduce((sum, t) => sum + (t.discount || 0), 0);
    const salesTotalAmount = sorted.reduce((sum, t) => sum + (t.totalAmount || t.finalPrice || 0), 0)
      + swaps.reduce((sum, s) => sum + (s.price || 0), 0)
      - refunds.reduce((sum, rf) => sum + (rf.totalRefund || 0), 0);
    r = data.length;
    data.push(["", "", "", "", "", "", salesTotalDiscount, salesTotalAmount, ""]);
    totalRows.push(r);
  } else {
    data.push(["No sales recorded.", "", "", "", "", "", "", "", ""]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 22 }, { wch: 20 }, { wch: 24 }, { wch: 14 },
    { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 },
  ];

  const range = XLSX.utils.decode_range(ws["!ref"]);
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
