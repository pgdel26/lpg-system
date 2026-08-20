"use client";
import { useState } from "react";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import PurchasesPage from "../../../views/PurchasesPage";
import PurchaseModal, { cellKey } from "../../../components/PurchaseModal";
import { today } from "../../../lib/utils";

export default function PurchasesRoutePage() {
  const data = useAppData();

  // ---- Purchase modal UI state ----
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseModalDate, setPurchaseModalDate] = useState(today());
  const [purchaseModalError, setPurchaseModalError] = useState("");

  // ---- Modal open handler ----
  const handleOpenPurchaseModal = () => {
    setPurchaseModalOpen(true);
    setPurchaseModalDate(today());
    setPurchaseModalError("");
  };

  // ---- Edit Delivery modal state ----
  // Held here rather than in the view because prefilling needs an async read,
  // and because the modal is mounted per delivery: keying it by deliveryId means
  // React builds fresh state from the initial* props each time it opens, with no
  // effect needed to re-sync them.
  const [editDelivery, setEditDelivery] = useState<{
    deliveryId: string;
    date: string;
    totalCost: string;
    quantities: Record<string, string>;
  } | null>(null);
  const [editDeliveryError, setEditDeliveryError] = useState("");

  const handleEditDelivery = async (deliveryId: string) => {
    const delivery = data.purchaseDeliveries.find((d) => d.id === deliveryId);
    if (!delivery) return;
    // Authoritative read: the table shows a paginated window, so prefilling from
    // what is on screen could omit lines — and the save diff would then treat
    // those omissions as deletions.
    const lines = await data.fetchDeliveryLines(deliveryId);
    const quantities: Record<string, string> = {};
    for (const l of lines) quantities[cellKey(l.section, l.product)] = String(l.qty);
    setEditDeliveryError("");
    setEditDelivery({
      deliveryId,
      date: delivery.date,
      // A delivery nobody has costed yet opens blank, not "0" — a prefilled 0
      // invites saving the placeholder unread.
      totalCost: delivery.costPending ? "" : String(delivery.totalCost),
      quantities,
    });
  };

  const handleSaveDelivery = async (
    items: Array<{ section: string; product: string; qty: string | number }>,
    totalCost: string,
  ) => {
    if (!editDelivery) return;
    setEditDeliveryError("");
    const err = await data.updateDelivery({
      deliveryId: editDelivery.deliveryId,
      items,
      totalCost,
      date: editDelivery.date,
    });
    if (err) {
      setEditDeliveryError(err);
      return;
    }
    setEditDelivery(null);
  };

  // ---- Record-mutation wrapper ----
  const handleRecordPurchase = async (
    items: Array<{ section: string; product: string; qty: string | number }>,
    totalCost: string,
  ) => {
    setPurchaseModalError("");
    const err = await data.recordPurchase({ items, totalCost, date: purchaseModalDate });
    if (err) {
      setPurchaseModalError(err);
      return;
    }
    setPurchaseModalOpen(false);
  };

  return (
    <>
      <PurchasesPage
        purchaseDeliveries={data.purchaseDeliveries}
        branches={data.branches}
        fetchPurchasesInRange={data.fetchPurchasesInRange}
        purchasesVersion={data.purchasesVersion}
        onOpenPurchaseModal={handleOpenPurchaseModal}
        onUpdatePurchase={data.updatePurchase}
        onEditDelivery={handleEditDelivery}
        onDeletePurchase={data.deletePurchase}
        onDeleteTransfer={data.deleteTransfer}
      />

      {purchaseModalOpen && (
        <PurchaseModal
          date={purchaseModalDate}
          setDate={setPurchaseModalDate}
          error={purchaseModalError}
          purchaseSections={data.purchaseSections}
          onClose={() => setPurchaseModalOpen(false)}
          onSubmit={handleRecordPurchase}
        />
      )}

      {editDelivery && (
        <PurchaseModal
          /* Keyed by delivery: opening a different one remounts the modal, so its
             initial* props become fresh state instead of being ignored. */
          key={editDelivery.deliveryId}
          editing
          date={editDelivery.date}
          setDate={(v) => setEditDelivery((p) => (p ? { ...p, date: v } : p))}
          error={editDeliveryError}
          purchaseSections={data.purchaseSections}
          initialQuantities={editDelivery.quantities}
          initialTotalCost={editDelivery.totalCost}
          onClose={() => setEditDelivery(null)}
          onSubmit={handleSaveDelivery}
        />
      )}
    </>
  );
}
