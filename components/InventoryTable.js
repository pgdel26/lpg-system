import React from "react";

export default function InventoryTable({ section, data, allInventory, onChange, onSaveSection }) {
  const { columns, products, calcEnd, subgroups } = section;

  const getMergedRow = (product) => {
    const row = { ...(data[product] || {}) };
    for (const col of columns) {
      if (col.source) {
        const srcData = allInventory[col.source.section] || {};
        const srcRow = srcData[product] || {};
        row[col.field] = srcRow[col.source.field] || 0;
      }
      if (col.salesSource) {
        row[col.field] = data[product]?.[col.field] || 0;
      }
      if (col.purchaseSource) {
        row[col.field] = data[product]?.[col.field] || 0;
      }
      if (col.swapSource) {
        row[col.field] = data[product]?.[col.field] || 0;
      }
    }
    return row;
  };

  const getEndValue = (product) => calcEnd(getMergedRow(product));
  const getVarValue = (product) => {
    const row = getMergedRow(product);
    if (row.aud == null || row.aud === "") return null;
    return (parseFloat(row.aud) || 0) - getEndValue(product);
  };

  const handleCellChange = (product, field, value) => {
    const numVal = value === "" ? "" : parseFloat(value) || 0;
    onChange(section.key, product, field, numVal);
  };

  const cellStyle = (isCalc, varVal) => ({
    padding: "4px 6px", textAlign: "center", fontSize: "12px",
    fontFamily: "var(--font-mono)", fontWeight: isCalc ? 700 : 400,
    color: isCalc
      ? (varVal !== undefined
        ? (varVal > 0 ? "#4ade80" : varVal < 0 ? "#f87171" : "var(--text-secondary)")
        : "var(--text-secondary)")
      : "var(--text-secondary)",
    background: isCalc ? "rgba(241,245,249,0.5)" : "transparent",
  });

  const sourcedCellStyle = {
    padding: "4px 6px", textAlign: "center", fontSize: "12px",
    fontFamily: "var(--font-mono)", fontWeight: 600,
    color: "var(--accent-blue)", background: "rgba(59,130,246,0.04)",
  };

  const auditCellStyle = {
    padding: "4px 6px", textAlign: "center", fontSize: "12px",
    fontFamily: "var(--font-mono)", fontWeight: 600,
    color: "#22c55e", background: "rgba(34,197,94,0.04)",
  };

  const inputStyle = {
    width: "100%", padding: "4px 4px", textAlign: "center", fontSize: "12px",
    fontFamily: "var(--font-mono)", background: "transparent",
    border: "1px solid transparent", borderRadius: "4px",
    color: "var(--text-secondary)", outline: "none",
    transition: "border-color 0.15s",
  };

  const renderProducts = (productList) =>
    productList.map((product) => {
      const mergedRow = getMergedRow(product);
      const endVal = getEndValue(product);
      const varVal = getVarValue(product);

      return (
        <tr key={product} style={{ borderBottom: "1px solid rgba(15,23,42,0.04)" }}>
          <td style={{
            padding: "6px 12px", fontSize: "12px", fontWeight: 600,
            color: "var(--text-secondary)", whiteSpace: "nowrap",
            position: "sticky", left: 0, background: "var(--bg-secondary)", zIndex: 2,
          }}>
            {product}
          </td>
          {columns.map((col) => {
            if (col.field === "end") {
              return (
                <td key={col.field} style={cellStyle(true)}>
                  {endVal}
                </td>
              );
            }
            if (col.field === "var") {
              return (
                <td key={col.field} style={cellStyle(true, varVal)}>
                  {varVal != null ? varVal : "—"}
                </td>
              );
            }
            if (col.source) {
              const val = mergedRow[col.field] || 0;
              return (
                <td key={col.field} style={sourcedCellStyle} title={`Auto from ${col.source.section.toUpperCase()}.${col.source.field}`}>
                  {val || "—"}
                </td>
              );
            }
            if (col.salesSource) {
              const salesVal = mergedRow[col.field] || 0;
              return (
                <td key={col.field} style={sourcedCellStyle} title={`From Sales`}>
                  {salesVal || "—"}
                </td>
              );
            }
            if (col.purchaseSource) {
              const purchaseVal = mergedRow[col.field] || 0;
              return (
                <td key={col.field} style={sourcedCellStyle} title={`From Purchases`}>
                  {purchaseVal || "—"}
                </td>
              );
            }
            if (col.swapSource) {
              const swapVal = mergedRow[col.field] || 0;
              return (
                <td key={col.field} style={sourcedCellStyle} title={`From Swaps`}>
                  {swapVal || "—"}
                </td>
              );
            }
            if (col.auditSource) {
              const audVal = mergedRow[col.field];
              return (
                <td key={col.field} style={auditCellStyle} title="From Audit">
                  {audVal != null && audVal !== "" ? audVal : "—"}
                </td>
              );
            }
            const val = mergedRow[col.field];
            return (
              <td key={col.field} style={{ padding: "2px 2px" }}>
                <input
                  type="number"
                  value={val != null && val !== "" ? val : ""}
                  placeholder="—"
                  onChange={(e) => handleCellChange(product, col.field, e.target.value)}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(37,99,235,0.3)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "transparent"; onSaveSection(section.key); }}
                  style={inputStyle}
                />
              </td>
            );
          })}
        </tr>
      );
    });

  return (
    <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid var(--border)", background: "var(--bg-card)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: `${120 + columns.length * 80}px` }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{
              padding: "8px 12px", textAlign: "left", fontSize: "11px",
              fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase",
              letterSpacing: "1px", position: "sticky", left: 0,
              background: "var(--bg-secondary)", zIndex: 3, minWidth: "120px",
            }}>
              Product
            </th>
            {columns.map((col) => (
              <th key={col.field} style={{
                padding: "8px 4px", textAlign: "center", fontSize: "10px",
                fontWeight: 600,
                color: col.calc ? "var(--accent-orange)" : col.auditSource ? "#22c55e" : (col.source || col.salesSource || col.purchaseSource || col.swapSource) ? "var(--accent-blue)" : "var(--text-muted)",
                textTransform: "uppercase", letterSpacing: "0.5px",
                whiteSpace: "nowrap", minWidth: "70px",
              }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subgroups ? (
            subgroups.map((sg, idx) => {
              const nextIdx = idx + 1 < subgroups.length ? subgroups[idx + 1].startIndex : products.length;
              const groupProducts = products.slice(sg.startIndex, nextIdx);
              return (
                <React.Fragment key={sg.label}>
                  <tr>
                    <td
                      colSpan={columns.length + 1}
                      style={{
                        padding: "6px 12px", fontSize: "10px", fontWeight: 700,
                        color: "var(--text-dim)", textTransform: "uppercase",
                        letterSpacing: "1px", background: "rgba(241,245,249,0.5)",
                      }}
                    >
                      {sg.label}
                    </td>
                  </tr>
                  {renderProducts(groupProducts)}
                </React.Fragment>
              );
            })
          ) : (
            renderProducts(products)
          )}
        </tbody>
      </table>
    </div>
  );
}
