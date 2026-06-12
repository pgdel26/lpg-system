import { XIcon, SwapIcon } from "./Icons";
import CustomerSearch from "./CustomerSearch";
import styles from "./SwapModal.module.css";
import type { Customer } from "../lib/types";

interface SwapModalProps {
  productFrom: string;
  setProductFrom: (v: string) => void;
  productTo: string;
  setProductTo: (v: string) => void;
  customFrom: string;
  setCustomFrom: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  customer: string;
  setCustomer: (v: string) => void;
  newCustomer: boolean;
  setNewCustomer: (v: boolean) => void;
  newName: string;
  setNewName: (v: string) => void;
  newPhone: string;
  setNewPhone: (v: string) => void;
  customers: Customer[];
  cylinderProducts: string[];
  error: string;
  onClose: () => void;
  onSubmit: () => void;
}

export default function SwapModal({
  productFrom, setProductFrom,
  productTo, setProductTo,
  customFrom, setCustomFrom,
  price, setPrice,
  customer, setCustomer,
  newCustomer, setNewCustomer,
  newName, setNewName,
  newPhone, setNewPhone,
  customers,
  cylinderProducts,
  error,
  onClose, onSubmit,
}: SwapModalProps) {
  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.dialog}>
        <div className={styles.header}>
          <h3 className={styles.title}>Record Upgrade / Swap</h3>
          <button onClick={onClose} className={styles.closeButton}>
            <XIcon />
          </button>
        </div>

        {/* Customer */}
        <div className={styles.fieldGroup}>
          <div className={styles.fieldHeader}>
            <label className={styles.label}>Customer</label>
            <button
              onClick={() => {
                setNewCustomer(!newCustomer);
                setCustomer("");
                setNewName("");
                setNewPhone("");
              }}
              className={styles.toggleButton}
            >
              {newCustomer ? "Select Existing" : "+ New Customer"}
            </button>
          </div>
          {newCustomer ? (
            <div className={styles.newCustomerInputs}>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Customer name"
                className={styles.textInput}
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone number (optional)"
                className={styles.textInput}
              />
            </div>
          ) : (
            <CustomerSearch
              customers={customers}
              value={customer}
              onChange={setCustomer}
            />
          )}
        </div>

        {/* Side-by-side product selectors */}
        <div className={styles.productRow}>
          {/* Product To Swap (giving back) */}
          <div className={styles.productCol}>
            <label className={styles.smallLabel}>Product To Swap</label>
            <select
              value={productFrom}
              onChange={(e) => { setProductFrom(e.target.value); if (e.target.value !== "Other") setCustomFrom(""); }}
              className={styles.selectInput}
            >
              {cylinderProducts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="Other">Other</option>
            </select>
            {productFrom === "Other" && (
              <input
                type="text"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                placeholder="Product name..."
                autoFocus
                className={styles.customInput}
              />
            )}
          </div>

          {/* Swap icon */}
          <div className={styles.swapIconWrap}>
            <SwapIcon />
          </div>

          {/* Product To Buy (receiving) */}
          <div className={styles.productCol}>
            <label className={styles.smallLabel}>Product To Buy</label>
            <select
              value={productTo}
              onChange={(e) => setProductTo(e.target.value)}
              className={styles.selectInput}
            >
              {cylinderProducts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Purchase Price */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Purchase Price (₱)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
            className={styles.priceInput}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.actions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancel</button>
          <button onClick={onSubmit} className={styles.submitButton}>Record Swap</button>
        </div>
      </div>
    </div>
  );
}
