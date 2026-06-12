"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import NotificationsPage from "../../../views/NotificationsPage";

export default function NotificationsRoutePage() {
  const data = useAppData();
  return (
    <NotificationsPage
      recipients={data.notificationRecipients}
      onAddRecipient={data.addRecipient}
      onRemoveRecipient={data.removeRecipient}
    />
  );
}
