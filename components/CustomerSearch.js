import React, { useState, useRef, useEffect } from "react";

export default function CustomerSearch({ customers, value, onChange }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
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

  const handleSelect = (customerId) => {
    onChange(customerId);
    setSearch("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setSearch("");
  };

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {selected && !open ? (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", padding: "8px 12px", borderRadius: "8px",
          background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
        }}>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
            {selected.name}{selected.phone ? ` (${selected.phone})` : ""}
          </span>
          <button
            onClick={handleClear}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "11px", color: "var(--text-dim)", padding: "0 2px",
              fontFamily: "inherit",
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers..."
          style={{
            width: "100%", padding: "8px 12px", borderRadius: "8px",
            background: "rgba(241,245,249,0.8)", border: "1px solid var(--border-light)",
            color: "var(--text-secondary)", fontSize: "13px", outline: "none",
            fontFamily: "inherit",
          }}
        />
      )}

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          marginTop: "4px", borderRadius: "8px", overflow: "hidden",
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          boxShadow: "0 8px 24px rgba(15,23,42,0.15)",
          maxHeight: "180px", overflowY: "auto",
        }}>
          {filtered.length > 0 ? filtered.map((c) => (
            <div
              key={c.id}
              onClick={() => handleSelect(c.id)}
              style={{
                padding: "8px 12px", cursor: "pointer",
                borderBottom: "1px solid rgba(15,23,42,0.04)",
                fontSize: "12px", color: "var(--text-secondary)",
                background: c.id === value ? "rgba(59,130,246,0.08)" : "transparent",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(59,130,246,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = c.id === value ? "rgba(59,130,246,0.08)" : "transparent"; }}
            >
              <span style={{ fontWeight: 600 }}>{c.name}</span>
              {c.phone && <span style={{ color: "var(--text-dim)", marginLeft: "6px" }}>({c.phone})</span>}
            </div>
          )) : (
            <div style={{ padding: "10px 12px", fontSize: "12px", color: "var(--text-dim)", textAlign: "center" }}>
              No customers found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
