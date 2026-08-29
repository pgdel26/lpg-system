import { useState, useMemo } from "react";
import { formatDate } from "../../lib/utils";
import { PhoneIcon, EditIcon, TrashIcon, SearchIcon } from "../../components/Icons";
import ConfirmModal from "../../components/ConfirmModal";
import type { Customer, CustomerCategory } from "../../lib/types";
import styles from "./CustomersTab.module.css";

/** Filter value for customers nobody has filed yet — most of them, at first. */
const UNCATEGORISED = "__none__";

interface CustomersTabProps {
  customers: Customer[];
  customerCategories: CustomerCategory[];
  onOpenCustomer: (customer: Customer) => void;
  onUpdateCustomer: (
    customerId: string,
    data: { name: string; phone: string; categoryId?: string },
  ) => Promise<boolean>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
}

export default function CustomersTab({
  customers,
  customerCategories,
  onOpenCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
}: CustomersTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);

  // Name lookup for the row badges. A Map, not a .find() per row: this list runs
  // to hundreds of customers and the badge is rendered on every one of them.
  const categoryName = useMemo(
    () => new Map(customerCategories.map((c) => [c.id, c.name])),
    [customerCategories],
  );

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((c) => {
      if (categoryFilter === UNCATEGORISED) {
        if (c.categoryId) return false;
      } else if (categoryFilter && c.categoryId !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (c.name && c.name.toLowerCase().includes(q))
        || (c.phone && c.phone.toLowerCase().includes(q));
    });
  }, [customers, searchQuery, categoryFilter]);

  const startEdit = (cust: Customer) => {
    setEditingId(cust.id);
    setEditName(cust.name || "");
    setEditPhone(cust.phone || "");
    setEditCategory(cust.categoryId || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
    setEditCategory("");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    const ok = await onUpdateCustomer(editingId, {
      name: editName, phone: editPhone, categoryId: editCategory,
    });
    // Rejected (e.g. name collision) — leave the row open so the toast is
    // legible against it.
    if (!ok) return;
    cancelEdit();
  };

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name or phone..."
            className={styles.searchInput}
          />
        </div>

        {/* A filing scheme nobody can filter by is decoration — this is what the
            categories are FOR. Hidden until at least one exists, so the screen
            doesn't offer an empty control on day one. */}
        {customerCategories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className={`${styles.filterSelect} ${categoryFilter ? styles.filterActive : ""}`}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {customerCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
            <option value={UNCATEGORISED}>Uncategorised</option>
          </select>
        )}
      </div>

      <div className={styles.tableHeader}>
        <span>Name</span>
        <span>Category</span>
        <span>Phone</span>
        <span />
      </div>

      {customers.length === 0 ? (
        <div className={styles.emptyState}>
          No customers yet. Use &ldquo;Add Customer&rdquo; above.
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className={styles.emptyState}>
          No customers match this search or filter.
        </div>
      ) : (
        filteredCustomers.map((cust) => {
          if (editingId === cust.id) {
            return (
              <div key={cust.id} className={styles.listEditRow}>
                <div className={styles.listEditFields}>
                  <div className={styles.inlineEditField}>
                    <span className={styles.editFieldLabelBlock}>Name</span>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      autoFocus
                      className={styles.editInput}
                    />
                  </div>
                  <div className={styles.inlineEditField}>
                    <span className={styles.editFieldLabelBlock}>Phone</span>
                    <input
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      className={styles.editInput}
                    />
                  </div>
                  <div className={styles.inlineEditField}>
                    <span className={styles.editFieldLabelBlock}>Category</span>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className={styles.editInput}
                    >
                      <option value="">Uncategorised</option>
                      {customerCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.editButtonGroupBottom}>
                    <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                    <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={cust.id}
              onClick={() => onOpenCustomer(cust)}
              className={styles.custRow}
            >
              <div>
                <span className={styles.custName}>{cust.name}</span>
                {cust.createdAt && (
                  <span className={styles.custAddedDate}>Added {formatDate(cust.createdAt)}</span>
                )}
              </div>
              <div>
                {/* A category deleted out from under a customer would leave an
                    ID with no name; that reads as uncategorised rather than as
                    a broken badge. */}
                {cust.categoryId && categoryName.has(cust.categoryId) ? (
                  <span className={styles.categoryBadge}>{categoryName.get(cust.categoryId)}</span>
                ) : (
                  <span className={styles.noCategory}>—</span>
                )}
              </div>
              <div className={styles.custPhoneRow}>
                <PhoneIcon />
                <span className={styles.custPhone}>{cust.phone || "—"}</span>
              </div>
              <div className={styles.custActionsCell}>
                <button onClick={(e) => { e.stopPropagation(); startEdit(cust); }} className={styles.iconButton} title="Edit">
                  <EditIcon />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setPendingDelete(cust); }} className={styles.iconButton} title="Delete">
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        })
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete Customer"
          message={`Are you sure you want to delete "${pendingDelete.name}"? This will also delete all sales, swaps, and refunds linked to this customer. This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeleteCustomer(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
