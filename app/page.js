"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db, auth, googleProvider } from "../lib/firebase";
import {
  collection, addDoc, getDocs, query, orderBy, Timestamp,
  doc, updateDoc, onSnapshot, where, setDoc, limit,
} from "firebase/firestore";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { fmt, today, getPricebookSrp } from "../lib/utils";
import {
  FULL_CYLINDER_PRODUCTS,
  INVENTORY_SECTIONS, SALES_SECTIONS, PURCHASE_SECTIONS, PRODUCT_SEED_DATA,
} from "../lib/constants";
import { LoadingIcon, MenuIcon } from "../components/Icons";
import LoginPage from "../components/LoginPage";
import { isEmailAllowed } from "../lib/allowedEmails";
import Sidebar from "../components/Sidebar";
import Toast from "../components/Toast";
import TransactionsPage from "../views/TransactionsPage";
import InventoryPage from "../views/InventoryPage";
import ProductsPage from "../views/ProductsPage";
import CustomersPage from "../views/CustomersPage";
import SaleModal from "../components/SaleModal";
import SwapModal from "../components/SwapModal";
import PurchasesPage from "../views/PurchasesPage";
import PurchaseModal from "../components/PurchaseModal";
import RefundModal from "../components/RefundModal";
import AuditPage from "../views/AuditPage";

// ============================================================
// MAIN APP
// ============================================================
export default function GasulTracker() {
  // Auth
  const [authUser, setAuthUser] = useState(null);   // null = not loaded yet, false = logged out
  const [authLoading, setAuthLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [activePage, setActivePage] = useState("transactions");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // Products
  const [products, setProducts] = useState({});

  // Pricebooks
  const [pricebooks, setPricebooks] = useState([]);
  const [activePricebook, setActivePricebook] = useState(null);

  // Daily Inventory — { [sectionKey]: { [product]: { beg, sold, ... } } }
  const [inventory, setInventory] = useState({});
  const [inventoryDate, setInventoryDate] = useState(today());
  const saveTimerRef = useRef({});

  // Daily Sales — { [saleCategory]: { [product]: soldQty } }
  const [sales, setSales] = useState({});
  // Customers
  const [customers, setCustomers] = useState([]);

  // Sale transactions (per-item records)
  const [saleTransactions, setSaleTransactions] = useState([]);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleModalInvoice, setSaleModalInvoice] = useState("");
  const [saleModalCustomer, setSaleModalCustomer] = useState("");
  const [saleModalNewCustomer, setSaleModalNewCustomer] = useState(false);
  const [saleModalNewName, setSaleModalNewName] = useState("");
  const [saleModalNewPhone, setSaleModalNewPhone] = useState("");
  const [saleModalPayment, setSaleModalPayment] = useState("cash");
  const [saleModalError, setSaleModalError] = useState("");

  // Swaps
  const [swaps, setSwaps] = useState([]);
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [swapProductFrom, setSwapProductFrom] = useState("");
  const [swapProductTo, setSwapProductTo] = useState("");
  const [swapPrice, setSwapPrice] = useState("");
  const [swapCustomFrom, setSwapCustomFrom] = useState("");
  const [swapCustomer, setSwapCustomer] = useState("");
  const [swapNewCustomer, setSwapNewCustomer] = useState(false);
  const [swapNewName, setSwapNewName] = useState("");
  const [swapNewPhone, setSwapNewPhone] = useState("");
  const [swapModalError, setSwapModalError] = useState("");

  // Purchases
  const [purchaseTransactions, setPurchaseTransactions] = useState([]);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseModalDate, setPurchaseModalDate] = useState(today());
  const [purchaseModalError, setPurchaseModalError] = useState("");

  // Refunds
  const [refunds, setRefunds] = useState([]);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundModalError, setRefundModalError] = useState("");

  // Customer form
  const [customerFormName, setCustomerFormName] = useState("");
  const [customerFormPhone, setCustomerFormPhone] = useState("");

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ---- FIREBASE: Auth state listener ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (isEmailAllowed(user.email)) {
          setAuthUser(user);
          setAccessDenied(false);
        } else {
          // Not on the whitelist — sign them out immediately
          await signOut(auth);
          setAuthUser(null);
          setAccessDenied(true);
        }
      } else {
        setAuthUser(null);
        setAccessDenied(false);
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ---- FIREBASE: Products listener ----
  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      const prodMap = {};
      snapshot.forEach((d) => { prodMap[d.id] = d.data(); });
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

  // ---- FIREBASE: Daily inventory listener ----
  useEffect(() => {
    const unsubscribers = INVENTORY_SECTIONS.map((section) => {
      const docId = `${inventoryDate}_${section.key}`;
      return onSnapshot(doc(db, "dailyInventory", docId), (snapshot) => {
        if (snapshot.exists()) {
          setInventory((prev) => ({
            ...prev,
            [section.key]: snapshot.data().items || {},
          }));
        } else {
          setInventory((prev) => ({
            ...prev,
            [section.key]: prev[section.key] || {},
          }));
        }
      });
    });
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [inventoryDate]);

  // ---- FIREBASE: Daily sales listener ----
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "dailySales", inventoryDate), (snapshot) => {
      if (snapshot.exists()) {
        setSales(snapshot.data().items || {});
      } else {
        setSales({});
      }
    });
    return () => unsub();
  }, [inventoryDate]);

  // ---- FIREBASE: Pricebooks listener ----
  useEffect(() => {
    const q = query(collection(db, "pricebooks"), orderBy("effectiveDate", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setPricebooks(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ---- Derive active pricebook for current date ----
  useEffect(() => {
    const applicable = pricebooks.find(
      (pb) => pb.status === "active" && pb.effectiveDate <= inventoryDate
    );
    setActivePricebook(applicable || null);
  }, [pricebooks, inventoryDate]);

  // ---- Create new pricebook (as draft) ----
  const handleCreatePricebook = async (name, effectiveDate, prices) => {
    try {
      const ref = await addDoc(collection(db, "pricebooks"), {
        name,
        effectiveDate,
        prices,
        status: "draft",
        createdAt: Timestamp.now(),
      });
      setToast({ type: "success", message: "Pricebook draft created" });
      return ref.id;
    } catch (error) {
      console.error("Create pricebook error:", error);
      setToast({ type: "error", message: "Failed to create pricebook." });
      return null;
    }
  };

  // ---- Update a draft pricebook ----
  const handleUpdatePricebook = async (pricebookId, data) => {
    try {
      await updateDoc(doc(db, "pricebooks", pricebookId), {
        ...data,
        updatedAt: Timestamp.now(),
      });
      setToast({ type: "success", message: "Pricebook updated" });
    } catch (error) {
      console.error("Update pricebook error:", error);
      setToast({ type: "error", message: "Failed to update pricebook." });
    }
  };

  // ---- Activate a draft pricebook (makes it immutable) ----
  const handleActivatePricebook = async (pricebookId) => {
    try {
      // Deactivate any currently active pricebooks first
      const currentlyActive = pricebooks.filter((pb) => pb.status === "active" && pb.id !== pricebookId);
      for (const pb of currentlyActive) {
        await updateDoc(doc(db, "pricebooks", pb.id), { status: "inactive" });
      }
      await updateDoc(doc(db, "pricebooks", pricebookId), {
        status: "active",
        activatedAt: Timestamp.now(),
      });
      setToast({ type: "success", message: "Pricebook activated" });
    } catch (error) {
      console.error("Activate pricebook error:", error);
      setToast({ type: "error", message: "Failed to activate pricebook." });
    }
  };

  // ---- FIREBASE: Customers listener ----
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "customers"), orderBy("name", "asc")),
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setCustomers(list);
      }
    );
    return () => unsub();
  }, []);

  // ---- FIREBASE: Swaps listener (by date) ----
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "swaps"), where("date", "==", inventoryDate), orderBy("createdAt", "desc")),
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setSwaps(list);
      }
    );
    return () => unsub();
  }, [inventoryDate]);

  // ---- FIREBASE: Purchases listener (all recent) ----
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "purchases"), orderBy("createdAt", "desc"), limit(100)),
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setPurchaseTransactions(list);
      }
    );
    return () => unsub();
  }, []);

  // ---- FIREBASE: Sale transactions listener (by date) ----
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "saleTransactions"), where("date", "==", inventoryDate), orderBy("createdAt", "desc")),
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setSaleTransactions(list);

        // Sync sale counts back to daily sales for inventory tracking
        const saleCounts = {};
        list.forEach((t) => {
          if (!saleCounts[t.saleSection]) saleCounts[t.saleSection] = {};
          saleCounts[t.saleSection][t.product] = (saleCounts[t.saleSection][t.product] || 0) + (t.quantity || 1);
        });
        setSales((prev) => ({ ...prev, ...saleCounts }));
      }
    );
    return () => unsub();
  }, [inventoryDate]);

  // ---- FIREBASE: Refunds listener (by date) ----
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "refunds"), where("date", "==", inventoryDate), orderBy("createdAt", "desc")),
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setRefunds(list);
      }
    );
    return () => unsub();
  }, [inventoryDate]);

  // ---- Update a single inventory cell (local state, debounced save) ----
  const handleInventoryChange = useCallback((sectionKey, product, field, value) => {
    setInventory((prev) => ({
      ...prev,
      [sectionKey]: {
        ...prev[sectionKey],
        [product]: {
          ...(prev[sectionKey]?.[product] || {}),
          [field]: value,
        },
      },
    }));
  }, []);

  // ---- Save a section to Firestore (debounced) ----
  const saveSection = useCallback((sectionKey) => {
    if (saveTimerRef.current[sectionKey]) {
      clearTimeout(saveTimerRef.current[sectionKey]);
    }
    saveTimerRef.current[sectionKey] = setTimeout(async () => {
      const docId = `${inventoryDate}_${sectionKey}`;
      const items = inventory[sectionKey] || {};
      try {
        await setDoc(doc(db, "dailyInventory", docId), {
          date: inventoryDate, section: sectionKey,
          items, updatedAt: Timestamp.now(),
        }, { merge: true });
      } catch (error) {
        console.error("Save error:", error);
        setToast({ type: "error", message: "Failed to save. Check connection." });
      }
    }, 500);
  }, [inventoryDate, inventory]);

  // ---- Add Customer ----
  const handleAddCustomer = async () => {
    const name = customerFormName.trim();
    if (!name) { setToast({ type: "error", message: "Customer name is required." }); return; }
    try {
      await addDoc(collection(db, "customers"), {
        name,
        phone: customerFormPhone.trim(),
        createdAt: Timestamp.now(),
      });
      setCustomerFormName("");
      setCustomerFormPhone("");
      setToast({ type: "success", message: `Added customer: ${name}` });
    } catch (error) {
      console.error("Add customer error:", error);
      setToast({ type: "error", message: "Failed to add customer." });
    }
  };

  // ---- Helper: find or create customer ----
  // If "new customer" mode and phone matches an existing customer, reuse them
  const findOrCreateCustomer = async (isNew, selectedId, newName, newPhone) => {
    if (isNew) {
      const phone = newPhone.trim();
      if (phone) {
        const existing = customers.find(
          (c) => c.phone && c.phone.trim() === phone
        );
        if (existing) {
          return { id: existing.id, name: existing.name };
        }
      }
      const ref = await addDoc(collection(db, "customers"), {
        name: newName.trim(),
        phone,
        createdAt: Timestamp.now(),
      });
      return { id: ref.id, name: newName.trim() };
    }
    const cust = customers.find((c) => c.id === selectedId);
    return { id: selectedId, name: cust?.name || "" };
  };

  // ---- Record Swap ----
  const handleRecordSwap = async () => {
    setSwapModalError("");
    if (!swapProductFrom) { setSwapModalError("Please select the product to swap."); return; }
    if (!swapProductTo) { setSwapModalError("Please select the product to buy."); return; }
    if (swapProductFrom === "Other" && !swapCustomFrom.trim()) { setSwapModalError("Please enter the product name."); return; }
    if (swapNewCustomer && !swapNewName.trim()) { setSwapModalError("Please enter customer name."); return; }

    const resolvedFrom = swapProductFrom === "Other" ? swapCustomFrom.trim() : swapProductFrom;
    const resolvedTo = swapProductTo;
    if (resolvedFrom === resolvedTo) { setSwapModalError("Products must be different."); return; }

    const price = parseFloat(swapPrice) || 0;
    if (price <= 0) { setSwapModalError("Please enter a purchase price."); return; }

    try {
      let customerId = "";
      let customerName = "";

      if (swapNewCustomer || swapCustomer) {
        const result = await findOrCreateCustomer(
          swapNewCustomer, swapCustomer, swapNewName, swapNewPhone
        );
        customerId = result.id;
        customerName = result.name;
      }

      await addDoc(collection(db, "swaps"), {
        productFrom: resolvedFrom,
        productTo: resolvedTo,
        price,
        customerId,
        customerName,
        date: inventoryDate,
        createdAt: Timestamp.now(),
      });

      setSwapModalOpen(false);
      setSwapProductFrom("");
      setSwapProductTo("");
      setSwapPrice("");
      setSwapCustomFrom("");
      setSwapCustomer("");
      setSwapNewCustomer(false);
      setSwapNewName("");
      setSwapNewPhone("");
      setToast({ type: "success", message: `Swap recorded: ${resolvedFrom} → ${resolvedTo} (${fmt(price)})` });
    } catch (error) {
      console.error("Swap error:", error);
      setSwapModalError("Failed to record swap.");
    }
  };

  // ---- Record Sale (multi-item) ----
  const handleRecordSale = async (items, globalDiscount, saleDate) => {
    setSaleModalError("");
    if (!items || items.length === 0) { setSaleModalError("Please add at least one item."); return; }
    if (!saleModalCustomer && !saleModalNewCustomer) { setSaleModalError("Please select or add a customer."); return; }
    if (saleModalNewCustomer && !saleModalNewName.trim()) { setSaleModalError("Please enter customer name."); return; }

    try {
      const { id: customerId, name: customerName } = await findOrCreateCustomer(
        saleModalNewCustomer, saleModalCustomer, saleModalNewName, saleModalNewPhone
      );

      const invoiceTrimmed = saleModalInvoice.trim();
      const now = Timestamp.now();

      // Calculate subtotal to distribute discount proportionally
      const subtotal = items.reduce((sum, item) => {
        const saleSec = SALES_SECTIONS.find((s) => s.key === item.section);
        if (!saleSec) return sum;
        const prodKey = `${saleSec.productCategory}_${item.product}`;
        const srp = getPricebookSrp(item.section, prodKey, activePricebook?.prices);
        return sum + srp * (parseInt(item.qty) || 1);
      }, 0);

      let discountRemaining = globalDiscount || 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const saleSec = SALES_SECTIONS.find((s) => s.key === item.section);
        if (!saleSec) continue;
        const prodKey = `${saleSec.productCategory}_${item.product}`;
        const srp = getPricebookSrp(item.section, prodKey, activePricebook?.prices);
        const qty = parseInt(item.qty) || 1;
        const lineSubtotal = srp * qty;

        // Distribute discount proportionally; last item gets the remainder
        let lineDiscount = 0;
        if (discountRemaining > 0 && subtotal > 0) {
          if (i === items.length - 1) {
            lineDiscount = discountRemaining;
          } else {
            lineDiscount = Math.round((lineSubtotal / subtotal) * (globalDiscount || 0) * 100) / 100;
            discountRemaining -= lineDiscount;
          }
        }

        const totalAmount = Math.max(0, lineSubtotal - lineDiscount);

        await addDoc(collection(db, "saleTransactions"), {
          saleSection: item.section,
          product: item.product,
          productCategory: saleSec.productCategory,
          srp,
          discount: lineDiscount,
          finalPrice: srp,
          quantity: qty,
          totalAmount,
          invoice: invoiceTrimmed,
          customerId,
          customerName,
          paymentType: saleModalPayment,
          date: saleDate || inventoryDate,
          createdAt: now,
        });
      }

      setSaleModalOpen(false);
      setSaleModalInvoice("");
      setSaleModalCustomer("");
      setSaleModalNewCustomer(false);
      setSaleModalNewName("");
      setSaleModalNewPhone("");
      setSaleModalPayment("cash");
      const totalItems = items.reduce((sum, i) => sum + (parseInt(i.qty) || 1), 0);
      setToast({ type: "success", message: `Sale recorded: ${totalItems} item${totalItems > 1 ? "s" : ""} for ${customerName}` });
    } catch (error) {
      console.error("Sale error:", error);
      setSaleModalError("Failed to record sale.");
    }
  };

  // ---- Resolved inventory: merges raw inventory + sales-sourced values ----
  const resolvedInventory = useMemo(() => {
    const resolved = {};

    // Aggregate purchase quantities for current date: { [purchaseSection]: { [product]: totalQty } }
    const purchaseCounts = {};
    purchaseTransactions.filter((t) => t.date === inventoryDate).forEach((t) => {
      if (!purchaseCounts[t.purchaseSection]) purchaseCounts[t.purchaseSection] = {};
      purchaseCounts[t.purchaseSection][t.product] = (purchaseCounts[t.purchaseSection][t.product] || 0) + (t.quantity || 0);
    });

    // Aggregate swap counts by productTo and productFrom
    const swapToCounts = {};   // full cylinders going out
    const swapFromCounts = {}; // empty cylinders coming in
    swaps.forEach((s) => {
      swapToCounts[s.productTo] = (swapToCounts[s.productTo] || 0) + 1;
      // Only count "from" if it's a known product (not a custom/other brand name)
      if (FULL_CYLINDER_PRODUCTS.includes(s.productFrom)) {
        swapFromCounts[s.productFrom] = (swapFromCounts[s.productFrom] || 0) + 1;
      }
    });

    // Pass 1: resolve salesSource, purchaseSource, and swapSource values into each section
    for (const section of INVENTORY_SECTIONS) {
      resolved[section.key] = {};
      for (const product of section.products) {
        const row = { ...(inventory[section.key]?.[product] || {}) };
        for (const col of section.columns) {
          if (col.salesSource) {
            row[col.field] = (sales[col.salesSource] || {})[product] || 0;
          }
          if (col.purchaseSource) {
            row[col.field] = (purchaseCounts[col.purchaseSource] || {})[product] || 0;
          }
          if (col.swapSource === "to") {
            row[col.field] = swapToCounts[product] || 0;
          }
          if (col.swapSource === "from") {
            row[col.field] = swapFromCounts[product] || 0;
          }
        }
        resolved[section.key][product] = row;
      }
    }
    // Pass 2: resolve cross-section sources
    for (const section of INVENTORY_SECTIONS) {
      for (const product of section.products) {
        for (const col of section.columns) {
          if (col.source) {
            const srcRow = resolved[col.source.section]?.[product] || {};
            resolved[section.key][product][col.field] = srcRow[col.source.field] || 0;
          }
        }
      }
    }
    return resolved;
  }, [inventory, sales, purchaseTransactions, swaps, inventoryDate]);

  // ---- Initialize today from previous day's data ----
  const initFromPreviousDay = async () => {
    try {
      const prevAllItems = {};
      for (const section of INVENTORY_SECTIONS) {
        const q2 = query(
          collection(db, "dailyInventory"),
          where("section", "==", section.key),
          where("date", "<", inventoryDate),
          orderBy("date", "desc"),
          limit(1)
        );
        const snap = await getDocs(q2);
        prevAllItems[section.key] = snap.empty ? {} : (snap.docs[0].data().items || {});
      }

      const prevSalesQ = query(
        collection(db, "dailySales"),
        where("date", "<", inventoryDate),
        orderBy("date", "desc"),
        limit(1)
      );
      const prevSalesSnap = await getDocs(prevSalesQ);
      const prevSales = prevSalesSnap.empty ? {} : (prevSalesSnap.docs[0].data().items || {});

      for (const section of INVENTORY_SECTIONS) {
        for (const product of section.products) {
          if (!prevAllItems[section.key][product]) prevAllItems[section.key][product] = {};
          for (const col of section.columns) {
            if (col.salesSource) {
              prevAllItems[section.key][product][col.field] = (prevSales[col.salesSource] || {})[product] || 0;
            }
          }
        }
      }

      for (const section of INVENTORY_SECTIONS) {
        const prevItems = prevAllItems[section.key] || {};
        const newItems = {};

        for (const product of section.products) {
          const prev = { ...(prevItems[product] || {}) };
          for (const col of section.columns) {
            if (col.source) {
              const srcItems = prevAllItems[col.source.section] || {};
              const srcRow = srcItems[product] || {};
              prev[col.field] = srcRow[col.source.field] || 0;
            }
          }
          const prevEnd = section.calcEnd(prev);
          const prevAud = prev.aud;
          const beg = (prevAud != null && prevAud !== "") ? parseFloat(prevAud) || 0 : prevEnd;
          newItems[product] = { beg };
        }

        const docId = `${inventoryDate}_${section.key}`;
        await setDoc(doc(db, "dailyInventory", docId), {
          date: inventoryDate, section: section.key,
          items: newItems, updatedAt: Timestamp.now(),
        });
      }

      setToast({ type: "success", message: "Beginning inventory loaded from previous day." });
    } catch (error) {
      console.error("Init error:", error);
      setToast({ type: "error", message: "Failed to load previous day data." });
    }
  };

  // ---- Total Cylinder computed view ----
  const totalCylinderData = useMemo(() => {
    const fullSection = INVENTORY_SECTIONS.find((s) => s.key === "full");
    const emptySection = INVENTORY_SECTIONS.find((s) => s.key === "empty");

    return FULL_CYLINDER_PRODUCTS.map((product) => {
      const fullRow = resolvedInventory.full?.[product] || {};
      const emptyRow = resolvedInventory.empty?.[product] || {};

      const fullBeg = fullRow.beg || 0;
      const emptyBeg = emptyRow.beg || 0;
      const fullEnd = fullSection.calcEnd(fullRow);
      const emptyEnd = emptySection.calcEnd(emptyRow);
      const fullAud = fullRow.aud != null && fullRow.aud !== "" ? parseFloat(fullRow.aud) || 0 : null;
      const emptyAud = emptyRow.aud != null && emptyRow.aud !== "" ? parseFloat(emptyRow.aud) || 0 : null;

      const beg = fullBeg + emptyBeg;
      const end = fullEnd + emptyEnd;
      const aud = (fullAud != null && emptyAud != null) ? fullAud + emptyAud : null;
      const variance = aud != null ? aud - end : null;

      return { product, beg, end, aud, var: variance };
    });
  }, [resolvedInventory]);

  // ---- Callback handlers for SalesPage ----
  const handleOpenSaleModal = () => {
    setSaleModalOpen(true);
    setSaleModalInvoice("");
    setSaleModalCustomer("");
    setSaleModalNewCustomer(false);
    setSaleModalNewName("");
    setSaleModalNewPhone("");
    setSaleModalPayment("cash");
    setSaleModalError("");
  };

  const handleOpenSwapModal = () => {
    setSwapModalOpen(true);
    setSwapModalError("");
    setSwapProductFrom(FULL_CYLINDER_PRODUCTS[0]);
    setSwapProductTo(FULL_CYLINDER_PRODUCTS[1]);
    setSwapPrice("");
    setSwapCustomFrom("");
    setSwapCustomer("");
    setSwapNewCustomer(false);
    setSwapNewName("");
    setSwapNewPhone("");
  };

  const handleOpenPurchaseModal = () => {
    setPurchaseModalOpen(true);
    setPurchaseModalDate(today());
    setPurchaseModalError("");
  };

  const handleRecordPurchase = async (items) => {
    setPurchaseModalError("");
    if (!purchaseModalDate) { setPurchaseModalError("Please select a date."); return; }
    if (!items || items.length === 0) { setPurchaseModalError("Please add at least one item."); return; }

    for (const item of items) {
      const qty = parseInt(item.qty) || 0;
      const unitCost = parseFloat(item.price) || 0;
      if (qty <= 0) { setPurchaseModalError("Each item must have a quantity of at least 1."); return; }
      if (unitCost <= 0) { setPurchaseModalError("Each item must have a purchase price."); return; }
    }

    try {
      const now = Timestamp.now();
      let totalItems = 0;

      for (const item of items) {
        const sec = PURCHASE_SECTIONS.find((s) => s.key === item.section);
        const qty = parseInt(item.qty) || 1;
        const unitCost = parseFloat(item.price) || 0;

        await addDoc(collection(db, "purchases"), {
          purchaseSection: item.section,
          product: item.product,
          productCategory: sec?.productCategory || "full",
          quantity: qty,
          unitCost,
          totalCost: qty * unitCost,
          date: purchaseModalDate,
          createdAt: now,
        });
        totalItems += qty;
      }

      setPurchaseModalOpen(false);
      setToast({ type: "success", message: `Purchase recorded: ${totalItems} item${totalItems > 1 ? "s" : ""}` });
    } catch (error) {
      console.error("Purchase error:", error);
      setPurchaseModalError("Failed to record purchase.");
    }
  };

  const handleOpenRefundModal = () => {
    setRefundModalOpen(true);
    setRefundModalError("");
  };

  const handleRecordRefund = async (data) => {
    setRefundModalError("");
    if (!data.items || data.items.length === 0) { setRefundModalError("Please add at least one item."); return; }
    if ((data.totalRefund || 0) <= 0) { setRefundModalError("Please enter a refund amount."); return; }

    try {
      await addDoc(collection(db, "refunds"), {
        invoice: data.invoice || "",
        customerName: data.customerName || "",
        customerId: data.customerId || "",
        items: data.items.map((item) => ({
          section: item.section,
          product: item.product,
          qty: parseInt(item.qty) || 1,
        })),
        totalRefund: data.totalRefund,
        reason: data.reason || "",
        date: inventoryDate,
        createdAt: Timestamp.now(),
      });

      setRefundModalOpen(false);
      const totalItems = data.items.reduce((sum, i) => sum + (parseInt(i.qty) || 1), 0);
      setToast({ type: "success", message: `Refund recorded: ${totalItems} item${totalItems > 1 ? "s" : ""} — ${fmt(data.totalRefund)}` });
    } catch (error) {
      console.error("Refund error:", error);
      setRefundModalError("Failed to record refund.");
    }
  };

  // ---- RENDER ----

  // Auth loading
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <LoadingIcon />
      </div>
    );
  }

  // Not logged in, or access denied
  if (!authUser) {
    return (
      <LoginPage
        denied={accessDenied}
        deniedEmail={auth.currentUser?.email || ""}
        onRetry={() => setAccessDenied(false)}
      />
    );
  }

  // App loading (Firestore data)
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <LoadingIcon />
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Connecting to Firebase...</p>
      </div>
    );
  }

  const sidebarWidth = sidebarCollapsed ? 60 : 220;

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Ambient glows */}
      <div style={{ position: "fixed", top: "-200px", right: "-200px", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(37,99,235,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-300px", left: "-200px", width: "700px", height: "700px", background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Sidebar */}
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main content */}
      <div style={{ marginLeft: `${sidebarWidth}px`, transition: "margin-left 0.25s ease", minHeight: "100vh" }}>
        {/* Top bar */}
        <header style={{
          padding: "16px 24px", borderBottom: "none",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          position: "sticky", top: 0, zIndex: 30,
          backdropFilter: "blur(20px)", background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "rgba(255,255,255,0.8)", display: "flex", padding: "4px",
              }}
            >
              <MenuIcon />
            </button>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#fff" }}>
              {activePage === "transactions" ? "Sales" : activePage === "purchases" ? "Purchases" : activePage === "inventory" ? "Daily Inventory" : activePage === "audit" ? "Audit" : activePage === "customers" ? "Customers" : "Pricing"}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-mono)" }}>
              {new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </div>
            {/* User info + logout */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {authUser.photoURL && (
                <img
                  src={authUser.photoURL}
                  alt={authUser.displayName || ""}
                  style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)" }}
                />
              )}
              <button
                onClick={() => signOut(auth)}
                style={{
                  padding: "5px 10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.2)",
                  cursor: "pointer", background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.7)", fontSize: "11px", fontWeight: 600,
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main style={{ padding: "20px 24px" }}>
          {activePage === "transactions" && (
            <TransactionsPage
              inventoryDate={inventoryDate}
              setInventoryDate={setInventoryDate}
              saleTransactions={saleTransactions}
              swaps={swaps}
              refunds={refunds}
              onOpenSaleModal={handleOpenSaleModal}
              onOpenSwapModal={handleOpenSwapModal}
              onOpenRefundModal={handleOpenRefundModal}
            />
          )}

          {activePage === "purchases" && (
            <PurchasesPage
              purchaseTransactions={purchaseTransactions}
              onOpenPurchaseModal={handleOpenPurchaseModal}
            />
          )}

          {activePage === "inventory" && (
            <InventoryPage
              inventoryDate={inventoryDate}
              setInventoryDate={setInventoryDate}
              resolvedInventory={resolvedInventory}
              totalCylinderData={totalCylinderData}
              onInventoryChange={handleInventoryChange}
              onSaveSection={saveSection}
              onInitFromPreviousDay={initFromPreviousDay}
            />
          )}

          {activePage === "audit" && (
            <AuditPage
              inventoryDate={inventoryDate}
              setInventoryDate={setInventoryDate}
              inventory={inventory}
              onInventoryChange={handleInventoryChange}
              onSaveSection={saveSection}
            />
          )}

          {activePage === "products" && (
            <ProductsPage
              products={products}
              pricebooks={pricebooks}
              activePricebook={activePricebook}
              onCreatePricebook={handleCreatePricebook}
              onUpdatePricebook={handleUpdatePricebook}
              onActivatePricebook={handleActivatePricebook}
            />
          )}

          {activePage === "customers" && (
            <CustomersPage
              customers={customers}
              formName={customerFormName}
              setFormName={setCustomerFormName}
              formPhone={customerFormPhone}
              setFormPhone={setCustomerFormPhone}
              onAddCustomer={handleAddCustomer}
            />
          )}
        </main>
      </div>

      {/* ---- MODALS ---- */}
      {swapModalOpen && (
        <SwapModal
          productFrom={swapProductFrom}
          setProductFrom={setSwapProductFrom}
          productTo={swapProductTo}
          setProductTo={setSwapProductTo}
          customFrom={swapCustomFrom}
          setCustomFrom={setSwapCustomFrom}
          price={swapPrice}
          setPrice={setSwapPrice}
          customer={swapCustomer}
          setCustomer={setSwapCustomer}
          newCustomer={swapNewCustomer}
          setNewCustomer={setSwapNewCustomer}
          newName={swapNewName}
          setNewName={setSwapNewName}
          newPhone={swapNewPhone}
          setNewPhone={setSwapNewPhone}
          customers={customers}
          error={swapModalError}
          onClose={() => setSwapModalOpen(false)}
          onSubmit={handleRecordSwap}
        />
      )}

      {saleModalOpen && (
        <SaleModal
          invoice={saleModalInvoice}
          setInvoice={setSaleModalInvoice}
          customer={saleModalCustomer}
          setCustomer={setSaleModalCustomer}
          newCustomer={saleModalNewCustomer}
          setNewCustomer={setSaleModalNewCustomer}
          newName={saleModalNewName}
          setNewName={setSaleModalNewName}
          newPhone={saleModalNewPhone}
          setNewPhone={setSaleModalNewPhone}
          payment={saleModalPayment}
          setPayment={setSaleModalPayment}
          error={saleModalError}
          customers={customers}
          activePricebook={activePricebook}
          inventoryDate={inventoryDate}
          onClose={() => setSaleModalOpen(false)}
          onSubmit={handleRecordSale}
        />
      )}

      {purchaseModalOpen && (
        <PurchaseModal
          date={purchaseModalDate}
          setDate={setPurchaseModalDate}
          error={purchaseModalError}
          onClose={() => setPurchaseModalOpen(false)}
          onSubmit={handleRecordPurchase}
        />
      )}

      {refundModalOpen && (
        <RefundModal
          saleTransactions={saleTransactions}
          error={refundModalError}
          onClose={() => setRefundModalOpen(false)}
          onSubmit={handleRecordRefund}
        />
      )}

      <Toast toast={toast} />
    </div>
  );
}
