import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, deleteField, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { EditIcon, TrashIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import { today } from "../lib/utils";

export default function AuditPage({
  inventorySections, staff,
}) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [auditRecords, setAuditRecords] = useState([]);
  const [staffInfo, setStaffInfo] = useState(null); // { cashier, staffOnDuty: [] }
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [editValues, setEditValues] = useState({ aud: "", reason: "" });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [saving, setSaving] = useState(false);

  // Fetch audit records for the selected date
  useEffect(() => {
    let cancelled = false;
    const fetchAudits = async () => {
      setLoading(true);
      setEditingKey(null);
      try {
        const q = query(collection(db, "dailyInventory"), where("date", "==", selectedDate));
        const snap = await getDocs(q);

        const records = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const sectionKey = data.section;
          const section = inventorySections.find((s) => s.key === sectionKey);
          if (!section) return;

          const items = data.items || {};
          for (const [product, row] of Object.entries(items)) {
            if (row.aud == null || row.aud === "") continue;

            const resolvedRow = { ...row };
            const endVal = section.calcEnd ? section.calcEnd(resolvedRow) : (resolvedRow.end || 0);
            const audVal = parseFloat(row.aud) || 0;
            const variance = audVal - endVal;

            records.push({
              date: selectedDate,
              section: sectionKey,
              sectionLabel: section.label,
              sectionColor: section.color,
              product,
              end: endVal,
              aud: audVal,
              variance,
              reason: row.audReason || "",
            });
          }
        });

        // Fetch staff info for this date
        try {
          const reportSnap = await getDoc(doc(db, "dailyReport", selectedDate));
          if (reportSnap.exists()) {
            const reportData = reportSnap.data();
            const staffList = staff || [];
            const cashierMember = staffList.find((s) => s.id === reportData.cashier);
            const dutyNames = (reportData.staff || [])
              .map((id) => staffList.find((s) => s.id === id)?.name)
              .filter(Boolean);
            if (!cancelled) setStaffInfo({ cashier: cashierMember?.name || "", staffOnDuty: dutyNames });
          } else {
            if (!cancelled) setStaffInfo(null);
          }
        } catch {
          if (!cancelled) setStaffInfo(null);
        }

        const sectionOrder = inventorySections.map((s) => s.key);
        records.sort((a, b) => {
          const sa = sectionOrder.indexOf(a.section);
          const sb = sectionOrder.indexOf(b.section);
          if (sa !== sb) return sa - sb;
          return a.product.localeCompare(b.product);
        });

        if (!cancelled) setAuditRecords(records);
      } catch (err) {
        console.error("Error fetching audit records:", err);
        if (!cancelled) setAuditRecords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAudits();
    return () => { cancelled = true; };
  }, [selectedDate, inventorySections, staff]);

  const getRecordKey = (rec) => `${rec.date}_${rec.section}_${rec.product}`;

  const handleEditStart = (rec) => {
    setEditingKey(getRecordKey(rec));
    setEditValues({ aud: String(rec.aud), reason: rec.reason });
  };

  const handleEditCancel = () => {
    setEditingKey(null);
    setEditValues({ aud: "", reason: "" });
  };

  const handleEditSave = async (rec) => {
    setSaving(true);
    try {
      const docId = `${rec.date}_${rec.section}`;
      const audEmpty = editValues.aud === "";
      const newAud = audEmpty ? "" : parseFloat(editValues.aud) || 0;
      // Write via a nested object (object keys are dot-safe) instead of a dotted
      // field-path string like `items.2.7KG.aud`, which Firestore would mis-parse as
      // items > 2 > 7KG. Cleared values use deleteField() so they're actually removed.
      await setDoc(doc(db, "dailyInventory", docId), {
        items: {
          [rec.product]: {
            aud: audEmpty ? deleteField() : newAud,
            audReason: editValues.reason ? editValues.reason : deleteField(),
          },
        },
      }, { merge: true });
      const newAudNum = parseFloat(newAud) || 0;
      const newVariance = newAudNum - rec.end;
      setAuditRecords((prev) => prev.map((r) =>
        getRecordKey(r) === getRecordKey(rec)
          ? { ...r, aud: newAudNum, variance: newVariance, reason: editValues.reason }
          : r
      ));
      setEditingKey(null);
    } catch (err) {
      console.error("Edit save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rec) => {
    setSaving(true);
    try {
      const docId = `${rec.date}_${rec.section}`;
      const docRef = doc(db, "dailyInventory", docId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const items = { ...data.items };
        if (items[rec.product]) {
          delete items[rec.product].aud;
          delete items[rec.product].audReason;
        }
        await updateDoc(docRef, { items });
      }
      setAuditRecords((prev) => prev.filter((r) => getRecordKey(r) !== getRecordKey(rec)));
      setPendingDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setSaving(false);
    }
  };

  const iconBtnStyle = {
    background: "none", border: "none", cursor: "pointer", padding: "2px",
    color: "var(--text-dim)", display: "flex",
  };

  return (
    <div className="animate-fade">
      {/* Date picker */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: "8px",
            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
            color: "var(--text-secondary)", fontSize: "13px",
            fontFamily: "var(--font-mono)", outline: "none",
          }}
        />
        {staffInfo && staffInfo.cashier && (
          <span style={{
            fontSize: "11px", fontWeight: 600, color: "var(--accent-blue)",
            padding: "3px 10px", borderRadius: "6px",
            background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.12)",
          }}>
            Cashier: {staffInfo.cashier}
          </span>
        )}
        {staffInfo && staffInfo.staffOnDuty.length > 0 && (
          <span style={{
            fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
            padding: "3px 10px", borderRadius: "6px",
            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
          }}>
            Staff: {staffInfo.staffOnDuty.join(", ")}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-muted)" }}>
          Loading audit records...
        </div>
      )}

      {!loading && auditRecords.length === 0 && (
        <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
          No audit records found for {selectedDate}.
        </div>
      )}

      {!loading && auditRecords.length > 0 && (
        <div style={{
          overflowX: "auto", borderRadius: "12px",
          border: "1px solid var(--border)", background: "var(--bg-card)",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Section</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Product</th>
                <th style={{ padding: "10px 6px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>END</th>
                <th style={{ padding: "10px 6px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "#22c55e", textTransform: "uppercase" }}>AUD</th>
                <th style={{ padding: "10px 6px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--accent-orange)", textTransform: "uppercase" }}>DIFF</th>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Reason</th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}></th>
              </tr>
            </thead>
            <tbody>
              {auditRecords.map((rec) => {
                const key = getRecordKey(rec);
                const isEditing = editingKey === key;
                if (isEditing) {
                  const previewAud = editValues.aud === "" ? null : parseFloat(editValues.aud) || 0;
                  const previewVariance = previewAud != null ? previewAud - rec.end : null;
                  return (
                    <tr key={key} style={{ borderBottom: "1px solid rgba(15,23,42,0.04)", background: "rgba(59,130,246,0.03)" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: rec.sectionColor, flexShrink: 0 }} />
                          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>{rec.sectionLabel}</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>{rec.product}</td>
                      <td style={{ padding: "6px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>{rec.end}</td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>
                        <input
                          type="number"
                          value={editValues.aud}
                          onChange={(e) => setEditValues((v) => ({ ...v, aud: e.target.value }))}
                          autoFocus
                          style={{
                            width: "60px", padding: "4px 6px", borderRadius: "6px", textAlign: "center",
                            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                            color: "var(--text-secondary)", fontSize: "12px", outline: "none",
                            fontFamily: "var(--font-mono)",
                          }}
                        />
                      </td>
                      <td style={{
                        padding: "6px 6px", textAlign: "center", fontSize: "12px",
                        fontFamily: "var(--font-mono)", fontWeight: 700,
                        color: previewVariance == null ? "var(--text-dim)" : previewVariance > 0 ? "#4ade80" : previewVariance < 0 ? "#f87171" : "var(--text-dim)",
                      }}>
                        {previewVariance != null ? (previewVariance > 0 ? `+${previewVariance}` : previewVariance) : "—"}
                      </td>
                      <td style={{ padding: "4px 6px" }}>
                        <input
                          type="text"
                          value={editValues.reason}
                          onChange={(e) => setEditValues((v) => ({ ...v, reason: e.target.value }))}
                          placeholder="Reason..."
                          style={{
                            width: "100%", padding: "4px 8px", borderRadius: "6px", minWidth: "120px",
                            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
                            color: "var(--text-secondary)", fontSize: "11px", outline: "none",
                            fontFamily: "inherit",
                          }}
                        />
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button onClick={handleEditCancel} disabled={saving} style={{
                            padding: "4px 12px", borderRadius: "6px", border: "1px solid var(--border-light)",
                            background: "transparent", cursor: "pointer", fontSize: "11px",
                            color: "var(--text-muted)", fontFamily: "inherit",
                          }}>Cancel</button>
                          <button onClick={() => handleEditSave(rec)} disabled={saving} style={{
                            padding: "4px 12px", borderRadius: "6px", border: "none",
                            background: "var(--accent-blue)", cursor: "pointer", fontSize: "11px",
                            color: "#fff", fontWeight: 600, fontFamily: "inherit",
                          }}>Save</button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={key} style={{
                    borderBottom: "1px solid rgba(15,23,42,0.04)",
                    background: rec.variance !== 0 ? "rgba(239,68,68,0.02)" : "transparent",
                  }}>
                    <td style={{ padding: "8px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: rec.sectionColor, flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                          {rec.sectionLabel}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {rec.product}
                    </td>
                    <td style={{ padding: "6px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-secondary)" }}>
                      {rec.end}
                    </td>
                    <td style={{ padding: "6px 6px", textAlign: "center", fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 700, color: "#22c55e" }}>
                      {rec.aud}
                    </td>
                    <td style={{
                      padding: "6px 6px", textAlign: "center", fontSize: "12px",
                      fontFamily: "var(--font-mono)", fontWeight: 700,
                      color: rec.variance > 0 ? "#4ade80" : rec.variance < 0 ? "#f87171" : "var(--text-dim)",
                    }}>
                      {rec.variance > 0 ? `+${rec.variance}` : rec.variance}
                    </td>
                    <td style={{ padding: "8px 12px", fontSize: "11px", color: rec.reason ? "var(--text-secondary)" : "var(--text-dim)" }}>
                      {rec.reason || "—"}
                    </td>
                    <td style={{ padding: "4px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "2px", justifyContent: "center" }}>
                        <button onClick={() => handleEditStart(rec)} style={iconBtnStyle} title="Edit">
                          <EditIcon />
                        </button>
                        <button onClick={() => { setPendingDelete(rec); setEditingKey(null); }} style={iconBtnStyle} title="Delete">
                          <TrashIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Delete Audit Record"
          message={`Delete audit for "${pendingDelete.product}" on ${pendingDelete.date}? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
