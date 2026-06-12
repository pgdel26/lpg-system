import { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDocs, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import {
  buildInventorySections, buildSalesSections, buildPurchaseSections, PRODUCT_SEED_DATA,
} from "../constants";
import type { Product, ProductMap, ProductCategory } from "../types";

type ToastFn = (t: { type: string; message: string }) => void;

export interface UseProductsData {
  products: ProductMap;
  loading: boolean;
  cylinderProducts: string[];
  accessoryGroups: { label: string; products: string[] }[];
  allAccessoryProducts: string[];
  inventorySections: ReturnType<typeof buildInventorySections>;
  salesSections: ReturnType<typeof buildSalesSections>;
  purchaseSections: ReturnType<typeof buildPurchaseSections>;
  addProduct: (category: ProductCategory, name: string) => Promise<void>;
  updateProduct: (productKey: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (productKey: string) => Promise<void>;
}

export function useProductsData(onToast: ToastFn): UseProductsData {
  const [products, setProducts] = useState<ProductMap>({});
  // True until the first products snapshot arrives; drives the app's
  // "Connecting to Firebase..." gate (matches page.js's `loading` state).
  const [loading, setLoading] = useState(true);

  // ---- FIREBASE: Products listener ----
  // No auth gate needed: AppDataProvider only mounts after authentication.
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      const prodMap: ProductMap = {};
      snapshot.forEach((d) => { prodMap[d.id] = d.data() as Product; });
      setProducts(prodMap);
      setLoading(false);
    });
    return () => unsubProducts();
  }, []);

  // ---- Seed products if empty ----
  useEffect(() => {
    if (Object.keys(products).length > 0) return;
    const seedIfNeeded = async () => {
      const snapshot = await getDocs(collection(db, "products"));
      if (!snapshot.empty) return;
      for (let i = 0; i < PRODUCT_SEED_DATA.length; i++) {
        const p = PRODUCT_SEED_DATA[i];
        const key = `${p.category}_${p.name}`;
        await setDoc(doc(db, "products", key), {
          category: p.category, name: p.name, srp: p.srp,
          srpRefill: p.srpRefill, sortOrder: i,
          createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
        });
      }
    };
    seedIfNeeded().catch(console.error);
  }, [products]);

  // Derived lists — verbatim from app/page.js
  const cylinderProducts = useMemo(() =>
    Object.entries(products)
      .filter(([, p]) => p.category === "cylinder")
      .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0))
      .map(([, p]) => p.name),
    [products]);

  const accessoryGroups = useMemo(() => {
    const accessories = Object.entries(products)
      .filter(([, p]) => p.category === "accessories")
      .sort((a, b) => (a[1].sortOrder || 0) - (b[1].sortOrder || 0))
      .map(([, p]) => p.name);
    const regulators = accessories.filter((n) => n.includes("REGULATOR"));
    const others = accessories.filter((n) => !n.includes("REGULATOR"));
    return [
      { label: "REGULATOR", products: regulators },
      { label: "OTHERS", products: others },
    ];
  }, [products]);

  const allAccessoryProducts = useMemo(() =>
    accessoryGroups.flatMap((g) => g.products),
    [accessoryGroups]);

  const inventorySections = useMemo(
    () => buildInventorySections(cylinderProducts, accessoryGroups),
    [cylinderProducts, accessoryGroups],
  );

  const salesSections = useMemo(
    () => buildSalesSections(cylinderProducts, accessoryGroups),
    [cylinderProducts, accessoryGroups],
  );

  const purchaseSections = useMemo(
    () => buildPurchaseSections(cylinderProducts, accessoryGroups),
    [cylinderProducts, accessoryGroups],
  );

  // ---- Handlers — setToast replaced with onToast ----
  const addProduct = useCallback(async (category: ProductCategory, name: string) => {
    try {
      const key = `${category}_${name}`;
      const sortOrder = Object.keys(products).length;
      await setDoc(doc(db, "products", key), {
        category, name, srp: 0, srpRefill: category === "cylinder" ? 0 : null,
        sortOrder, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
      onToast({ type: "success", message: `Product "${name}" added.` });
    } catch (error) {
      console.error("Add product error:", error);
      onToast({ type: "error", message: "Failed to add product." });
    }
  }, [products, onToast]);

  const updateProduct = useCallback(async (productKey: string, updates: Partial<Product>) => {
    try {
      await updateDoc(doc(db, "products", productKey), {
        ...updates, updatedAt: Timestamp.now(),
      });
      onToast({ type: "success", message: "Product updated." });
    } catch (error) {
      console.error("Update product error:", error);
      onToast({ type: "error", message: "Failed to update product." });
    }
  }, [onToast]);

  const deleteProduct = useCallback(async (productKey: string) => {
    try {
      await deleteDoc(doc(db, "products", productKey));
      onToast({ type: "success", message: "Product deleted." });
    } catch (error) {
      console.error("Delete product error:", error);
      onToast({ type: "error", message: "Failed to delete product." });
    }
  }, [onToast]);

  return {
    products,
    loading,
    cylinderProducts,
    accessoryGroups,
    allAccessoryProducts,
    inventorySections,
    salesSections,
    purchaseSections,
    addProduct,
    updateProduct,
    deleteProduct,
  };
}
