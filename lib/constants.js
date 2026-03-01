// ============================================================
// CONSTANTS
// ============================================================
export const FULL_CYLINDER_PRODUCTS = [
  "2.7KG", "2.7KG FIESTA", "7KG PASAK", "7KG RUSKAS",
  "11KG PASAK", "11KG RUSKAS", "ELITE PASAK", "ELITE RUSKAS",
  "22KG", "50KG BLUE", "50KG CODED",
];
export const EMPTY_CYLINDER_PRODUCTS = [...FULL_CYLINDER_PRODUCTS];
export const REGULATOR_PRODUCTS = ["REGULATOR (PASAK)", "REGULATOR (RUSKAS)"];
export const OTHERS_PRODUCTS = [
  "GS-3", "HOSE", "CLAMP", "REYNA (SINGLE BURNER)",
  "REYNA (DOUBLE BURNER)", "Y TYPE",
];
export const ALL_ACCESSORIES = [...REGULATOR_PRODUCTS, ...OTHERS_PRODUCTS];

// Inventory section definitions — columns match the spreadsheet
export const INVENTORY_SECTIONS = [
  {
    key: "full",
    label: "FULL CYLINDER",
    products: FULL_CYLINDER_PRODUCTS,
    color: "#f59e42",
    columns: [
      { field: "beg", label: "BEG" },
      { field: "plantaPurchases", label: "PLANTA PURCH.", purchaseSource: "cylinderWithRefill" },
      { field: "plantaRefill", label: "PLANTA REFILL", purchaseSource: "refill" },
      { field: "sold", label: "SOLD", salesSource: "cylinderWithRefill" },
      { field: "refillSales", label: "REFILL", salesSource: "refill" },
      { field: "swap", label: "SWAP", swapSource: "to" },
      { field: "returns", label: "RETURN" },
      { field: "end", label: "END", calc: true },
      { field: "aud", label: "AUD", auditSource: true },
      { field: "var", label: "VAR", calc: true },
    ],
    calcEnd: (r) =>
      (r.beg || 0) + (r.plantaPurchases || 0) + (r.plantaRefill || 0) -
      (r.sold || 0) - (r.refillSales || 0) - (r.swap || 0) +
      (r.returns || 0),
  },
  {
    key: "empty",
    label: "EMPTY",
    products: EMPTY_CYLINDER_PRODUCTS,
    color: "#3b82f6",
    columns: [
      { field: "beg", label: "BEG" },
      { field: "toPlanta", label: "PLANTA", source: { section: "full", field: "plantaRefill" } },
      { field: "refillIn", label: "REFILL", source: { section: "full", field: "refillSales" } },
      { field: "swapIn", label: "SWAP", swapSource: "from" },
      { field: "returned", label: "RETURNED" },
      { field: "end", label: "END", calc: true },
      { field: "aud", label: "AUD", auditSource: true },
      { field: "var", label: "VAR", calc: true },
    ],
    calcEnd: (r) =>
      (r.beg || 0) - (r.toPlanta || 0) + (r.refillIn || 0) +
      (r.swapIn || 0) + (r.returned || 0),
  },
  {
    key: "accessories",
    label: "ACCESSORIES",
    products: ALL_ACCESSORIES,
    color: "#22c55e",
    subgroups: [
      { label: "REGULATOR", startIndex: 0 },
      { label: "OTHERS", startIndex: REGULATOR_PRODUCTS.length },
    ],
    columns: [
      { field: "beg", label: "BEG" },
      { field: "delivery", label: "DELIVERY", purchaseSource: "accessories" },
      { field: "sold", label: "SOLD", salesSource: "accessories" },
      { field: "defective", label: "DEFECTIVE" },
      { field: "end", label: "END", calc: true },
      { field: "aud", label: "AUD", auditSource: true },
      { field: "var", label: "VAR", calc: true },
    ],
    calcEnd: (r) =>
      (r.beg || 0) + (r.delivery || 0) - (r.sold || 0) - (r.defective || 0),
  },
];

// Sales sections — matches spreadsheet columns A-D
export const SALES_SECTIONS = [
  {
    key: "cylinderWithRefill",
    label: "CYLINDER WITH REFILL",
    products: FULL_CYLINDER_PRODUCTS,
    productCategory: "full",
    srpField: "srp",
  },
  {
    key: "refill",
    label: "REFILL ONLY",
    products: FULL_CYLINDER_PRODUCTS,
    productCategory: "full",
    srpField: "srpRefill",
  },
  {
    key: "accessories",
    label: "ACCESSORIES",
    subgroups: [
      { label: "REGULATOR", products: REGULATOR_PRODUCTS },
      { label: "OTHERS", products: OTHERS_PRODUCTS },
    ],
    productCategory: "accessories",
    srpField: "srp",
  },
];

// Purchase sections — mirrors sales sections for the buying side
export const PURCHASE_SECTIONS = [
  {
    key: "cylinderWithRefill",
    label: "CYLINDER WITH REFILL",
    products: FULL_CYLINDER_PRODUCTS,
    productCategory: "full",
  },
  {
    key: "refill",
    label: "REFILL ONLY",
    products: FULL_CYLINDER_PRODUCTS,
    productCategory: "full",
  },
  {
    key: "accessories",
    label: "ACCESSORIES",
    subgroups: [
      { label: "REGULATOR", products: REGULATOR_PRODUCTS },
      { label: "OTHERS", products: OTHERS_PRODUCTS },
    ],
    productCategory: "accessories",
  },
];

// Product seed data for SRP
export const PRODUCT_SEED_DATA = [
  { category: "full", name: "2.7KG", srp: 1489, srpRefill: 289 },
  { category: "full", name: "2.7KG FIESTA", srp: 1489, srpRefill: 289 },
  { category: "full", name: "7KG PASAK", srp: 2588, srpRefill: 688 },
  { category: "full", name: "7KG RUSKAS", srp: 2588, srpRefill: 688 },
  { category: "full", name: "11KG PASAK", srp: 3013, srpRefill: 1013 },
  { category: "full", name: "11KG RUSKAS", srp: 3013, srpRefill: 1013 },
  { category: "full", name: "ELITE PASAK", srp: 4738, srpRefill: 1038 },
  { category: "full", name: "ELITE RUSKAS", srp: 4738, srpRefill: 1038 },
  { category: "full", name: "22KG", srp: 5665, srpRefill: 1965 },
  { category: "full", name: "50KG BLUE", srp: 9459, srpRefill: 4459 },
  { category: "full", name: "50KG CODED", srp: 9459, srpRefill: 4459 },
  ...EMPTY_CYLINDER_PRODUCTS.map((n) => ({ category: "empty", name: n, srp: 0, srpRefill: null })),
  { category: "accessories", name: "REGULATOR (PASAK)", srp: 650, srpRefill: null },
  { category: "accessories", name: "REGULATOR (RUSKAS)", srp: 375, srpRefill: null },
  { category: "accessories", name: "GS-3", srp: 650, srpRefill: null },
  { category: "accessories", name: "HOSE", srp: 180, srpRefill: null },
  { category: "accessories", name: "CLAMP", srp: 20, srpRefill: null },
  { category: "accessories", name: "REYNA (SINGLE BURNER)", srp: 650, srpRefill: null },
  { category: "accessories", name: "REYNA (DOUBLE BURNER)", srp: 1200, srpRefill: null },
  { category: "accessories", name: "Y TYPE", srp: 150, srpRefill: null },
];
