export const fmt = (n: number | null | undefined): string =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const today = (): string => new Date().toISOString().split("T")[0];

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
