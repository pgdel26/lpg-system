export const fmt = (n) =>
  "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const today = () => new Date().toISOString().split("T")[0];

// Get SRP from pricebook prices based on sale section type
export const getPricebookSrp = (sectionKey, productKey, prices) => {
  const entry = prices?.[productKey];
  if (!entry) return 0;
  if (sectionKey === "cylinderWithRefill") return (entry.cylinder || 0) + (entry.refill || 0);
  if (sectionKey === "refill") return entry.refill || 0;
  return entry.srp || 0; // accessories
};

export const formatDate = (d) => {
  if (!d) return "";
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};
