import { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, deleteField, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { EditIcon, TrashIcon } from "../../components/Icons";
import ConfirmModal from "../../components/ConfirmModal";
import { today } from "../../lib/utils";
import type { InventorySection } from "../../lib/constants";
import type { Staff } from "../../lib/types";
import styles from "./AuditPage.module.css";

interface AuditRecord {
  date: string;
  section: string;
  sectionLabel: string;
  sectionColor: string;
  product: string;
  end: number;
  aud: number;
  variance: number;
  reason: string;
}

interface StaffInfo {
  cashier: string;
  staffOnDuty: string[];
}

interface AuditPageProps {
  inventorySections: InventorySection[];
  staff: Staff[];
}

export default function AuditPage({
  inventorySections, staff,
}: AuditPageProps) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null); // { cashier, staffOnDuty: [] }
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ aud: "", reason: "" });
  const [pendingDelete, setPendingDelete] = useState<AuditRecord | null>(null);
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

        const records: AuditRecord[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const sectionKey = data.section;
          const section = inventorySections.find((s) => s.key === sectionKey);
          if (!section) return;

          const items = data.items || {};
          for (const [product, row] of Object.entries(items as Record<string, Record<string, unknown>>)) {
            if (row.aud == null || row.aud === "") continue;

            const resolvedRow = { ...row };
            const endVal = section.calcEnd ? section.calcEnd(resolvedRow) : ((resolvedRow.end as number) || 0);
            const audVal = parseFloat(String(row.aud)) || 0;
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
              reason: (row.audReason as string) || "",
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
            const dutyNames = ((reportData.staff || []) as string[])
              .map((id) => staffList.find((s) => s.id === id)?.name)
              .filter(Boolean) as string[];
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

  const getRecordKey = (rec: AuditRecord) => `${rec.date}_${rec.section}_${rec.product}`;

  const handleEditStart = (rec: AuditRecord) => {
    setEditingKey(getRecordKey(rec));
    setEditValues({ aud: String(rec.aud), reason: rec.reason });
  };

  const handleEditCancel = () => {
    setEditingKey(null);
    setEditValues({ aud: "", reason: "" });
  };

  const handleEditSave = async (rec: AuditRecord) => {
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
      const newAudNum = parseFloat(String(newAud)) || 0;
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

  const handleDelete = async (rec: AuditRecord) => {
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

  return (
    <div className="animate-fade">
      {/* Date picker */}
      <div className={styles.dateBar}>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={styles.dateInput}
        />
        {staffInfo && staffInfo.cashier && (
          <span className={styles.cashierBadge}>
            Cashier: {staffInfo.cashier}
          </span>
        )}
        {staffInfo && staffInfo.staffOnDuty.length > 0 && (
          <span className={styles.staffBadge}>
            Staff: {staffInfo.staffOnDuty.join(", ")}
          </span>
        )}
      </div>

      {loading && (
        <div className={styles.loading}>
          Loading audit records...
        </div>
      )}

      {!loading && auditRecords.length === 0 && (
        <div className={styles.empty}>
          No audit records found for {selectedDate}.
        </div>
      )}

      {!loading && auditRecords.length > 0 && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.headerRow}>
                <th className={styles.thSection}>Section</th>
                <th className={styles.thProduct}>Product</th>
                <th className={styles.thEnd}>END</th>
                <th className={styles.thAud}>AUD</th>
                <th className={styles.thDiff}>DIFF</th>
                <th className={styles.thReason}>Reason</th>
                <th className={styles.thActions}></th>
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
                    <tr key={key} className={styles.editingRow}>
                      <td className={styles.tdSection}>
                        <div className={styles.sectionCell}>
                          {/* dot color is data-driven (section color) — kept inline */}
                          <div className={styles.sectionDot} style={{ background: rec.sectionColor }} />
                          <span className={styles.sectionLabel}>{rec.sectionLabel}</span>
                        </div>
                      </td>
                      <td className={styles.tdProduct}>{rec.product}</td>
                      <td className={styles.tdEnd}>{rec.end}</td>
                      <td className={styles.tdAudInput}>
                        <input
                          type="number"
                          value={editValues.aud}
                          onChange={(e) => setEditValues((v) => ({ ...v, aud: e.target.value }))}
                          autoFocus
                          className={styles.audInput}
                        />
                      </td>
                      <td
                        className={styles.tdDiff}
                        // DIFF color is runtime-dynamic (positive=green, negative=red, zero/none=dim)
                        style={{ color: previewVariance == null ? "var(--text-dim)" : previewVariance > 0 ? "#4ade80" : previewVariance < 0 ? "#f87171" : "var(--text-dim)" }}
                      >
                        {previewVariance != null ? (previewVariance > 0 ? `+${previewVariance}` : previewVariance) : "—"}
                      </td>
                      <td className={styles.tdReasonInput}>
                        <input
                          type="text"
                          value={editValues.reason}
                          onChange={(e) => setEditValues((v) => ({ ...v, reason: e.target.value }))}
                          placeholder="Reason..."
                          className={styles.reasonInput}
                        />
                      </td>
                      <td className={styles.tdActions}>
                        <div className={styles.editActions}>
                          <button onClick={handleEditCancel} disabled={saving} className={styles.cancelButton}>Cancel</button>
                          <button onClick={() => handleEditSave(rec)} disabled={saving} className={styles.saveButton}>Save</button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr
                    key={key}
                    className={styles.dataRow}
                    // row bg is data-driven (highlight rows with non-zero variance) — kept inline
                    style={{ background: rec.variance !== 0 ? "rgba(239,68,68,0.02)" : "transparent" }}
                  >
                    <td className={styles.tdSection}>
                      <div className={styles.sectionCell}>
                        {/* dot color is data-driven (section color) — kept inline */}
                        <div className={styles.sectionDot} style={{ background: rec.sectionColor }} />
                        <span className={styles.sectionLabel}>
                          {rec.sectionLabel}
                        </span>
                      </div>
                    </td>
                    <td className={styles.tdProduct}>
                      {rec.product}
                    </td>
                    <td className={styles.tdEnd}>
                      {rec.end}
                    </td>
                    <td className={styles.tdAud}>
                      {rec.aud}
                    </td>
                    <td
                      className={styles.tdDiff}
                      // DIFF color is runtime-dynamic (positive=green, negative=red, zero=dim)
                      style={{ color: rec.variance > 0 ? "#4ade80" : rec.variance < 0 ? "#f87171" : "var(--text-dim)" }}
                    >
                      {rec.variance > 0 ? `+${rec.variance}` : rec.variance}
                    </td>
                    <td
                      className={styles.tdReason}
                      // text color depends on whether a reason exists — kept inline
                      style={{ color: rec.reason ? "var(--text-secondary)" : "var(--text-dim)" }}
                    >
                      {rec.reason || "—"}
                    </td>
                    <td className={styles.tdActionsCenter}>
                      <div className={styles.rowActions}>
                        <button onClick={() => handleEditStart(rec)} className={styles.iconButton} title="Edit">
                          <EditIcon />
                        </button>
                        <button onClick={() => { setPendingDelete(rec); setEditingKey(null); }} className={styles.iconButton} title="Delete">
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
