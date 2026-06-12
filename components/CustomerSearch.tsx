import { useState, useRef, useEffect } from "react";
import styles from "./CustomerSearch.module.css";

interface Customer {
  id: string;
  name: string;
  phone?: string;
}

export default function CustomerSearch({
  customers,
  value,
  onChange,
}: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = value ? customers.find((c) => c.id === value) : null;

  const filtered = search.trim()
    ? customers.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q))
        );
      })
    : customers;

  const handleSelect = (customerId: string) => {
    onChange(customerId);
    setSearch("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setSearch("");
  };

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      {selected && !open ? (
        <div className={styles.selectedRow}>
          <span className={styles.selectedName}>
            {selected.name}{selected.phone ? ` (${selected.phone})` : ""}
          </span>
          <button onClick={handleClear} className={styles.clearButton}>✕</button>
        </div>
      ) : (
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers..."
          className={styles.searchInput}
        />
      )}

      {open && (
        <div className={styles.dropdown}>
          {filtered.length > 0 ? filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => handleSelect(c.id)}
              className={`${styles.option} ${c.id === value ? styles.optionSelected : ""}`}
            >
              <span className={styles.optionName}>{c.name}</span>
              {c.phone && <span className={styles.optionPhone}>({c.phone})</span>}
            </div>
          )) : (
            <div className={styles.empty}>No customers found</div>
          )}
        </div>
      )}
    </div>
  );
}
