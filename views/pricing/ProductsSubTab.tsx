import { useState } from "react";
import { PlusIcon, EditIcon, TrashIcon } from "../../components/Icons";
import ConfirmModal from "../../components/ConfirmModal";
import type {
  CategoryMeta,
  ProductRow,
  AddProductFn,
  UpdateProductFn,
  DeleteProductFn,
} from "./pricingTypes";
import styles from "./ProductsSubTab.module.css";

interface ProductsSubTabProps {
  meta: CategoryMeta;
  onAddProduct: AddProductFn;
  onUpdateProduct: UpdateProductFn;
  onDeleteProduct: DeleteProductFn;
}

export default function ProductsSubTab({
  meta,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
}: ProductsSubTabProps) {
  const { productsByCategory, allCategories, categoryLabels, categoryColors } = meta;

  // Products sub-tab state
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCategory, setNewProductCategory] = useState("cylinder");
  const [newCustomCategory, setNewCustomCategory] = useState("");
  const [editingProductKey, setEditingProductKey] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState("");
  const [editProductCategory, setEditProductCategory] = useState("");
  const [editCustomCategory, setEditCustomCategory] = useState("");
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<ProductRow | null>(null);

  const handleAddProductSubmit = async () => {
    if (!newProductName.trim()) return;
    const category = newProductCategory === "__new__"
      ? newCustomCategory.trim().toLowerCase().replace(/\s+/g, "_")
      : newProductCategory;
    if (!category) return;
    await onAddProduct(category, newProductName.trim().toUpperCase());
    setNewProductName("");
    setNewCustomCategory("");
    setNewProductCategory("cylinder");
    setAddingProduct(false);
  };

  const startEditProduct = (prod: ProductRow) => {
    setEditingProductKey(prod.key);
    setEditProductName(prod.name);
    setEditProductCategory(prod.category);
  };

  const handleEditProductSave = async () => {
    if (!editProductName.trim() || !editingProductKey) return;
    const category = editProductCategory === "__new__"
      ? editCustomCategory.trim().toLowerCase().replace(/\s+/g, "_")
      : editProductCategory;
    if (!category) return;
    await onUpdateProduct(editingProductKey, {
      name: editProductName.trim().toUpperCase(),
      category,
    });
    setEditingProductKey(null);
    setEditCustomCategory("");
  };

  return (
    <div>
      <div className={styles.header}>
        <h3 className={styles.heading}>Products</h3>
        <button onClick={() => setAddingProduct(true)} className={styles.addButton}>
          <PlusIcon /> Add Product
        </button>
      </div>

      {/* Add Product Form */}
      {addingProduct && (
        <div className={styles.addForm}>
          <div className={styles.addFormRow}>
            <div className={styles.fieldGrow}>
              <label className={`${styles.label} ${styles.fieldLabel}`}>Product Name</label>
              <input
                type="text"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                placeholder="e.g. 15KG PASAK"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAddProductSubmit()}
                className={styles.textInput}
              />
            </div>
            <div className={styles.fieldFixed}>
              <label className={`${styles.label} ${styles.fieldLabel}`}>Category</label>
              <select
                value={newProductCategory}
                onChange={(e) => { setNewProductCategory(e.target.value); if (e.target.value !== "__new__") setNewCustomCategory(""); }}
                className={styles.select}
              >
                {allCategories.map((cat) => (
                  <option key={cat} value={cat}>{categoryLabels[cat]}</option>
                ))}
                <option value="__new__">+ New Category</option>
              </select>
            </div>
            {newProductCategory === "__new__" && (
              <div className={styles.fieldFixed}>
                <label className={`${styles.label} ${styles.fieldLabel}`}>New Category Name</label>
                <input
                  type="text"
                  value={newCustomCategory}
                  onChange={(e) => setNewCustomCategory(e.target.value)}
                  placeholder="e.g. Hose"
                  className={styles.textInput}
                />
              </div>
            )}
            <div className={styles.formActions}>
              <button onClick={handleAddProductSubmit} className={styles.saveButton}>
                Save
              </button>
              <button
                onClick={() => { setAddingProduct(false); setNewProductName(""); }}
                className={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product list by category */}
      {allCategories.map((cat) => {
        const items = (productsByCategory[cat] || []).slice().sort((a, b) => a.name.localeCompare(b.name));
        if (items.length === 0) return null;
        return (
          <div key={cat} className={styles.categoryGroup}>
            <div className={styles.categoryHeader}>
              <div className={styles.categoryDot} style={{ background: categoryColors[cat] }} />
              <span className={`${styles.label} ${styles.categoryName}`}>{categoryLabels[cat]}</span>
              <span className={styles.categoryCount}>({items.length})</span>
            </div>
            <div className={styles.list}>
              {items.map((prod) => (
                <div key={prod.key} className={styles.row}>
                  {editingProductKey === prod.key ? (
                    <>
                      <div className={styles.editFields}>
                        <input
                          type="text"
                          value={editProductName}
                          onChange={(e) => setEditProductName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleEditProductSave()}
                          autoFocus
                          className={styles.editNameInput}
                        />
                        <select
                          value={editProductCategory}
                          onChange={(e) => { setEditProductCategory(e.target.value); if (e.target.value !== "__new__") setEditCustomCategory(""); }}
                          className={styles.editSelect}
                        >
                          {allCategories.map((c) => (
                            <option key={c} value={c}>{categoryLabels[c]}</option>
                          ))}
                          <option value="__new__">+ New Category</option>
                        </select>
                        {editProductCategory === "__new__" && (
                          <input
                            type="text"
                            value={editCustomCategory}
                            onChange={(e) => setEditCustomCategory(e.target.value)}
                            placeholder="New category"
                            className={styles.editCustomInput}
                          />
                        )}
                      </div>
                      <div className={styles.editActions}>
                        <button onClick={handleEditProductSave} className={styles.editSave}>
                          Save
                        </button>
                        <button onClick={() => setEditingProductKey(null)} className={styles.editCancel}>
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className={styles.productName}>{prod.name}</span>
                      <div className={styles.rowActions}>
                        <button
                          onClick={() => startEditProduct(prod)}
                          className={`${styles.iconButton} ${styles.iconButtonEdit}`}
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => setPendingDeleteProduct(prod)}
                          className={`${styles.iconButton} ${styles.iconButtonDelete}`}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {pendingDeleteProduct && (
        <ConfirmModal
          title="Delete Product"
          message={`Delete "${pendingDeleteProduct.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => { onDeleteProduct(pendingDeleteProduct.key); setPendingDeleteProduct(null); }}
          onCancel={() => setPendingDeleteProduct(null)}
        />
      )}
    </div>
  );
}
