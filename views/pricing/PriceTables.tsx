import { Fragment } from "react";
import { fmt } from "../../lib/utils";
import type { PriceMap, PriceChangeFn, CategoryMeta } from "./pricingTypes";
import styles from "./PriceTables.module.css";

interface CylinderPriceTableProps {
  products: string[];
  prices: PriceMap | undefined;
  editable: boolean;
  onChange?: PriceChangeFn;
}

function CylinderPriceTable({ products: cylinderProducts, prices, editable, onChange }: CylinderPriceTableProps) {
  return (
    <div className={styles.table}>
      <div className={`${styles.cylinderHeader} ${styles.label}`}>
        <span>Product</span>
        <span className={styles.headerRight}>Full Cylinder</span>
        <span className={styles.headerRight}>Refill</span>
      </div>
      {cylinderProducts.map((product) => {
        const key = `cylinder_${product}`;
        const cylinder = prices?.[key]?.cylinder || 0;
        const refill = prices?.[key]?.refill || 0;
        return (
          <div key={product} className={styles.cylinderRow}>
            <span className={styles.productName}>{product}</span>
            {editable ? (
              <>
                <div className={styles.cellRight}>
                  <input type="number" value={cylinder || ""} onChange={(e) => onChange?.(key, "cylinder", e.target.value)} className={styles.input} />
                </div>
                <div className={styles.cellRight}>
                  <input type="number" value={refill || ""} onChange={(e) => onChange?.(key, "refill", e.target.value)} className={styles.input} />
                </div>
              </>
            ) : (
              <>
                <span className={styles.priceValue}>{fmt(cylinder)}</span>
                <span className={styles.priceValue}>{fmt(refill)}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface AccessoryPriceTableProps {
  label?: string;
  products: string[];
  prices: PriceMap | undefined;
  editable: boolean;
  onChange?: PriceChangeFn;
  keyPrefix?: string;
}

function AccessoryPriceTable({ label, products: accessoryProducts, prices, editable, onChange, keyPrefix = "accessories" }: AccessoryPriceTableProps) {
  return (
    <div className={styles.table}>
      {label && <div className={styles.accessoryLabel}>{label}</div>}
      {accessoryProducts.map((product) => {
        const key = `${keyPrefix}_${product}`;
        const srp = prices?.[key]?.srp || 0;
        return (
          <div key={product} className={styles.accessoryRow}>
            <span className={styles.productName}>{product}</span>
            {editable ? (
              <input type="number" value={srp || ""} onChange={(e) => onChange?.(key, "srp", e.target.value)} className={styles.input} />
            ) : (
              <span className={styles.accessoryValue}>{fmt(srp)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface PriceSectionsProps {
  prices: PriceMap | undefined;
  meta: CategoryMeta;
  editable?: boolean;
  onChange?: PriceChangeFn;
}

// Renders price tables for each category that has products, ordered per
// meta.pricebookCategories. Cylinder → two-price table; everything else →
// single-srp accessory table. Category branch preserved verbatim from
// ProductsPage.renderPriceSections.
export default function PriceSections({ prices, meta, editable = false, onChange }: PriceSectionsProps) {
  const { pricebookCategories, categoryLabels, productNamesInCategory } = meta;
  return (
    <>
      {pricebookCategories.map((cat) => {
        const names = productNamesInCategory(cat);
        if (names.length === 0) return null;
        return (
          <Fragment key={cat}>
            <div className={styles.sectionLabel}>{categoryLabels[cat]}</div>
            <div className={editable ? styles.sectionEditable : styles.section}>
              {cat === "cylinder" ? (
                <CylinderPriceTable products={names} prices={prices} editable={editable} onChange={onChange} />
              ) : (
                <AccessoryPriceTable products={names} prices={prices} editable={editable} onChange={onChange} keyPrefix={cat} />
              )}
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
