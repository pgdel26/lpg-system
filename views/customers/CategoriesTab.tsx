import { useState, useMemo } from "react";
import { EditIcon, TrashIcon } from "../../components/Icons";
import ConfirmModal from "../../components/ConfirmModal";
import type { Customer, CustomerCategory } from "../../lib/types";
import styles from "./CategoriesTab.module.css";

interface CategoriesTabProps {
  customers: Customer[];
  customerCategories: CustomerCategory[];
  onUpdateCategory: (categoryId: string, name: string) => Promise<boolean>;
  onDeleteCategory: (categoryId: string) => Promise<boolean>;
}

export default function CategoriesTab({
  customers,
  customerCategories,
  onUpdateCategory,
  onDeleteCategory,
}: CategoriesTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CustomerCategory | null>(null);

  // How many customers each label holds — the one figure that makes this list
  // worth looking at, and what tells the operator whether a category can be
  // deleted before they try.
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of customers) {
      if (!c.categoryId) continue;
      counts.set(c.categoryId, (counts.get(c.categoryId) || 0) + 1);
    }
    return counts;
  }, [customers]);

  // Reuses the count map above rather than a .some() per customer: that was a
  // customers × categories scan on every keystroke elsewhere on the page.
  const uncategorised = useMemo(() => {
    const known = new Set(customerCategories.map((c) => c.id));
    return customers.filter((c) => !c.categoryId || !known.has(c.categoryId)).length;
  }, [customers, customerCategories]);

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const ok = await onUpdateCategory(editingId, editName);
    if (!ok) return; // name taken — leave the row open so the toast reads against it
    setEditingId(null);
    setEditName("");
  };

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.toolbarNote}>
          {customerCategories.length === 0
            ? "No categories yet."
            : `${customerCategories.length} categor${customerCategories.length === 1 ? "y" : "ies"} • ${uncategorised.toLocaleString("en-PH")} customer${uncategorised === 1 ? "" : "s"} uncategorised`}
        </div>
      </div>

      <div className={styles.tableHeader}>
        <span>Category</span>
        <span>Customers</span>
        <span />
      </div>

      {customerCategories.length === 0 ? (
        <div className={styles.emptyState}>
          No categories yet. Use &ldquo;Add Category&rdquo; above, then file customers into
          it from the Customers tab — or file many at once with Bulk Assign Categories.
        </div>
      ) : (
        customerCategories.map((cat) => {
          const count = countByCategory.get(cat.id) || 0;

          if (editingId === cat.id) {
            return (
              <div key={cat.id} className={styles.editRow}>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") { setEditingId(null); setEditName(""); }
                  }}
                  autoFocus
                  className={styles.editInput}
                />
                <div className={styles.editButtons}>
                  <button
                    onClick={() => { setEditingId(null); setEditName(""); }}
                    className={styles.cancelButton}
                  >
                    Cancel
                  </button>
                  <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                </div>
              </div>
            );
          }

          return (
            <div key={cat.id} className={styles.catRow}>
              <span className={styles.catName}>{cat.name}</span>
              <span className={styles.catCount}>
                {count.toLocaleString("en-PH")}
              </span>
              <div className={styles.actionsCell}>
                <button
                  onClick={() => { setEditingId(cat.id); setEditName(cat.name || ""); }}
                  className={styles.iconButton}
                  title="Rename"
                >
                  <EditIcon />
                </button>
                {/* Disabled rather than hidden while customers are filed here:
                    the reason it can't be deleted is the number in the column
                    beside it, and hiding the button would leave that unsaid.
                    The hook refuses this write too — the disabled attribute is
                    a courtesy, not the guard. */}
                <button
                  onClick={() => setPendingDelete(cat)}
                  className={styles.iconButton}
                  disabled={count > 0}
                  title={count > 0
                    ? `${count} customer${count === 1 ? " is" : "s are"} in this category — move them first`
                    : "Delete"}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        })
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete Category"
          message={`Delete "${pendingDelete.name}"? Customers are not deleted — this only removes the label.`}
          confirmLabel="Delete"
          onConfirm={() => { void onDeleteCategory(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
