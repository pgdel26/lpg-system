import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon, ChevronDownIcon } from "../../components/Icons";
import styles from "./ProductPicker.module.css";

interface ProductPickerProps {
  /** Every product that can be ticked, in display order. */
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Rendered above the button. */
  label?: string;
  id?: string;
}

/**
 * Multi-select product filter: a button, and a panel of checkboxes with its own
 * search.
 *
 * EMPTY MEANS ALL, and the panel's footer says so — "nothing ticked" reading as
 * "everything" is not self-evident, and the alternative (opening with every box
 * ticked) makes Clear destructive rather than useful.
 *
 * Extracted from CustomerOrdersTab when that file passed the ~400-line rule in
 * CLAUDE.md. It owns only its own open/search state; the selection lives with
 * the report that filters on it.
 */
export default function ProductPicker({
  options,
  selected,
  onChange,
  label = "Products",
  id = "product-picker",
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const term = search.trim().toLowerCase();
  const visibleOptions = useMemo(
    () => (term ? options.filter((p) => p.toLowerCase().includes(term)) : options),
    [options, term],
  );

  // Closed from three places, so closing is one function rather than three
  // copies — and clearing the search belongs with it, not in an effect's
  // cleanup where it would also fire on unmount with nobody left to read it.
  const close = () => {
    setOpen(false);
    setSearch("");
  };

  // Close on click-outside and on Escape. Both listeners are torn down when the
  // panel closes, so nothing stays bound to the document while it's shut.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((p) => p !== name) : [...selected, name]);

  const buttonLabel = selected.length === 0
    ? "All products"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} products`;

  return (
    <div className={styles.controlGroup} ref={wrapRef}>
      <label className={styles.controlLabel} htmlFor={id}>{label}</label>
      <div className={styles.pickerWrap}>
        <button
          id={id}
          type="button"
          className={`${styles.pickerButton} ${selected.length > 0 ? styles.pickerActive : ""}`}
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
        >
          <span>{buttonLabel}</span>
          <ChevronDownIcon />
        </button>

        {open && (
          <div className={styles.pickerPanel}>
            <div className={styles.pickerSearchWrap}>
              <span className={styles.pickerSearchIcon}><SearchIcon /></span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a product"
                className={styles.pickerSearchInput}
                autoFocus
              />
            </div>

            <div className={styles.pickerActions}>
              {/* Adds to the selection rather than replacing it, so two searches
                  in a row build one list. */}
              <button
                type="button"
                className={styles.pickerAction}
                onClick={() => onChange([...new Set([...selected, ...visibleOptions])])}
              >
                Select {term ? "matching" : "all"}
              </button>
              <button
                type="button"
                className={styles.pickerAction}
                onClick={() => onChange([])}
                disabled={selected.length === 0}
              >
                Clear
              </button>
            </div>

            <div className={styles.pickerList}>
              {visibleOptions.length === 0 ? (
                <div className={styles.pickerEmpty}>No product matches.</div>
              ) : visibleOptions.map((name) => (
                <label key={name} className={styles.pickerOption}>
                  <input
                    type="checkbox"
                    checked={selected.includes(name)}
                    onChange={() => toggle(name)}
                  />
                  <span>{name}</span>
                </label>
              ))}
            </div>

            <div className={styles.pickerFooter}>
              {selected.length === 0
                ? "Nothing ticked — showing every product ordered."
                : `${selected.length} of ${options.length} selected.`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
