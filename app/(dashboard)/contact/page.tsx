"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { useAuth } from "../../../lib/hooks/useAuth";
import ContactUsPage from "../../../views/ContactUsPage";

export default function ContactRoutePage() {
  const data = useAppData();
  const { authUser } = useAuth();
  return (
    <ContactUsPage
      currentUserEmail={authUser?.email || ""}
      onSendSupportMessage={data.sendSupportMessage}
    />
  );
}
