import React, { useState, useMemo } from "react";
import { fmt, formatDate } from "../lib/utils";
import { PlusIcon, PhoneIcon, EditIcon, TrashIcon, ChevronLeftIcon, HistoryIcon, DownloadIcon, SearchIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import AddCustomerModal from "../components/AddCustomerModal";
import ExportCustomerSalesModal from "../components/ExportCustomerSalesModal";
import type { Customer, CustomerTransaction } from "../lib/types";
import styles from "./CustomersPage.module.css";

const TYPE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  sale: { label: "Sale", bg: "rgba(16,185,129,0.08)", color: "#10b981" },
  swap: { label: "Swap", bg: "rgba(245,158,11,0.08)", color: "#f59e0b" },
  refund: { label: "Refund", bg: "rgba(239,68,68,0.08)", color: "#ef4444" },
};

interface CustomersPageProps {
  customers: Customer[];
  onAddCustomer: (name: string, phone: string) => Promise<void>;
  onUpdateCustomer: (customerId: string, data: { name: string; phone: string }) => Promise<void>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  onFetchCustomerTransactions: (customerId: string) => Promise<CustomerTransaction[]>;
}

export default function CustomersPage({
  customers,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onFetchCustomerTransactions,
}: CustomersPageProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  const startEdit = (cust: Customer) => {
    setEditingId(cust.id);
    setEditName(cust.name || "");
    setEditPhone(cust.phone || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditPhone("");
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await onUpdateCustomer(editingId, { name: editName, phone: editPhone });
    setEditingId(null);
    setEditName("");
    setEditPhone("");
  };

  const askDelete = (cust: Customer) => setPendingDelete(cust);

  const openCustomer = async (cust: Customer) => {
    setSelectedCustomer(cust);
    setLoadingTx(true);
    const txs = await onFetchCustomerTransactions(cust.id);
    setTransactions(txs);
    setLoadingTx(false);
  };

  const closeDetail = () => {
    setSelectedCustomer(null);
    setTransactions([]);
  };

  const getTxDescription = (tx: CustomerTransaction) => {
    if (tx.type === "sale") {
      return `${tx.product || "Item"} x${tx.quantity || 1}`;
    }
    if (tx.type === "swap") {
      return `${tx.productFrom || "?"} → ${tx.productTo || "?"}`;
    }
    if (tx.type === "refund") {
      return `${tx.product || tx.saleSection || "Refund"}${tx.quantity ? ` x${tx.quantity}` : ""}`;
    }
    return "";
  };

  const getTxAmount = (tx: CustomerTransaction): number => {
    if (tx.type === "sale") return (tx.totalAmount as number) || 0;
    if (tx.type === "swap") return (tx.price as number) || 0;
    if (tx.type === "refund") return (tx.totalRefund as number) || (tx.refundAmount as number) || 0;
    return 0;
  };

  // ---- Detail view ----
  if (selectedCustomer) {
    return (
      <div className="animate-fade">
        <button
          onClick={closeDetail}
          className={styles.backButton}
        >
          <ChevronLeftIcon /> Back to Customers
        </button>

        {/* Customer info header */}
        <div className={styles.detailCard}>
          <div className={styles.detailCardHeader}>
            <div>
              <h2 className={styles.detailName}>
                {selectedCustomer.name}
              </h2>
              <div className={styles.detailPhoneRow}>
                <PhoneIcon />
                <span className={styles.detailPhone}>
                  {selectedCustomer.phone || "—"}
                </span>
              </div>
            </div>
            <div className={styles.detailActions}>
              <button
                onClick={(e) => { e.stopPropagation(); startEdit(selectedCustomer); }}
                className={styles.editButton}
              >
                <EditIcon /> Edit
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); askDelete(selectedCustomer); }}
                className={styles.deleteButton}
              >
                <TrashIcon /> Delete
              </button>
            </div>
          </div>

          {/* Inline edit */}
          {editingId === selectedCustomer.id && (
            <div className={styles.inlineEditSection}>
              <div className={styles.inlineEditFields}>
                <div className={styles.inlineEditField}>
                  <span className={styles.editFieldLabel}>Name</span>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    autoFocus
                    className={styles.editInput}
                  />
                </div>
                <div className={styles.inlineEditField}>
                  <span className={styles.editFieldLabel}>Phone</span>
                  <input
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                    className={styles.editInput}
                  />
                </div>
                <div className={styles.editButtonGroup}>
                  <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                  <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Transaction history */}
        <div className={styles.txHistoryCard}>
          <div className={styles.txHistoryHeader}>
            <HistoryIcon />
            <span className={styles.txHistoryTitle}>
              Transaction History
            </span>
            {!loadingTx && (
              <span className={styles.txCount}>
                ({transactions.length})
              </span>
            )}
          </div>

          {loadingTx ? (
            <div className={styles.txLoading}>
              Loading transactions...
            </div>
          ) : transactions.length === 0 ? (
            <div className={styles.txEmpty}>
              No transactions found for this customer.
            </div>
          ) : (
            transactions.map((tx) => {
              const txStyle = TYPE_STYLES[tx.type as string] || TYPE_STYLES.sale;
              return (
                <div key={tx.id} className={styles.txRow}>
                  <div className={styles.txLeft}>
                    {/* tx badge: bg/color are data-driven — kept inline */}
                    <span
                      className={styles.txTypeBadge}
                      style={{ background: txStyle.bg, color: txStyle.color }}
                    >
                      {txStyle.label}
                    </span>
                    <span className={styles.txDesc}>
                      {getTxDescription(tx)}
                    </span>
                  </div>
                  <div className={styles.txRight}>
                    {/* amount color is data-driven (refund = red) — kept inline */}
                    <span
                      className={styles.txAmount}
                      style={{ color: tx.type === "refund" ? "#f87171" : "var(--text-primary)" }}
                    >
                      {tx.type === "refund" ? "-" : ""}{fmt(getTxAmount(tx))}
                    </span>
                    <span className={styles.txDate}>
                      {(tx.date as string) || ""}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {pendingDelete && (
          <ConfirmModal
            title="Delete Customer"
            message={`Are you sure you want to delete "${pendingDelete.name}"? This will also delete all sales, swaps, and refunds linked to this customer. This action cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={() => { onDeleteCustomer(pendingDelete.id); setPendingDelete(null); closeDetail(); }}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="animate-fade">
      {/* Header: search + action buttons */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>
            <SearchIcon />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name or phone..."
            className={styles.searchInput}
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className={styles.addButton}
        >
          <PlusIcon /> Add Customer
        </button>
        <button
          onClick={() => setShowExportModal(true)}
          className={styles.exportButton}
        >
          <DownloadIcon /> Export Customer Sales
        </button>
      </div>

      {/* Customer list */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span>Name</span>
          <span>Phone</span>
          <span />
        </div>

        {customers.length === 0 ? (
          <div className={styles.emptyState}>
            No customers yet. Click &ldquo;Add Customer&rdquo; above.
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className={styles.emptyState}>
            No customers match &ldquo;{searchQuery}&rdquo;.
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
                onClick={() => openCustomer(cust)}
                className={styles.custRow}
              >
                <div>
                  <span className={styles.custName}>
                    {cust.name}
                  </span>
                  {cust.createdAt && (
                    <span className={styles.custAddedDate}>
                      Added {formatDate(cust.createdAt)}
                    </span>
                  )}
                </div>
                <div className={styles.custPhoneRow}>
                  <PhoneIcon />
                  <span className={styles.custPhone}>
                    {cust.phone || "—"}
                  </span>
                </div>
                <div className={styles.custActionsCell}>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(cust); }} className={styles.iconButton} title="Edit">
                    <EditIcon />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); askDelete(cust); }} className={styles.iconButton} title="Delete">
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Delete Customer"
          message={`Are you sure you want to delete "${pendingDelete.name}"? This will also delete all sales, swaps, and refunds linked to this customer. This action cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeleteCustomer(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {showAddModal && (
        <AddCustomerModal
          onSubmit={(name, phone) => onAddCustomer(name, phone)}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showExportModal && (
        <ExportCustomerSalesModal
          customers={customers}
          onFetchCustomerTransactions={onFetchCustomerTransactions}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}
