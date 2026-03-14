import React, { useState } from "react";
import { BriefcaseIcon, PackageIcon, TagIcon, UsersIcon, FlameIcon, ChevronLeftIcon, ChevronDownIcon, ListIcon, CartIcon, UserIcon, DollarIcon } from "./Icons";

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle }) {
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [accountingOpen, setAccountingOpen] = useState(true);

  const operationsChildren = [
    { id: "transactions", label: "Sales", icon: <ListIcon /> },
    { id: "inventory", label: "Inventory", icon: <PackageIcon /> },
    { id: "products", label: "Products & Pricing", icon: <TagIcon /> },
  ];

  const accountingChildren = [
    { id: "receivables", label: "Accounts Receivable", icon: <DollarIcon /> },
    { id: "purchases", label: "Purchases", icon: <CartIcon /> },
  ];

  const operationsIds = operationsChildren.map((c) => c.id);
  const accountingIds = accountingChildren.map((c) => c.id);
  const isOperationsActive = operationsIds.includes(activePage);
  const isAccountingActive = accountingIds.includes(activePage);

  const renderNavButton = (item, indent) => (
    <button
      key={item.id}
      onClick={() => onNavigate(item.id)}
      style={{
        width: "100%", display: "flex", alignItems: "center",
        gap: "12px",
        padding: collapsed ? "10px 0" : `10px ${indent ? "14px" : "14px"}`,
        paddingLeft: collapsed ? undefined : indent ? "36px" : "14px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: "10px", border: "none", cursor: "pointer",
        fontFamily: "inherit", fontSize: "13px", fontWeight: 600,
        background: activePage === item.id ? "rgba(255,255,255,0.15)" : "transparent",
        color: activePage === item.id ? "#fff" : "rgba(255,255,255,0.6)",
        transition: "all 0.15s", marginBottom: "2px",
      }}
      title={collapsed ? item.label : undefined}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </button>
  );

  const renderGroup = (label, icon, isOpen, setIsOpen, children, isActive) => (
    collapsed ? (
      children.map((item) => renderNavButton(item, false))
    ) : (
      <>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            width: "100%", display: "flex", alignItems: "center",
            gap: "8px", padding: "10px 14px",
            justifyContent: "flex-start",
            borderRadius: "10px", border: "none", cursor: "pointer",
            fontFamily: "inherit", fontSize: "11px", fontWeight: 700,
            letterSpacing: "0.5px", textTransform: "uppercase",
            background: "transparent",
            color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
            transition: "all 0.15s", marginBottom: "2px",
          }}
        >
          <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
          <span style={{
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.2s", display: "flex",
          }}>
            <ChevronDownIcon />
          </span>
        </button>
        {isOpen && children.map((item) => renderNavButton(item, true))}
      </>
    )
  );

  return (
    <aside style={{
      width: collapsed ? "60px" : "250px",
      minHeight: "100vh",
      background: "linear-gradient(180deg, #1e3a8a, #1d4ed8)",
      borderRight: "none",
      position: "fixed", left: 0, top: 0, zIndex: 50,
      display: "flex", flexDirection: "column",
      transition: "width 0.25s ease",
    }}>
      {/* Logo */}
      <button
        onClick={() => onNavigate("transactions")}
        style={{
          padding: collapsed ? "16px 10px" : "16px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          display: "flex", alignItems: "center", gap: "10px",
          minHeight: "64px",
          background: "none", border: "none", cursor: "pointer",
          width: "100%", textAlign: "left",
        }}
        title="Dashboard"
      >
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
      </button>

      {/* Nav */}
      <nav style={{ padding: "12px 8px", flex: 1 }}>
        {/* Operations group */}
        {renderGroup("Operations", <BriefcaseIcon />, operationsOpen, setOperationsOpen, operationsChildren, isOperationsActive)}

        {/* Divider */}
        {!collapsed && (
          <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "8px 14px" }} />
        )}

        {/* Accounting group */}
        {renderGroup("Accounting", <DollarIcon />, accountingOpen, setAccountingOpen, accountingChildren, isAccountingActive)}

        {/* Divider */}
        {!collapsed && (
          <div style={{ height: "1px", background: "rgba(255,255,255,0.08)", margin: "8px 14px" }} />
        )}

        {/* Customers */}
        {renderNavButton({ id: "customers", label: "Customers", icon: <UsersIcon /> }, false)}

        {/* Staff */}
        {renderNavButton({ id: "staff", label: "Staff", icon: <UserIcon /> }, false)}
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
