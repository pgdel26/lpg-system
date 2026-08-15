"use client";
import { useMemo } from "react";
import { useParams } from "next/navigation";
import { useAppData } from "../../../../lib/providers/AppDataProvider";
import InventoryTabPage from "../../../../views/inventory/InventoryTabPage";

export default function InventoryRoutePage() {
  const { branch } = useParams<{ branch: string }>();
  const data = useAppData();

  // ---- Total Cylinder computed view (cross-section, view-only) ----
  // Lives here (not in a hook) because it is purely derived from the
  // already-exposed resolvedInventory / inventorySections / cylinderProducts.
  const totalCylinderData = useMemo(() => {
    const fullSection = data.inventorySections.find((s) => s.key === "full");
    const emptySection = data.inventorySections.find((s) => s.key === "empty");
    if (!fullSection || !emptySection) return [];

    return data.cylinderProducts.map((product) => {
      const fullRow = data.resolvedInventory.full?.[product] || {};
      const emptyRow = data.resolvedInventory.empty?.[product] || {};
      // Read raw cell values loosely: at runtime `aud` may be a number, a string,
      // null, or absent. The typed InventoryRow narrows `aud` to number|FieldValue,
      // so go through `unknown` to reproduce page.js's permissive checks.
      const fullAudRaw = (fullRow as Record<string, unknown>).aud;
      const emptyAudRaw = (emptyRow as Record<string, unknown>).aud;

      const fullBeg = (fullRow.beg as number) || 0;
      const emptyBeg = (emptyRow.beg as number) || 0;
      const fullEnd = fullSection.calcEnd(fullRow);
      const emptyEnd = emptySection.calcEnd(emptyRow);
      const fullAud = fullAudRaw != null && fullAudRaw !== "" ? parseFloat(String(fullAudRaw)) || 0 : null;
      const emptyAud = emptyAudRaw != null && emptyAudRaw !== "" ? parseFloat(String(emptyAudRaw)) || 0 : null;

      const beg = fullBeg + emptyBeg;
      const end = fullEnd + emptyEnd;
      const aud = (fullAud != null && emptyAud != null) ? fullAud + emptyAud : null;
      const variance = aud != null ? aud - end : null;

      return { product, beg, end, aud, var: variance };
    });
  }, [data.resolvedInventory, data.inventorySections, data.cylinderProducts]);

  return (
    <InventoryTabPage
      branch={branch}
      branches={data.branches}
      purchaseSections={data.purchaseSections}
      onRecordTransfer={data.recordTransfer}
      inventoryDate={data.inventoryDate}
      setInventoryDate={data.setInventoryDate}
      resolvedInventory={data.resolvedInventory}
      totalCylinderData={totalCylinderData}
      inventorySections={data.inventorySections}
      onInventoryChange={data.handleInventoryChange}
      onSaveSection={data.saveSection}
      onFixBeginning={data.handleFixBeginning}
      inventory={data.inventory}
      staff={data.staff}
    />
  );
}
