import React, { useState } from "react";
import { MailIcon, PhoneIcon, CheckIcon } from "../components/Icons";

export default function ContactUsPage({ currentUserEmail, onSendSupportMessage }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    const trimmedSubject = subject.trim();
    const trimmedMessage = message.trim();
    if (!trimmedSubject) { setError("Please enter a subject."); return; }
    if (!trimmedMessage) { setError("Please enter a message."); return; }

    setError("");
    setSending(true);
    try {
      const ok = await onSendSupportMessage({ subject: trimmedSubject, message: trimmedMessage });
      if (ok) {
        setSubject("");
        setMessage("");
        setSent(true);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSendAnother = () => {
    setSent(false);
    setError("");
  };

  if (sent) {
    return (
      <div className="animate-fade">
        <div style={{
          background: "var(--bg-card)", borderRadius: "12px",
          border: "1px solid var(--border)", padding: "40px 24px",
          textAlign: "center",
        }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "50%",
            background: "rgba(34,197,94,0.12)", color: "#16a34a",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
          }}>
            <CheckIcon />
          </div>
          <h2 style={{
            fontSize: "18px", fontWeight: 700, color: "var(--text-primary)",
            margin: "0 0 8px",
          }}>
            Message sent
          </h2>
          <p style={{
            fontSize: "13px", color: "var(--text-muted)",
            lineHeight: 1.5, margin: "0 0 24px",
          }}>
            Thanks for reaching out. We&apos;ll reply
            {currentUserEmail ? ` to ${currentUserEmail}` : " to your account email"} as soon as we can.
          </p>
          <button
            onClick={handleSendAnother}
            style={{
              padding: "10px 18px", borderRadius: "10px", border: "none",
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
              background: "var(--accent-blue)", color: "#fff",
              fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
            }}
          >
            <MailIcon /> Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade">
      <div style={{
        marginBottom: "20px",
        padding: "14px 18px",
        borderRadius: "12px",
        background: "rgba(59,130,246,0.06)",
        border: "1px solid rgba(59,130,246,0.15)",
        display: "flex", alignItems: "center", gap: "12px",
      }}>
        <span style={{ color: "var(--accent-blue)", display: "flex" }}>
          <PhoneIcon />
        </span>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
          Send a question or report an issue to TankTracker support.
          <span style={{ display: "block", color: "var(--text-dim)", fontSize: "11px", marginTop: "2px" }}>
            We&apos;ll reply to your account email{currentUserEmail ? `: ${currentUserEmail}` : ""}.
          </span>
        </p>
      </div>

      <div style={{
        background: "var(--bg-card)", borderRadius: "12px",
        border: "1px solid var(--border)", padding: "16px",
      }}>
        <label style={{
          fontSize: "10px", fontWeight: 700, color: "var(--text-dim)",
          textTransform: "uppercase", letterSpacing: "1px",
          display: "block", marginBottom: "6px",
        }}>
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); if (error) setError(""); }}
          disabled={sending}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: "10px",
            background: "#fff", border: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: "13px", outline: "none",
            fontFamily: "inherit", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
            marginBottom: "14px", boxSizing: "border-box",
          }}
        />

        <label style={{
          fontSize: "10px", fontWeight: 700, color: "var(--text-dim)",
          textTransform: "uppercase", letterSpacing: "1px",
          display: "block", marginBottom: "6px",
        }}>
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => { setMessage(e.target.value); if (error) setError(""); }}
          placeholder="Tell us what's going on…"
          disabled={sending}
          rows={6}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: "10px",
            background: "#fff", border: "1px solid var(--border)",
            color: "var(--text-secondary)", fontSize: "13px", outline: "none",
            fontFamily: "inherit", boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
            marginBottom: "14px", boxSizing: "border-box", resize: "vertical",
          }}
        />

        {error && (
          <p style={{ fontSize: "11px", color: "#ef4444", marginBottom: "10px", fontWeight: 600 }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            padding: "10px 18px", borderRadius: "10px", border: "none",
            cursor: sending ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: "6px",
            background: "var(--accent-blue)", color: "#fff",
            fontSize: "13px", fontWeight: 700, fontFamily: "inherit",
            boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
            opacity: sending ? 0.6 : 1,
          }}
        >
          <MailIcon /> {sending ? "Sending…" : "Send Message"}
        </button>
      </div>
    </div>
  );
}
