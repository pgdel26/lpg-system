import { useMemo, useState } from "react";
import { XIcon, SearchIcon } from "./Icons";
import type { Customer, CustomerCategory } from "../lib/types";
import styles from "./BulkAssignCategoryModal.module.css";

/** Sentinel for the "clear the category" choice — "" already means "not chosen". */
const CLEAR = "__clear__";

interface BulkAssignCategoryModalProps {
  customers: Customer[];
  categories: CustomerCategory[];
  /** Resolves with how many were written. */
  onAssign: (customerIds: string[], categoryId: string) => Promise<number>;
  onClose: () => void;
}

/**
 * Files many customers into one category in a single pass.
 *
 * Exists because the per-row Category select is fine for one customer and
 * unusable for two hundred — which is the state every customer starts in.
 */
export default function BulkAssignCategoryModal({
  customers,
  categories,
  onAssign,
  onClose,
}: BulkAssignCategoryModalProps) {
  const [target, setTarget] = useState("");
  const [search, setSearch] = useState("");
  const [onlyUncategorised, setOnlyUncategorised] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => customers.filter((c) => {
      if (onlyUncategorised && c.categoryId) return false;
      if (!term) return true;
      return (c.name && c.name.toLowerCase().includes(term))
        || (c.phone && c.phone.toLowerCase().includes(term));
    }),
    [customers, term, onlyUncategorised],
  );

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // Adds the matching rows to the selection rather than replacing it, so two
  // searches in a row build one list — the usual way a bulk filing gets done.
  const selectVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    for (const c of visible) next.add(c.id);
    return next;
  });

  const handleAssign = async () => {
    if (!target || selected.size === 0 || saving) return;
    setSaving(true);
    const written = await onAssign([...selected], target === CLEAR ? "" : target);
    setSaving(false);
    // Left open on failure so the selection someone just built isn't lost.
    if (written > 0) onClose();
  };

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Bulk Assign Categories</h3>
          <button onClick={onClose} className={styles.closeButton}><XIcon /></button>
        </div>

        {/* The destination first: it is the decision this dialog exists to
            make, and picking it before the names keeps "assign to what?" from
            being the question left over at the end. */}
        <div className={styles.field}>
          <label className={styles.label}>Assign to *</label>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className={styles.input}
            autoFocus
          >
            <option value="">Choose a category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={CLEAR}>— Clear the category —</option>
          </select>
        </div>

        <div className={styles.pickerHead}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}><SearchIcon /></span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customers"
              className={styles.searchInput}
            />
          </div>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={onlyUncategorised}
              onChange={(e) => setOnlyUncategorised(e.target.checked)}
            />
            <span>Uncategorised only</span>
          </label>
        </div>

        <div className={styles.pickerActions}>
          <button type="button" className={styles.linkButton} onClick={selectVisible}>
            Select {term || onlyUncategorised ? "these" : "all"} ({visible.length.toLocaleString("en-PH")})
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setSelected(new Set())}
            disabled={selected.size === 0}
          >
            Clear selection
          </button>
        </div>

        <div className={styles.list}>
          {visible.length === 0 ? (
            <div className={styles.listEmpty}>No customer matches.</div>
          ) : visible.map((c) => (
            <label key={c.id} className={styles.row}>
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
              />
              <span className={styles.rowName}>{c.name}</span>
              {/* Their CURRENT category, so nobody re-files a customer who is
                  already where they belong — or moves one out of a category
                  without noticing. */}
              {c.categoryId && categoryName.has(c.categoryId) && (
                <span className={styles.rowBadge}>{categoryName.get(c.categoryId)}</span>
              )}
            </label>
          ))}
        </div>

        <div className={styles.actions}>
          {/* The count is on the button itself: this writes to every selected
              customer at once, and "Assign" alone would not say how many. */}
          <span className={styles.selectedNote}>
            {selected.size.toLocaleString("en-PH")} selected
          </span>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button
            onClick={handleAssign}
            className={styles.saveButton}
            disabled={!target || selected.size === 0 || saving}
          >
            {saving ? "Assigning…" : `Assign ${selected.size.toLocaleString("en-PH")}`}
          </button>
        </div>
      </div>
    </div>
  );
}
