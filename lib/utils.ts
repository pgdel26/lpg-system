export const fmt = (n: number | null | undefined): string =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const today = (): string => new Date().toISOString().split("T")[0];

// Title-case a category key for display: "cylinder_deposit" → "Cylinder Deposit".
// Used wherever a raw category/section key is shown to the user (refunds, reports,
// transaction rows). Section headers use their own uppercase label instead.
export const titleCaseCategory = (category: string): string =>
  category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Display label for a sale/purchase SECTION key.
 *
 * "cylinderWithRefill" and "refill" are structural section keys with
 * established names — the distinction between buying a cylinder outright and
 * paying for gas only. Everything else is a single-price category key (see
 * safe-category-change), so it title-cases.
 *
 * This existed verbatim in four places (salesReport, incomeStatement,
 * outletExport, OutletPage) before the Customer Orders report needed a fifth.
 * One copy, so the two names can't drift between the screens and the exports.
 */
export const saleSectionLabel = (section: string): string => {
  if (section === "cylinderWithRefill") return "Full Cylinder";
  if (section === "refill") return "Refill";
  return titleCaseCategory(section);
};

// Canonical per-category color, shared by the Inventory sections and the
// Products/Pricing tabs so a category renders the same color everywhere.
// cylinder/accessories keep their historical colors; any other category gets a
// stable color derived from its name — NOT from iteration order, which used to
// diverge between screens.
const CATEGORY_BASE_COLORS: Record<string, string> = { cylinder: "#f59e42", accessories: "#22c55e" };
const EXTRA_CATEGORY_COLORS = ["#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16"];
export const categoryColor = (category: string): string => {
  if (CATEGORY_BASE_COLORS[category]) return CATEGORY_BASE_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return EXTRA_CATEGORY_COLORS[hash % EXTRA_CATEGORY_COLORS.length];
};

interface PriceEntry {
  cylinder?: number;
  refill?: number;
  srp?: number;
}

// Get SRP from pricebook prices based on sale section type
export const getPricebookSrp = (
  sectionKey: string,
  productKey: string,
  prices: Record<string, unknown> | undefined
): number => {
  const entry = prices?.[productKey] as PriceEntry | undefined;
  if (!entry) return 0;
  if (sectionKey === "cylinderWithRefill") return (entry.cylinder || 0) + (entry.refill || 0);
  if (sectionKey === "refill") return entry.refill || 0;
  return entry.srp || 0; // accessories
};

interface FirestoreTimestampLike {
  toDate(): Date;
}

export const formatDate = (d: FirestoreTimestampLike | string | null | undefined): string => {
  if (!d) return "";
  const date = (d as FirestoreTimestampLike).toDate
    ? (d as FirestoreTimestampLike).toDate()
    : new Date(d as string);
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

// For a bare "YYYY-MM-DD" string (not a Firestore Timestamp or full ISO
// datetime) — new Date("YYYY-MM-DD") parses as UTC and can render as the
// wrong calendar day depending on the browser's timezone, so this parses
// with an explicit local-midnight time component instead.
export const formatDateShort = (dateStr: string): string =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

// Shared "This Month"/"Last Month" date-range presets — used by any screen
// with a From/To filter (Income Statement, Purchases) so the two can't drift
// into different definitions of "this month."
const pad2 = (n: number): string => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number): string => `${y}-${pad2(m)}-${pad2(d)}`;

export function presetThisMonth(todayStr: string): { start: string; end: string } {
  const [y, m] = todayStr.split("-").map(Number);
  return { start: ymd(y, m, 1), end: todayStr };
}

export function presetLastMonth(todayStr: string): { start: string; end: string } {
  const [y, m] = todayStr.split("-").map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const lastDay = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  return { start: ymd(prevY, prevM, 1), end: ymd(prevY, prevM, lastDay) };
}
