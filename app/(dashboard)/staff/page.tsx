"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import StaffPage from "../../../views/StaffPage";

export default function StaffRoutePage() {
  const data = useAppData();
  return (
    <StaffPage
      staff={data.staff}
      onAddStaff={data.addStaff}
      onUpdateStaff={data.updateStaff}
      onDeleteStaff={data.deleteStaff}
    />
  );
}
