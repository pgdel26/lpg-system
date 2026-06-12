import React, { useState } from "react";
import { PlusIcon, TrashIcon, MailIcon, DollarIcon, DashboardIcon, PackageIcon } from "../components/Icons";
import ConfirmModal from "../components/ConfirmModal";
import type { NotificationRecipientRecord } from "../lib/hooks/useNotificationsData";
import styles from "./NotificationsPage.module.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REPORTS = [
  {
    id: "daily-sales",
    name: "Daily Sales Report",
    description: "End-of-day summary of sales totals, broken down by product and payment method.",
    icon: <DollarIcon />,
  },
  {
    id: "sales-summary",
    name: "Sales Summary Report",
    description: "Periodic roll-up of sales performance, top-selling products, and revenue trends.",
    icon: <DashboardIcon />,
  },
  {
    id: "inventory",
    name: "Inventory Report",
    description: "Current stock levels and low-stock alerts across all products.",
    icon: <PackageIcon />,
  },
];

interface NotificationsPageProps {
  recipients: NotificationRecipientRecord[];
  onAddRecipient: (email: string) => Promise<boolean>;
  onRemoveRecipient: (email: string) => Promise<void>;
}

export default function NotificationsPage({ recipients, onAddRecipient, onRemoveRecipient }: NotificationsPageProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<NotificationRecipientRecord | null>(null);

  const handleAdd = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { setError("Please enter an email address."); return; }
    if (!EMAIL_RE.test(trimmed)) { setError("That doesn't look like a valid email."); return; }
    if (recipients.some((r) => r.email === trimmed)) {
      setError("That email is already on the list.");
      return;
    }
    setError("");
    const ok = await onAddRecipient(trimmed);
    if (ok) setEmail("");
  };

  return (
    <div className="animate-fade">
      <div className={styles.infoBanner}>
        <span className={styles.infoIcon}>
          <MailIcon />
        </span>
        <p className={styles.infoText}>
          Email reports aren&apos;t sending yet.
          <span className={styles.infoSubtext}>
            Add recipients now so they&apos;re ready to receive reports once we turn it on.
          </span>
        </p>
      </div>

      {/* Reports list */}
      <div className={styles.reportsSection}>
        <label className={styles.sectionLabel}>
          Reports
        </label>
        <div className={styles.reportsCard}>
          <div className={styles.reportsPendingBanner}>
            All reports are pending — sending hasn&apos;t been enabled yet.
          </div>
          {REPORTS.map((report, idx) => (
            <div
              key={report.id}
              className={`${styles.reportRow} ${idx < REPORTS.length - 1 ? styles.reportRowBordered : ""}`}
            >
              <span className={styles.reportIcon}>
                {report.icon}
              </span>
              <div className={styles.reportBody}>
                <div className={styles.reportName}>
                  {report.name}
                </div>
                <div className={styles.reportDescription}>
                  {report.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add form */}
      <div className={styles.addFormCard}>
        <label className={styles.fieldLabel}>
          Add Recipient
        </label>
        <div className={styles.addRow}>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="manager@example.com"
            className={styles.emailInput}
          />
          <button
            onClick={handleAdd}
            className={styles.addButton}
          >
            <PlusIcon /> Add
          </button>
        </div>
        {error && (
          <p className={styles.errorText}>
            {error}
          </p>
        )}
      </div>

      {/* Recipient list */}
      <div className={styles.recipientList}>
        <div className={styles.recipientListHeader}>
          <span>Email</span>
          <span />
        </div>

        {recipients.length > 0 ? recipients.map((r) => (
          <div key={r.email} className={styles.recipientRow}>
            <span className={styles.recipientEmail}>
              {r.email}
            </span>
            <button
              onClick={() => setPendingDelete(r)}
              className={styles.removeButton}
              title="Remove recipient"
            >
              <TrashIcon />
            </button>
          </div>
        )) : (
          <div className={styles.emptyState}>
            No recipients yet. Add one above to get started.
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Remove Recipient"
          message={`Remove "${pendingDelete.email}" from the notifications list?`}
          confirmLabel="Remove"
          onConfirm={async () => {
            await onRemoveRecipient(pendingDelete.email);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
