import styles from "./Toast.module.css";

export default function Toast({ toast }: { toast: { type: string; message: string } | null }) {
  if (!toast) return null;
  return (
    <div className={`animate-slide-up ${styles.toast} ${toast.type === "success" ? styles.success : styles.error}`}>
      {toast.message}
    </div>
  );
}
