import { useState } from "react";
import { today } from "../../lib/utils";
import { PlusIcon, XIcon, EditIcon, TrashIcon } from "../../components/Icons";
import ConfirmModal from "../../components/ConfirmModal";
import PriceSections from "./PriceTables";
import { buildDefaultPrices } from "./pricingCategories";
import type {
  Pricebook,
  ProductMap,
  PriceMap,
  PriceField,
  CategoryMeta,
  CreatePricebookFn,
  UpdatePricebookFn,
  ActivatePricebookFn,
  DeletePricebookFn,
} from "./pricingTypes";
import styles from "./PricingSubTab.module.css";

interface PricingSubTabProps {
  products: ProductMap;
  pricebooks: Pricebook[];
  activePricebook: Pricebook | null;
  meta: CategoryMeta;
  onCreatePricebook: CreatePricebookFn;
  onUpdatePricebook: UpdatePricebookFn;
  onActivatePricebook: ActivatePricebookFn;
  onDeletePricebook: DeletePricebookFn;
}

export default function PricingSubTab({
  products,
  pricebooks,
  activePricebook,
  meta,
  onCreatePricebook,
  onUpdatePricebook,
  onActivatePricebook,
  onDeletePricebook,
}: PricingSubTabProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEffectiveDate, setNewEffectiveDate] = useState(today());
  const [newPrices, setNewPrices] = useState<PriceMap>({});
  const [editingDraft, setEditingDraft] = useState(false);
  const [viewingPb, setViewingPb] = useState<Pricebook | null>(null);
  const [visibleCount, setVisibleCount] = useState(5);
  const [pendingReactivate, setPendingReactivate] = useState<Pricebook | null>(null);
  const [pendingDiscardDraft, setPendingDiscardDraft] = useState<Pricebook | null>(null);

  // Draft pricebook editing state
  const [draftSyncId, setDraftSyncId] = useState<string | null>(null);
  const [draftPrices, setDraftPrices] = useState<PriceMap>({});
  const [draftName, setDraftName] = useState("");
  const [draftDate, setDraftDate] = useState("");

  const draftPricebook = pricebooks.find((pb) => pb.status === "draft") || null;
  const otherPricebooks = pricebooks.filter(
    (pb) => pb.id !== activePricebook?.id && pb.status !== "draft"
  );

  // Sync draft local state when a new draft appears (only if modal not open)
  if (draftPricebook && draftPricebook.id !== draftSyncId && !editingDraft) {
    setDraftSyncId(draftPricebook.id);
    setDraftPrices(JSON.parse(JSON.stringify(draftPricebook.prices || {})));
    setDraftName(draftPricebook.name || "");
    setDraftDate(draftPricebook.effectiveDate || "");
  }

  const openCreateModal = () => {
    const defaultName = new Date().toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    setNewName(defaultName);
    setNewEffectiveDate(today());
    setNewPrices(activePricebook?.prices ? JSON.parse(JSON.stringify(activePricebook.prices)) : buildDefaultPrices(products));
    setCreating(true);
  };

  const handleNewPriceChange = (productKey: string, field: PriceField, value: string) => {
    setNewPrices((prev) => ({
      ...prev,
      [productKey]: { ...(prev[productKey] || {}), [field]: parseFloat(value) || 0 },
    }));
  };

  const handleCreateSave = async () => {
    if (!newName.trim()) return;
    await onCreatePricebook(newName.trim(), newEffectiveDate, newPrices);
    setCreating(false);
  };

  const handleCreateAndActivate = async () => {
    if (!newName.trim()) return;
    try {
      const id = await onCreatePricebook(newName.trim(), newEffectiveDate, newPrices);
      if (id) {
        await onActivatePricebook(id);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDraftPriceChange = (productKey: string, field: PriceField, value: string) => {
    setDraftPrices((prev) => ({
      ...prev,
      [productKey]: { ...(prev[productKey] || {}), [field]: parseFloat(value) || 0 },
    }));
  };

  const openDraftModal = () => {
    if (!draftPricebook) return;
    setDraftSyncId(draftPricebook.id);
    setDraftPrices(JSON.parse(JSON.stringify(draftPricebook.prices || {})));
    setDraftName(draftPricebook.name || "");
    setDraftDate(draftPricebook.effectiveDate || "");
    setEditingDraft(true);
  };

  const handleDraftSave = async () => {
    if (!draftPricebook) return;
    await onUpdatePricebook(draftPricebook.id, {
      name: draftName.trim(),
      effectiveDate: draftDate,
      prices: draftPrices,
    });
    setEditingDraft(false);
  };

  const handleActivate = async () => {
    if (!draftPricebook) return;
    await onUpdatePricebook(draftPricebook.id, {
      name: draftName.trim(),
      effectiveDate: draftDate,
      prices: draftPrices,
    });
    await onActivatePricebook(draftPricebook.id);
    setEditingDraft(false);
  };

  return (
    <>
      {/* Active Pricebook (read-only) */}
      {activePricebook && (
        <div className={styles.activeBlock}>
          <div className={styles.activeHeader}>
            <div>
              <div className={styles.titleRow}>
                <div className={styles.dotGreen} />
                <h3 className={styles.pbName}>{activePricebook.name}</h3>
                <span className={styles.badgeActive}>Active</span>
              </div>
              <p className={styles.effectiveText}>
                Effective from {activePricebook.effectiveDate}
              </p>
            </div>
            {!draftPricebook && (
              <button onClick={openCreateModal} className={styles.primaryButton}>
                <PlusIcon /> New Pricebook
              </button>
            )}
          </div>

          <PriceSections prices={activePricebook.prices as PriceMap} meta={meta} />
        </div>
      )}

      {/* No active pricebook */}
      {!activePricebook && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyText}>
            No active pricebook. {!draftPricebook ? "Create one to set your product prices." : "Activate a draft pricebook below."}
          </p>
          {!draftPricebook && (
            <button onClick={openCreateModal} className={styles.emptyButton}>
              <PlusIcon /> Create Pricebook
            </button>
          )}
        </div>
      )}

      {/* Draft Pricebook (dedicated card) */}
      {draftPricebook && (
        <div className={styles.draftCard}>
          <div>
            <div className={styles.titleRow}>
              <div className={styles.dotBlue} />
              <h3 className={styles.pbName}>{draftPricebook.name || "Untitled Draft"}</h3>
              <span className={styles.badgeDraft}>Draft</span>
            </div>
            <p className={styles.effectiveText}>
              Effective from {draftPricebook.effectiveDate || "—"}
            </p>
          </div>
          <div className={styles.draftActions}>
            <button onClick={openDraftModal} className={styles.primaryButton}>
              <EditIcon /> Edit Draft
            </button>
            <button onClick={() => setPendingDiscardDraft(draftPricebook)} className={styles.ghostButton}>
              <TrashIcon /> Discard
            </button>
          </div>
        </div>
      )}

      {/* All Other Pricebooks */}
      {otherPricebooks.length > 0 && (
        <div>
          <h3 className={styles.otherHeading}>Pricebooks</h3>

          {otherPricebooks.slice(0, visibleCount).map((pb) => (
            <div key={pb.id} className={styles.otherCard}>
              <div onClick={() => setViewingPb(pb)} className={styles.otherRow}>
                <div className={styles.otherInfo}>
                  <span className={styles.otherName}>{pb.name}</span>
                  <span className={styles.otherDate}>{pb.effectiveDate}</span>
                  <span className={styles.badgeDeactivated}>Deactivated</span>
                </div>
              </div>
            </div>
          ))}

          {otherPricebooks.length > visibleCount && (
            <button onClick={() => setVisibleCount((c) => c + 5)} className={styles.showMore}>
              Show More ({otherPricebooks.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}

      {/* Create Pricebook Modal */}
      {creating && (
        <div
          className={styles.overlay}
          onClick={(e) => { if (e.target === e.currentTarget) setCreating(false); }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>New Pricebook</h3>
              <button onClick={() => setCreating(false)} className={styles.closeButton}>
                <XIcon />
              </button>
            </div>

            <div className={styles.fieldsRow}>
              <div className={styles.nameField}>
                <label className={`${styles.label} ${styles.fieldLabel}`}>Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. February 2026"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.dateField}>
                <label className={`${styles.label} ${styles.fieldLabel}`}>Effective Date</label>
                <input
                  type="date"
                  value={newEffectiveDate}
                  onChange={(e) => setNewEffectiveDate(e.target.value)}
                  className={styles.dateInput}
                />
              </div>
            </div>

            <PriceSections prices={newPrices} meta={meta} editable onChange={handleNewPriceChange} />

            <div className={styles.modalActions}>
              <button onClick={() => setCreating(false)} className={styles.modalCancel}>
                Cancel
              </button>
              <button onClick={handleCreateSave} className={styles.modalSaveBlue}>
                Save as Draft
              </button>
              <button onClick={handleCreateAndActivate} className={styles.modalSaveGreen}>
                Save & Activate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Draft Pricebook Modal */}
      {editingDraft && draftPricebook && (
        <div
          className={styles.overlay}
          onClick={(e) => { if (e.target === e.currentTarget) setEditingDraft(false); }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Edit Draft Pricebook</h3>
              <button onClick={() => setEditingDraft(false)} className={styles.closeButton}>
                <XIcon />
              </button>
            </div>

            <div className={styles.fieldsRow}>
              <div className={styles.nameField}>
                <label className={`${styles.label} ${styles.fieldLabel}`}>Name</label>
                <input
                  type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. February 2026"
                  className={styles.textInput}
                />
              </div>
              <div className={styles.dateField}>
                <label className={`${styles.label} ${styles.fieldLabel}`}>Effective Date</label>
                <input
                  type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)}
                  className={styles.dateInput}
                />
              </div>
            </div>

            <PriceSections prices={draftPrices} meta={meta} editable onChange={handleDraftPriceChange} />

            <div className={styles.modalActions}>
              <button onClick={() => setEditingDraft(false)} className={styles.modalCancel}>
                Cancel
              </button>
              <button onClick={handleDraftSave} className={styles.modalSaveBlue}>
                Save Draft
              </button>
              <button onClick={handleActivate} className={styles.modalSaveGreen}>
                Activate Pricebook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Deactivated Pricebook Modal */}
      {viewingPb && (
        <div
          className={styles.overlay}
          onClick={(e) => { if (e.target === e.currentTarget) setViewingPb(null); }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div className={styles.viewTitleRow}>
                <h3 className={styles.modalTitle}>{viewingPb.name}</h3>
                <span className={styles.badgeDeactivated}>Deactivated</span>
              </div>
              <button onClick={() => setViewingPb(null)} className={styles.closeButton}>
                <XIcon />
              </button>
            </div>

            <p className={styles.viewEffective}>
              Effective from {viewingPb.effectiveDate}
            </p>

            <PriceSections prices={viewingPb.prices as PriceMap} meta={meta} />

            <div className={styles.viewActions}>
              <button onClick={() => setViewingPb(null)} className={styles.modalCancel}>
                Close
              </button>
              <button onClick={() => setPendingReactivate(viewingPb)} className={styles.reactivateButton}>
                Reactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingReactivate && (
        <ConfirmModal
          title="Reactivate Pricebook"
          message={`Reactivate "${pendingReactivate.name}"? This will deactivate the current active pricebook and set this one as active.`}
          confirmLabel="Reactivate"
          confirmColor="linear-gradient(135deg, #3b82f6, #2563eb)"
          onConfirm={async () => {
            await onActivatePricebook(pendingReactivate.id);
            setPendingReactivate(null);
            setViewingPb(null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onCancel={() => setPendingReactivate(null)}
        />
      )}

      {pendingDiscardDraft && (
        <ConfirmModal
          title="Discard Draft"
          message={`Discard draft "${pendingDiscardDraft.name || "Untitled"}"? This cannot be undone.`}
          confirmLabel="Discard"
          onConfirm={async () => {
            await onDeletePricebook(pendingDiscardDraft.id);
            setPendingDiscardDraft(null);
          }}
          onCancel={() => setPendingDiscardDraft(null)}
        />
      )}
    </>
  );
}
