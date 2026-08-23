
// ---------------------------------------------------------------------------
// Expense categories.
//
// Pure module — no hooks, no Firestore — so the modal, the expense list and any
// report can share one definition rather than each hardcoding the labels. That
// matters here because the STORED value and the DISPLAYED label are different
// strings, and a second copy of the mapping is how they drift.
// ---------------------------------------------------------------------------

/**
 * Structural, not `Expense`/`Staff` from lib/types, so lib/reports/salesReport.ts
 * can call these with the looser shapes it reads out of the admin SDK. The real
 * domain types satisfy both — a required field is assignable to an optional one.
 */
export interface ExpenseLike {
  description?: string;
  category?: string;
  staffId?: string;
}

export interface StaffLike {
  id?: string;
  name?: string;
}

/** Stored on the document. Never rename these — a rename orphans history. */
export type ExpenseCategory = "salary" | "operating";

export interface ExpenseCategoryDef {
  value: ExpenseCategory;
  label: string;
  /** Salary is for a specific person, so the form demands one. */
  requiresStaff: boolean;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { value: "operating", label: "Operating Expense", requiresStaff: false },
  { value: "salary", label: "Salary", requiresStaff: true },
];

export function expenseCategoryLabel(category: string | undefined): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.value === category);
  if (found) return found.label;
  // Expenses recorded before this field existed carry no category. They are NOT
  // assumed to be operating expenses — guessing would put money in a bucket
  // nobody chose. They read as uncategorised until someone says otherwise.
  return category ? category : "Uncategorised";
}

export function categoryRequiresStaff(category: string | undefined): boolean {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.requiresStaff ?? false;
}

/** The staff member a salary expense is for, when there is one. */
export function expenseStaffName(
  expense: ExpenseLike,
  staff: StaffLike[],
): string | null {
  if (expense.category !== "salary" || !expense.staffId) return null;
  // The staff record is gone but the expense isn't. Say so rather than
  // rendering a blank name that looks like a data error.
  return staff.find((s) => s.id === expense.staffId)?.name ?? "(staff removed)";
}

/**
 * The three pieces an expense row shows, for a layout that has a primary line
 * and a smaller meta line beneath it.
 *
 * The staff name is resolved from the roster at READ time, never copied into the
 * expense document — so renaming a staff member updates their historical salary
 * lines instead of leaving a stale name written into each one.
 */
export interface ExpenseRowLabels {
  /** The primary line: "MARIA SANTOS — Rice allowance", "Gas", "MARIA SANTOS". */
  primary: string;
  /** The meta line. Always present. */
  category: string;
}

export function expenseRowLabels(
  expense: ExpenseLike,
  staff: StaffLike[],
): ExpenseRowLabels {
  const typed = (expense.description || "").trim();
  const staffName = expenseStaffName(expense, staff);
  const category = expenseCategoryLabel(expense.category);

  // A salary is about a PERSON, so the name leads and the description — which
  // is optional, because the person already identifies the row — qualifies it.
  if (staffName) return { primary: typed ? `${staffName} — ${typed}` : staffName, category };
  return { primary: typed || "(No description)", category };
}

/**
 * The same information flattened to ONE string, for lists with no room for a
 * meta line (the dashboard's Expenses card, the Income Statement breakdown).
 */
export function expenseDisplayLabel(
  expense: ExpenseLike,
  staff: StaffLike[],
): string {
  const { primary, category } = expenseRowLabels(expense, staff);
  // No meta line here, so a bare staff name needs the category in front of it
  // to read as a salary at all. Anything with a description explains itself.
  if (!(expense.description || "").trim() && expenseStaffName(expense, staff)) {
    return `${category} — ${primary}`;
  }
  return primary;
}
