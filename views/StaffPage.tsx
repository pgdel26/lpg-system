import React, { useState, useMemo } from "react";
import { PlusIcon, EditIcon, TrashIcon, XIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import type { Staff } from "../lib/types";
import styles from "./StaffPage.module.css";

interface StaffPageProps {
  staff: Staff[];
  onAddStaff: (name: string, role: string, phone: string) => Promise<void>;
  onUpdateStaff: (staffId: string, data: { name: string; role: string; phone: string }) => Promise<void>;
  onDeleteStaff: (staffId: string) => Promise<void>;
}

export default function StaffPage({ staff, onAddStaff, onUpdateStaff, onDeleteStaff }: StaffPageProps) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Staff | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return staff;
    const q = search.toLowerCase();
    return staff.filter((s) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.role || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q)
    );
  }, [staff, search]);

  const startEdit = (s: Staff) => {
    setEditingId(s.id);
    setEditName(s.name || "");
    setEditRole(s.role || "");
    setEditPhone(s.phone || "");
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    await onUpdateStaff(editingId, { name: editName, role: editRole, phone: editPhone });
    setEditingId(null);
  };

  const handleAdd = () => {
    setFormError("");
    if (!formName.trim()) { setFormError("Please enter a name."); return; }
    onAddStaff(formName.trim(), formRole.trim(), formPhone.trim());
    setFormName("");
    setFormRole("");
    setFormPhone("");
    setModalOpen(false);
  };

  const openModal = () => {
    setFormName(""); setFormRole(""); setFormPhone(""); setFormError("");
    setModalOpen(true);
  };

  return (
    <div className="animate-fade">
      {/* Search + Add button */}
      <div className={styles.toolbar}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staff..."
          className={styles.searchInput}
        />
        <button
          onClick={openModal}
          className={styles.addButton}
        >
          <PlusIcon /> Add Staff
        </button>
      </div>

      {/* Staff list */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <span>Name</span>
          <span>Role</span>
          <span>Contact</span>
          <span />
        </div>

        {filtered.length > 0 ? filtered.map((s) => {
          if (editingId === s.id) {
            return (
              <div key={s.id} className={styles.editRow}>
                <div className={styles.editFields}>
                  <div className={styles.editField}>
                    <span className={styles.editFieldLabel}>Name</span>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      className={styles.editInput} />
                  </div>
                  <div className={styles.editField}>
                    <span className={styles.editFieldLabel}>Role</span>
                    <input value={editRole} onChange={(e) => setEditRole(e.target.value)}
                      className={styles.editInput} />
                  </div>
                  <div className={styles.editField}>
                    <span className={styles.editFieldLabel}>Contact</span>
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                      className={styles.editInput} />
                  </div>
                </div>
                <div className={styles.editActions}>
                  <button onClick={cancelEdit} className={styles.cancelButton}>Cancel</button>
                  <button onClick={saveEdit} className={styles.saveButton}>Save</button>
                </div>
              </div>
            );
          }

          return (
            <div key={s.id} className={styles.tableRow}>
              <span className={styles.staffName}>{s.name}</span>
              <span className={styles.staffRole}>{s.role || "\u2014"}</span>
              <span className={styles.staffPhone}>{s.phone || "\u2014"}</span>
              <div className={styles.actionsCell}>
                <button onClick={() => startEdit(s)} className={styles.iconButton} title="Edit">
                  <EditIcon />
                </button>
                <button onClick={() => setPendingDelete(s)} className={styles.iconButton} title="Delete">
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        }) : (
          <div className={styles.emptyState}>
            {search.trim() ? "No staff matching your search." : "No staff added yet."}
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {modalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Add Staff
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className={styles.modalCloseButton}
              >
                <XIcon />
              </button>
            </div>

            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                Name
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Staff name"
                className={styles.modalInput}
                autoFocus
              />
            </div>

            <div className={styles.modalField}>
              <label className={styles.modalLabel}>
                Role
              </label>
              <input
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                placeholder="e.g. Cashier, Driver"
                className={styles.modalInput}
              />
            </div>

            <div className={styles.modalFieldLast}>
              <label className={styles.modalLabel}>
                Contact Number
              </label>
              <input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="09XX XXX XXXX"
                className={`${styles.modalInput} ${styles.modalInputMono}`}
              />
            </div>

            {formError && (
              <p className={styles.formError}>
                {formError}
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                onClick={() => setModalOpen(false)}
                className={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className={styles.modalSubmitButton}
              >
                Add Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete Staff"
          message={`Are you sure you want to delete "${pendingDelete.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeleteStaff(pendingDelete.id); setPendingDelete(null); }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
