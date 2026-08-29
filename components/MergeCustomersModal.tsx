import { useMemo, useState } from "react";
import { XIcon, SearchIcon } from "./Icons";
import { fmt } from "../lib/utils";
import type { MergePreview, MergeResult } from "../lib/hooks/useCustomersData";
import type { Customer, CustomerCategory } from "../lib/types";
import styles from "./MergeCustomersModal.module.css";

interface MergeCustomersModalProps {
  customers: Customer[];
  categories: CustomerCategory[];
  onPreview: (customerIds: string[]) => Promise<MergePreview | null>;
  onMerge: (survivorId: string, doomedIds: string[]) => Promise<MergeResult | null>;
  onClose: () => void;
}

/**
 * Folds duplicate customer records into one.
 *
 * Three steps on purpose. Merging deletes customer records and repoints every
 * transaction they own, so the operator picks, then chooses what survives, then
 * sees the actual document counts and outstanding A/R before anything is
 * written — the same "dry run, then run" shape the one-off merge scripts used.
 */
export default function MergeCustomersModal({
  customers,
  categories,
  onPreview,
  onMerge,
  onClose,
}: MergeCustomersModalProps) {
  const [step, setStep] = useState<"pick" | "confirm" | "done">("pick");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [survivorId, setSurvivorId] = useState("");
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MergeResult | null>(null);

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => (term
      ? customers.filter((c) => (c.name && c.name.toLowerCase().includes(term))
        || (c.phone && c.phone.toLowerCase().includes(term)))
      : customers),
    [customers, term],
  );

  const selectedCustomers = selected
    .map((id) => customers.find((c) => c.id === id))
    .filter((c): c is Customer => !!c);

  const toggle = (id: string) => setSelected((prev) => {
    const next = prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id];
    // A survivor that has been unticked is no longer a choice anyone made.
    if (!next.includes(survivorId)) setSurvivorId("");
    return next;
  });

  const goConfirm = async () => {
    setBusy(true);
    const p = await onPreview(selected);
    setBusy(false);
    if (!p) return; // the hook toasted why
    setPreview(p);
    // Default to the record with the most history: it is the one whose id the
    // most documents already carry, so it is the cheapest and least surprising
    // survivor. Still changeable — this is a default, not a decision.
    const biggest = [...p.rows].sort((a, b) => b.docCount - a.docCount)[0];
    setSurvivorId((prev) => prev || biggest?.customerId || "");
    setStep("confirm");
  };

  const doMerge = async () => {
    if (!survivorId || busy) return;
    setBusy(true);
    const r = await onMerge(survivorId, selected.filter((id) => id !== survivorId));
    setBusy(false);
    if (!r) return; // refused or failed — the hook toasted, selection kept
    setResult(r);
    setStep("done");
  };

  // "Merge another" resets everything except the dialog itself — the merged
  // customers are gone from `customers` by now, so a stale selection would
  // point at records that no longer exist.
  const startAnother = () => {
    setSelected([]);
    setSurvivorId("");
    setPreview(null);
    setResult(null);
    setSearch("");
    setStep("pick");
  };

  const survivorName = customers.find((c) => c.id === survivorId)?.name || "";

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            {step === "done" ? "Merge complete" : "Merge Customers"}
          </h3>
          <button onClick={onClose} className={styles.closeButton} disabled={busy}>
            <XIcon />
          </button>
        </div>

        {step === "pick" && (
          <>
            <p className={styles.lede}>
              Pick the records that are the same customer. You choose which one to keep next.
            </p>

            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}><SearchIcon /></span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers"
                className={styles.searchInput}
                autoFocus
              />
            </div>

            <div className={styles.list}>
              {visible.length === 0 ? (
                <div className={styles.listEmpty}>No customer matches.</div>
              ) : visible.map((c) => (
                <label key={c.id} className={styles.row}>
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span className={styles.rowName}>{c.name}</span>
                  {c.phone && <span className={styles.rowMeta}>{c.phone}</span>}
                  {c.categoryId && categoryName.has(c.categoryId) && (
                    <span className={styles.rowBadge}>{categoryName.get(c.categoryId)}</span>
                  )}
                </label>
              ))}
            </div>

            <div className={styles.actions}>
              <span className={styles.note}>{selected.length} selected</span>
              <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
              <button
                onClick={goConfirm}
                className={styles.saveButton}
                disabled={selected.length < 2 || busy}
                title={selected.length < 2 ? "Pick at least two records to merge" : undefined}
              >
                {busy ? "Checking…" : "Next"}
              </button>
            </div>
          </>
        )}

        {step === "confirm" && preview && (
          <>
            <p className={styles.lede}>
              Which record should be kept? The others are deleted, and everything they own moves
              across.
            </p>

            <div className={styles.list}>
              {preview.rows.map((row) => (
                <label key={row.customerId} className={styles.row}>
                  <input
                    type="radio"
                    name="survivor"
                    checked={survivorId === row.customerId}
                    onChange={() => setSurvivorId(row.customerId)}
                  />
                  <span className={styles.rowName}>{row.name}</span>
                  {/* The figures the decision rests on: how much history each
                      record carries, and how much money is riding on it. */}
                  <span className={styles.rowMeta}>
                    {row.docCount.toLocaleString("en-PH")} txn
                    {row.targetCount > 0 ? `, ${row.targetCount} target${row.targetCount === 1 ? "" : "s"}` : ""}
                  </span>
                  {row.outstanding > 0 && (
                    <span className={styles.rowOwed}>{fmt(row.outstanding)} owed</span>
                  )}
                </label>
              ))}
            </div>

            <div className={styles.summary}>
              <div>
                <strong>{preview.totalDocs.toLocaleString("en-PH")}</strong> transactions move to{" "}
                <strong>{survivorName || "—"}</strong>, and{" "}
                <strong>{selected.length - 1}</strong> customer record
                {selected.length - 1 === 1 ? "" : "s"} are deleted.
              </div>
              {/* The guard, stated. The merge refuses to delete anything if this
                  figure moves, so showing it is also showing what is checked. */}
              <div className={styles.summaryOwed}>
                {fmt(preview.totalOutstanding)} outstanding across them — unchanged by the merge,
                and checked before anything is deleted.
              </div>
              <div className={styles.warn}>This cannot be undone.</div>
            </div>

            <div className={styles.actions}>
              <button onClick={() => setStep("pick")} className={styles.cancelButton} disabled={busy}>
                Back
              </button>
              <button
                onClick={doMerge}
                className={styles.mergeButton}
                disabled={!survivorId || busy}
              >
                {busy ? "Merging…" : `Merge into ${survivorName}`}
              </button>
            </div>
          </>
        )}

        {step === "done" && result && (
          <>
            <div className={styles.doneBox}>
              <div className={styles.doneLine}>
                <strong>{result.repointed.toLocaleString("en-PH")}</strong> transaction
                {result.repointed === 1 ? "" : "s"} moved to{" "}
                <strong>{result.survivorName}</strong>.
              </div>
              <div className={styles.doneLine}>
                <strong>{result.deleted}</strong> duplicate record
                {result.deleted === 1 ? "" : "s"} deleted.
              </div>
              {(result.targetsMoved > 0 || result.targetsSkipped > 0) && (
                <div className={styles.doneLine}>
                  {result.targetsMoved} target{result.targetsMoved === 1 ? "" : "s"} moved
                  {result.targetsSkipped > 0
                    ? `, ${result.targetsSkipped} dropped (${result.survivorName} already had one)`
                    : ""}.
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <button onClick={onClose} className={styles.cancelButton}>Close</button>
              <button onClick={startAnother} className={styles.saveButton}>
                Merge another
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
