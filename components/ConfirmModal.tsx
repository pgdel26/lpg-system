import { XIcon } from "./Icons";
import styles from "./ConfirmModal.module.css";

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmColor,
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title || "Confirm"}</h3>
          <button onClick={onCancel} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button onClick={onCancel} className={styles.cancelButton}>Cancel</button>
          <button
            onClick={onConfirm}
            className={styles.confirmButton}
            style={confirmColor ? { background: confirmColor } : undefined}
          >
            {confirmLabel || "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
