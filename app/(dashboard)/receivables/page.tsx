"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import ReceivablesPage from "../../../views/ReceivablesPage";

export default function ReceivablesRoutePage() {
  const data = useAppData();
  return (
    <ReceivablesPage
      arTransactions={data.arTransactions}
      onMarkCollected={data.markArCollected}
      onUpdateSale={data.updateSale}
      onDeleteSale={data.deleteSale}
    />
  );
}
