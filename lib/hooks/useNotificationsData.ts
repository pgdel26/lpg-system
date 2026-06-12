import { useEffect, useState, useCallback } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";

type ToastFn = (t: { type: string; message: string }) => void;

// Actual shape stored in Firestore settings/notifications.recipients
export interface NotificationRecipientRecord {
  email: string;
  addedAt: Timestamp;
}

export interface UseNotificationsData {
  notificationRecipients: NotificationRecipientRecord[];
  addRecipient: (email: string) => Promise<boolean>;
  removeRecipient: (email: string) => Promise<void>;
  sendSupportMessage: (args: { subject: string; message: string }) => Promise<boolean>;
}

export function useNotificationsData(
  currentUserEmail: string | null | undefined,
  onToast: ToastFn,
): UseNotificationsData {
  const [notificationRecipients, setNotificationRecipients] = useState<NotificationRecipientRecord[]>([]);

  // ---- FIREBASE: Notification recipients listener ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "notifications"), (snapshot) => {
      if (snapshot.exists()) {
        setNotificationRecipients(snapshot.data().recipients || []);
      } else {
        setNotificationRecipients([]);
      }
    });
    return () => unsub();
  }, []);

  // ---- Handlers — setToast replaced with onToast ----
  const addRecipient = useCallback(async (email: string): Promise<boolean> => {
    try {
      const next = [
        ...notificationRecipients.filter((r) => r.email !== email),
        { email, addedAt: Timestamp.now() },
      ];
      await setDoc(doc(db, "settings", "notifications"), {
        recipients: next,
        updatedAt: Timestamp.now(),
        updatedBy: currentUserEmail || null,
      }, { merge: true });
      onToast({ type: "success", message: `Added ${email}` });
      return true;
    } catch (error) {
      console.error("Add recipient error:", error);
      onToast({ type: "error", message: "Failed to add recipient." });
      return false;
    }
  }, [notificationRecipients, currentUserEmail, onToast]);

  const removeRecipient = useCallback(async (email: string): Promise<void> => {
    try {
      const next = notificationRecipients.filter((r) => r.email !== email);
      await setDoc(doc(db, "settings", "notifications"), {
        recipients: next,
        updatedAt: Timestamp.now(),
        updatedBy: currentUserEmail || null,
      }, { merge: true });
      onToast({ type: "success", message: `Removed ${email}` });
    } catch (error) {
      console.error("Remove recipient error:", error);
      onToast({ type: "error", message: "Failed to remove recipient." });
    }
  }, [notificationRecipients, currentUserEmail, onToast]);

  const sendSupportMessage = useCallback(async ({
    subject,
    message,
  }: {
    subject: string;
    message: string;
  }): Promise<boolean> => {
    try {
      const response = await fetch("/api/send-support-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, fromEmail: currentUserEmail || "" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Send failed");
      }
      onToast({ type: "success", message: "Message sent. We'll be in touch." });
      return true;
    } catch (error) {
      console.error("Send support message error:", error);
      onToast({ type: "error", message: (error as Error).message || "Failed to send message." });
      return false;
    }
  }, [currentUserEmail, onToast]);

  return {
    notificationRecipients,
    addRecipient,
    removeRecipient,
    sendSupportMessage,
  };
}
