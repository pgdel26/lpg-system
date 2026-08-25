"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import ReceivablesPage from "../../../views/ReceivablesPage";

export default function ReceivablesRoutePage() {
  const data = useAppData();
  return (
    <ReceivablesPage
      arTransactions={data.arTransactions}
      branches={data.branches}
      onRecordCollection={data.recordArCollection}
      onVoidCollection={data.voidArCollectionBatch}
      onEditCollection={data.editArCollectionBatch}
      onUpdateSale={data.updateSale}
      onDeleteSale={data.deleteSale}
    />
  );
}
