// A plain module, not a hook: lib/receivables and lib/reports both group by
// customer and both are imported by the admin-SDK cron route, where pulling in
// a React module fails the build.

/** Canonical "is this the same customer" key.
 *
 *  Normalizes case and whitespace ONLY — not punctuation, so "SHAKEYS" and
 *  "SHAKEY'S" remain distinct. That is a known limitation, not an oversight:
 *  collapsing punctuation would also merge genuinely different accounts, and
 *  the call belongs to the operator. */
export function customerKey(name: string): string {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** The shape lib/hooks/useCustomersData matches against — the fields identity uses. */
interface CustomerIdentity {
  id: string;
  name: string;
  phone?: string;
  categoryId?: string;
}

/**
 * The existing customer a new (name, category) pair should be FILED UNDER, or
 * null when it is genuinely someone new.
 *
 * Identity used to be the name alone. The owner added categories and asked for
 * "same name and same category → merge with the original", which makes the pair
 * the identity: two different businesses can share a name and be told apart by
 * how they are filed.
 *
 * UNCATEGORISED IS A WILDCARD, not a third value. That is the load-bearing
 * decision here, and it exists because every customer in the database today is
 * uncategorised: treating "" as a category of its own would mean typing a known
 * name plus a category created a SECOND record of someone who already exists,
 * quietly undoing the duplicate cleanup that took hundreds of merges. So:
 *
 *   - same name, same category            → that record
 *   - same name, existing is uncategorised → that record (caller backfills the
 *                                            category, the same blank-only rule
 *                                            phone already follows)
 *   - same name, caller gave no category   → that record
 *   - same name, both categorised, differ  → null, a genuinely different customer
 *
 * Only the last case creates a second row, and it takes a deliberate act: both
 * records must carry a category, and they must disagree.
 */
export function matchCustomer<T extends CustomerIdentity>(
  customers: T[],
  name: string,
  categoryId?: string,
): T | null {
  const key = customerKey(name);
  if (!key) return null;
  const sameName = customers.filter((c) => customerKey(c.name) === key);
  if (sameName.length === 0) return null;

  const wanted = categoryId || "";
  // An exact category match always wins, even when an uncategorised record with
  // the same name also exists — the filed one is the better answer.
  const exact = sameName.find((c) => (c.categoryId || "") === wanted);
  if (exact) return exact;

  // No category asked for: fall back to the old name-only identity.
  if (!wanted) return sameName[0];

  // A category was asked for and nobody matches it — reuse an unfiled record of
  // that name if there is one, so filing an existing customer is a backfill
  // rather than a duplicate.
  return sameName.find((c) => !c.categoryId) || null;
}

/**
 * Grouping key and label for a sale with no customer attached.
 *
 * Here rather than in each report: "(No customer)" appearing under two spellings
 * on two screens is the same class of split as a duplicate customer, and the
 * reports that need it are exactly the ones that already import customerKey.
 */
export const NO_CUSTOMER_KEY = "__none__";
export const NO_CUSTOMER_LABEL = "(No customer)";
