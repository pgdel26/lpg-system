import React from "react";

export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="animate-slide-up" style={{
      position: "fixed", bottom: "24px", right: "24px", zIndex: 200,
      padding: "14px 20px", borderRadius: "12px",
      background: toast.type === "success"
        ? "linear-gradient(135deg, #166534, #15803d)"
        : "linear-gradient(135deg, #991b1b, #b91c1c)",
      color: "#fff", fontSize: "13px", fontWeight: 600,
      boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
    }}>
      {toast.message}
    </div>
  );
}
