import React, { useState, useMemo } from "react";
import { PlusIcon, EditIcon, TrashIcon, XIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";

const editInputStyle = {
  padding: "6px 10px", borderRadius: "6px",
  background: "rgba(255,255,255,0.9)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "12px", outline: "none",
  fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

const modalInputStyle = {
  width: "100%", padding: "8px 12px", borderRadius: "8px",
  background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
  color: "var(--text-secondary)", fontSize: "13px", outline: "none",
  fontFamily: "inherit", boxSizing: "border-box",
};

export default function StaffPage({ staff, onAddStaff, onUpdateStaff, onDeleteStaff }) {
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return staff;
    const q = search.toLowerCase();
    return staff.filter((s) =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.role || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q)
    );
  }, [staff, search]);

  const startEdit = (s) => {
    setEditingId(s.id);
    setEditName(s.name || "");
    setEditRole(s.role || "");
    setEditPhone(s.phone || "");
  };

  const cancelEdit = () => { setEditingId(null); };

  const saveEdit = async () => {
    if (!editName.trim()) return;
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
      <div style={{
        display: "flex", gap: "10px", alignItems: "center", marginBottom: "20px",
      }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staff..."
          style={{
            flex: 1, padding: "10px 14px", borderRadius: "10px",
            background: "#fff", border: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: "13px", outline: "none",
            fontFamily: "inherit", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
          }}
        />
        <button
          onClick={openModal}
          style={{
            padding: "10px 20px", borderRadius: "10px", border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
            background: "var(--accent-blue)", color: "#fff",
            fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(37,99,235,0.3)", whiteSpace: "nowrap",
          }}
        >
          <PlusIcon /> Add Staff
        </button>
      </div>

      {/* Staff list */}
      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 80px",
          padding: "8px 14px", borderBottom: "1px solid var(--border)",
          fontSize: "10px", fontWeight: 600, color: "var(--text-dim)",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          <span>Name</span>
          <span>Role</span>
          <span>Contact</span>
          <span />
        </div>

        {filtered.length > 0 ? filtered.map((s) => {
          if (editingId === s.id) {
            return (
              <div key={s.id} style={{
                padding: "10px 14px", borderBottom: "1px solid rgba(15,23,42,0.04)",
                background: "rgba(59,130,246,0.03)",
              }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Name</span>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)}
                      style={{ ...editInputStyle, display: "block" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Role</span>
                    <input value={editRole} onChange={(e) => setEditRole(e.target.value)}
                      style={{ ...editInputStyle, display: "block" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: "9px", color: "var(--text-dim)", textTransform: "uppercase" }}>Contact</span>
                    <input value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                      style={{ ...editInputStyle, display: "block" }} />
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
                  <button onClick={cancelEdit} style={{
                    padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                    background: "transparent", cursor: "pointer", fontSize: "11px",
                    color: "var(--text-muted)", fontWeight: 600, fontFamily: "inherit",
                  }}>Cancel</button>
                  <button onClick={saveEdit} style={{
                    padding: "4px 12px", borderRadius: "6px", border: "none",
                    background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                    color: "#fff", fontWeight: 600, fontFamily: "inherit",
                  }}>Save</button>
                </div>
              </div>
            );
          }

          return (
            <div key={s.id} style={{
              display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 80px",
              padding: "10px 14px", alignItems: "center",
              borderBottom: "1px solid rgba(15,23,42,0.04)",
              fontSize: "12px",
            }}>
              <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{s.name}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>{s.role || "\u2014"}</span>
              <span style={{ color: "var(--text-muted)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>{s.phone || "\u2014"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                <button onClick={() => startEdit(s)} style={{
                  background: "none", border: "none", cursor: "pointer", padding: "2px",
                  color: "var(--text-dim)", display: "flex", alignItems: "center",
                }} title="Edit">
                  <EditIcon />
                </button>
                <button onClick={() => setPendingDelete(s)} style={{
                  background: "none", border: "none", cursor: "pointer", padding: "2px",
                  color: "var(--text-dim)", display: "flex", alignItems: "center",
                }} title="Delete">
                  <TrashIcon />
                </button>
              </div>
            </div>
          );
        }) : (
          <div style={{ padding: "24px 14px", textAlign: "center", fontSize: "12px", color: "var(--text-dim)" }}>
            {search.trim() ? "No staff matching your search." : "No staff added yet."}
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {modalOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1100,
            background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div style={{
            background: "var(--bg-secondary)", borderRadius: "16px",
            border: "1px solid var(--border)", padding: "24px",
            width: "100%", maxWidth: "420px",
            boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
                Add Staff
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
              >
                <XIcon />
              </button>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Name
              </label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Staff name"
                style={{ ...modalInputStyle, marginTop: "6px" }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Role
              </label>
              <input
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                placeholder="e.g. Cashier, Driver"
                style={{ ...modalInputStyle, marginTop: "6px" }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Contact Number
              </label>
              <input
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="09XX XXX XXXX"
                style={{ ...modalInputStyle, marginTop: "6px", fontFamily: "var(--font-mono)" }}
              />
            </div>

            {formError && (
              <p style={{ fontSize: "11px", color: "var(--accent-red)", marginBottom: "12px", fontWeight: 600 }}>
                {formError}
              </p>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setModalOpen(false)}
                style={{
                  padding: "8px 16px", borderRadius: "8px",
                  border: "1px solid var(--border-light)", background: "transparent",
                  cursor: "pointer", fontSize: "12px", fontWeight: 600,
                  color: "var(--text-muted)", fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                style={{
                  padding: "8px 20px", borderRadius: "8px", border: "none",
                  cursor: "pointer", fontSize: "12px", fontWeight: 700,
                  color: "#fff", fontFamily: "inherit",
                  background: "var(--accent-blue)",
                  boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
                }}
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
