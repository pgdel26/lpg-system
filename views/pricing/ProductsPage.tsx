import { useMemo, useState } from "react";
import PricingSubTab from "./PricingSubTab";
import ProductsSubTab from "./ProductsSubTab";
import { buildCategoryMeta } from "./pricingCategories";
import type {
  Pricebook,
  ProductMap,
  CreatePricebookFn,
  UpdatePricebookFn,
  ActivatePricebookFn,
  DeletePricebookFn,
  AddProductFn,
  UpdateProductFn,
  DeleteProductFn,
} from "./pricingTypes";
import styles from "./ProductsPage.module.css";

interface ProductsPageProps {
  products: ProductMap;
  pricebooks: Pricebook[];
  activePricebook: Pricebook | null;
  approverEmail: string;
  onCreatePricebook: CreatePricebookFn;
  onUpdatePricebook: UpdatePricebookFn;
  onActivatePricebook: ActivatePricebookFn;
  onDeletePricebook: DeletePricebookFn;
  onAddProduct: AddProductFn;
  onUpdateProduct: UpdateProductFn;
  onDeleteProduct: DeleteProductFn;
  onSaveApproverEmail: (email: string) => Promise<void>;
}

const subTabs = [
  { key: "pricing", label: "Pricing" },
  { key: "products", label: "Products" },
];

export default function ProductsPage({
  products, pricebooks, activePricebook, approverEmail,
  onCreatePricebook, onUpdatePricebook, onActivatePricebook, onDeletePricebook,
  onAddProduct, onUpdateProduct, onDeleteProduct, onSaveApproverEmail,
}: ProductsPageProps) {
  const [subTab, setSubTab] = useState("pricing");

  // Category metadata is derived once and shared by both sub-tabs (the Products
  // list and the pricebook price tables). Centralizing it keeps the category
  // grouping/ordering in one place — see safe-category-change.
  const meta = useMemo(() => buildCategoryMeta(products), [products]);

  return (
    <div className="animate-fade">
      <div className={styles.subTabs}>
        {subTabs.map((tab) => {
          const isActive = subTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSubTab(tab.key)}
              className={`${styles.subTab} ${isActive ? styles.subTabActive : ""}`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className={styles.card}>
        {subTab === "products" && (
          <ProductsSubTab
            meta={meta}
            onAddProduct={onAddProduct}
            onUpdateProduct={onUpdateProduct}
            onDeleteProduct={onDeleteProduct}
          />
        )}

        {subTab === "pricing" && (
          <PricingSubTab
            products={products}
            pricebooks={pricebooks}
            activePricebook={activePricebook}
            meta={meta}
            approverEmail={approverEmail}
            onCreatePricebook={onCreatePricebook}
            onUpdatePricebook={onUpdatePricebook}
            onActivatePricebook={onActivatePricebook}
            onDeletePricebook={onDeletePricebook}
            onSaveApproverEmail={onSaveApproverEmail}
          />
        )}
      </div>
    </div>
  );
}
