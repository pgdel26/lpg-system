import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { EditIcon, TrashIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";

export default function AuditPage({
  inventorySections, staff,
}) {
  const [auditRecords, setAuditRecords] = useState([]);
  const [staffByDate, setStaffByDate] = useState({}); // date -> { cashier, staffOnDuty: [] }
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState(null); // `${date}_${section}_${product}`
  const [hoveredStaffDate, setHoveredStaffDate] = useState(null);
  const [editValues, setEditValues] = useState({ aud: "", reason: "" });
  const [pendingDelete, setPendingDelete] = useState(null); // record object
  const [saving, setSaving] = useState(false);

  // Fetch ALL audit records across all dates
  useEffect(() => {
    let cancelled = false;
    const fetchAudits = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, "dailyInventory"));

        const dateSet = new Set();
        const rawRecords = [];

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const sectionKey = data.section;
          const date = data.date;
          const section = inventorySections.find((s) => s.key === sectionKey);
          if (!section) return;

          const items = data.items || {};
          for (const [product, row] of Object.entries(items)) {
            if (row.aud == null || row.aud === "") continue;

            const resolvedRow = { ...row };
            const endVal = section.calcEnd ? section.calcEnd(resolvedRow) : (resolvedRow.end || 0);
            const audVal = parseFloat(row.aud) || 0;
            const variance = audVal - endVal;

            dateSet.add(date);
            rawRecords.push({
              date,
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

        const cashierMap = {};
        const staffDateMap = {};
        const dateArray = Array.from(dateSet);
        await Promise.all(dateArray.map(async (date) => {
          try {
            const reportSnap = await getDoc(doc(db, "dailyReport", date));
            if (reportSnap.exists()) {
              const reportData = reportSnap.data();
              const staffList = staff || [];
              const cashierMember = staffList.find((s) => s.id === reportData.cashier);
              cashierMap[date] = cashierMember?.name || "";
              const dutyNames = (reportData.staff || [])
                .map((id) => staffList.find((s) => s.id === id)?.name)
                .filter(Boolean);
              staffDateMap[date] = { cashier: cashierMember?.name || "", staffOnDuty: dutyNames };
            }
          } catch { /* ignore */ }
        }));

        if (!cancelled) setStaffByDate(staffDateMap);

        const records = rawRecords.map((r) => ({
          ...r,
          cashier: cashierMap[r.date] || "",
        }));

        const sectionOrder = inventorySections.map((s) => s.key);
        records.sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
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
  }, [inventorySections, staff]);

  const getRecordKey = (rec) => `${rec.date}_${rec.section}_${rec.product}`;

  const handleEditStart = (rec) => {
    setEditingKey(getRecordKey(rec));
    setEditValues({ aud: String(rec.aud), reason: rec.reason });
    setConfirmDeleteKey(null);
  };

  const handleEditCancel = () => {
    setEditingKey(null);
    setEditValues({ aud: "", reason: "" });
  };

  const handleEditSave = async (rec) => {
    setSaving(true);
    try {
      const docId = `${rec.date}_${rec.section}`;
      const newAud = editValues.aud === "" ? "" : parseFloat(editValues.aud) || 0;
      await updateDoc(doc(db, "dailyInventory", docId), {
        [`items.${rec.product}.aud`]: newAud,
        [`items.${rec.product}.audReason`]: editValues.reason,
      });
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
      console.log("Deleting audit:", { docId, product: rec.product });
      const docRef = doc(db, "dailyInventory", docId);
      // Read current doc, clear aud fields, write back entire items map
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        const items = { ...data.items };
        if (items[rec.product]) {
          delete items[rec.product].aud;
          delete items[rec.product].audReason;
        }
        await updateDoc(docRef, { items });
        console.log("Delete successful");
      }
      setAuditRecords((prev) => prev.filter((r) => getRecordKey(r) !== getRecordKey(rec)));
      setPendingDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setSaving(false);
    }
  };

  // Group records by date
  const groupedByDate = [];
  let currentDate = null;
  for (const rec of auditRecords) {
    if (rec.date !== currentDate) {
      currentDate = rec.date;
      groupedByDate.push({ date: rec.date, cashier: rec.cashier, records: [] });
    }
    groupedByDate[groupedByDate.length - 1].records.push(rec);
  }

  const iconBtnStyle = {
    background: "none", border: "none", cursor: "pointer", padding: "2px",
    color: "var(--text-dim)", display: "flex",
  };

  return (
    <div className="animate-fade">
      {loading && (
        <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-muted)" }}>
          Loading audit records...
        </div>
      )}

      {!loading && auditRecords.length === 0 && (
        <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--text-dim)" }}>
          No audit records found.
        </div>
      )}

      {!loading && groupedByDate.map((group) => (
        <div key={group.date} style={{ marginBottom: "24px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px", flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              {group.date}
            </span>
            {group.cashier && (
              <span style={{
                fontSize: "11px", fontWeight: 600, color: "var(--accent-blue)",
                padding: "3px 10px", borderRadius: "6px",
                background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.12)",
              }}>
                Cashier: {group.cashier}
              </span>
            )}
            {staffByDate[group.date] && (
              <div
                style={{ position: "relative", display: "inline-flex" }}
                onMouseEnter={() => setHoveredStaffDate(group.date)}
                onMouseLeave={() => setHoveredStaffDate(null)}
              >
                <button style={{
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  padding: "3px 10px", borderRadius: "6px", border: "1px solid var(--border-light)",
                  background: "transparent", cursor: "default",
                  fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  Staff on Duty
                </button>
                {hoveredStaffDate === group.date && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
                    background: "var(--bg-secondary)", border: "1px solid var(--border)",
                    borderRadius: "10px", padding: "12px 14px",
                    boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
                    minWidth: "160px", whiteSpace: "nowrap",
                  }}>
                    {staffByDate[group.date].staffOnDuty.length > 0 ? (
                      staffByDate[group.date].staffOnDuty.map((name) => (
                        <div key={name} style={{
                          display: "flex", alignItems: "center", gap: "7px",
                          padding: "4px 0", fontSize: "12px", color: "var(--text-secondary)",
                        }}>
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "var(--accent-blue)", flexShrink: 0 }} />
                          {name}
                        </div>
                      ))
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--text-dim)" }}>No staff recorded</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

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
                {group.records.map((rec) => {
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
        </div>
      ))}

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
