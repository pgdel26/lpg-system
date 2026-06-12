import React, { useState } from "react";
import { MailIcon, PhoneIcon, CheckIcon } from "../components/Icons";
import styles from "./ContactUsPage.module.css";

interface ContactUsPageProps {
  currentUserEmail: string;
  onSendSupportMessage: (args: { subject: string; message: string }) => Promise<boolean>;
}

export default function ContactUsPage({ currentUserEmail, onSendSupportMessage }: ContactUsPageProps) {
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
        <div className={styles.sentCard}>
          <div className={styles.sentIcon}>
            <CheckIcon />
          </div>
          <h2 className={styles.sentTitle}>
            Message sent
          </h2>
          <p className={styles.sentBody}>
            Thanks for reaching out. We&apos;ll reply
            {currentUserEmail ? ` to ${currentUserEmail}` : " to your account email"} as soon as we can.
          </p>
          <button
            onClick={handleSendAnother}
            className={styles.sendAnotherButton}
          >
            <MailIcon /> Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade">
      <div className={styles.infoBanner}>
        <span className={styles.infoIcon}>
          <PhoneIcon />
        </span>
        <p className={styles.infoText}>
          Send a question or report an issue to TankTracker support.
          <span className={styles.infoSubtext}>
            We&apos;ll reply to your account email{currentUserEmail ? `: ${currentUserEmail}` : ""}.
          </span>
        </p>
      </div>

      <div className={styles.formCard}>
        <label className={styles.fieldLabel}>
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => { setSubject(e.target.value); if (error) setError(""); }}
          disabled={sending}
          className={styles.textInput}
        />

        <label className={styles.fieldLabel}>
          Message
        </label>
        <textarea
          value={message}
          onChange={(e) => { setMessage(e.target.value); if (error) setError(""); }}
          placeholder="Tell us what's going on…"
          disabled={sending}
          rows={6}
          className={styles.textArea}
        />

        {error && (
          <p className={styles.errorText}>
            {error}
          </p>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className={`${styles.sendButton} ${sending ? styles.sendButtonDisabled : ""}`}
        >
          <MailIcon /> {sending ? "Sending…" : "Send Message"}
        </button>
      </div>
    </div>
  );
}
