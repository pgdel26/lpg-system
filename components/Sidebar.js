import React from "react";
import { DollarIcon, PackageIcon, TagIcon, UsersIcon, FlameIcon, ChevronLeftIcon, ListIcon, CartIcon, ClipboardCheckIcon, HistoryIcon } from "./Icons";

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle }) {
  const navItems = [
    { id: "transactions", label: "Sales", icon: <ListIcon /> },
    { id: "refunds", label: "Refunds/Returns", icon: <HistoryIcon /> },
    { id: "purchases", label: "Purchases", icon: <CartIcon /> },
    { id: "inventory", label: "Inventory", icon: <PackageIcon /> },
    { id: "audit", label: "Audit", icon: <ClipboardCheckIcon /> },
    { id: "products", label: "Pricing", icon: <TagIcon /> },
    { id: "customers", label: "Customers", icon: <UsersIcon /> },
  ];

  return (
    <aside style={{
      width: collapsed ? "60px" : "220px",
      minHeight: "100vh",
      background: "linear-gradient(180deg, #1e3a8a, #1d4ed8)",
      borderRight: "none",
      position: "fixed", left: 0, top: 0, zIndex: 50,
      display: "flex", flexDirection: "column",
      transition: "width 0.25s ease",
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? "16px 10px" : "16px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        display: "flex", alignItems: "center", gap: "10px",
        minHeight: "64px",
      }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
          background: "rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
          boxShadow: "none",
        }}>
          <FlameIcon />
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <h1 style={{ fontSize: "14px", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#fff", whiteSpace: "nowrap" }}>
              PILI GASUL
            </h1>
            <p style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", letterSpacing: "1px", textTransform: "uppercase" }}>
              Tracker
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              gap: "12px", padding: collapsed ? "12px 0" : "12px 14px",
              justifyContent: collapsed ? "center" : "flex-start",
              borderRadius: "10px", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
              background: activePage === item.id ? "rgba(255,255,255,0.15)" : "transparent",
              color: activePage === item.id ? "#fff" : "rgba(255,255,255,0.6)",
              transition: "all 0.15s", marginBottom: "4px",
            }}
            title={collapsed ? item.label : undefined}
          >
            <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        style={{
          padding: "14px", borderTop: "1px solid rgba(255,255,255,0.12)",
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(255,255,255,0.6)", display: "flex",
          alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        <span style={{ transform: collapsed ? "rotate(180deg)" : "none", transition: "transform 0.25s", display: "flex" }}>
          <ChevronLeftIcon />
        </span>
      </button>
    </aside>
  );
}
