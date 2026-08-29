import { useState } from "react";
import CustomersTab from "./CustomersTab";
import CategoriesTab from "./CategoriesTab";
import CustomerDetail from "./CustomerDetail";
import AddCustomerModal from "../../components/AddCustomerModal";
import AddCategoryModal from "../../components/AddCategoryModal";
import BulkAssignCategoryModal from "../../components/BulkAssignCategoryModal";
import MergeCustomersModal from "../../components/MergeCustomersModal";
import { PlusIcon } from "../../components/Icons";
import type { MergePreview, MergeResult } from "../../lib/hooks/useCustomersData";
import type { Customer, CustomerCategory, CustomerTransaction } from "../../lib/types";
import styles from "./CustomersPage.module.css";

interface CustomersPageProps {
  customers: Customer[];
  customerCategories: CustomerCategory[];
  onAddCustomer: (name: string, phone: string, categoryId?: string) => Promise<boolean>;
  onUpdateCustomer: (
    customerId: string,
    data: { name: string; phone: string; categoryId?: string },
  ) => Promise<boolean>;
  onDeleteCustomer: (customerId: string) => Promise<void>;
  onFetchCustomerTransactions: (customerId: string) => Promise<CustomerTransaction[]>;
  onAddCategory: (name: string) => Promise<boolean>;
  onUpdateCategory: (categoryId: string, name: string) => Promise<boolean>;
  onDeleteCategory: (categoryId: string) => Promise<boolean>;
  onBulkAssignCategory: (customerIds: string[], categoryId: string) => Promise<number>;
  onPreviewMerge: (customerIds: string[]) => Promise<MergePreview | null>;
  onMergeCustomers: (survivorId: string, doomedIds: string[]) => Promise<MergeResult | null>;
}

const subTabs = [
  { key: "customers", label: "Customers" },
  { key: "categories", label: "Categories" },
];

/**
 * Two tabs over one domain: the customers themselves, and the labels they are
 * filed under. Categories get a tab rather than a modal buried in the customer
 * form because they are edited on their own schedule — a handful of labels set
 * up once, then rarely touched — and a list of them is also the only place the
 * operator can see how many customers each one holds.
 */
export default function CustomersPage({
  customers,
  customerCategories,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
  onFetchCustomerTransactions,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onBulkAssignCategory,
  onPreviewMerge,
  onMergeCustomers,
}: CustomersPageProps) {
  const [subTab, setSubTab] = useState("customers");
  // An ID, not the Customer object: holding the object would freeze the detail
  // view on the record as it was when it was clicked, so an edit made there
  // wouldn't show until you went Back and reopened it. Deriving from the live
  // list keeps the header, the phone and the category badge current.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCustomer = customers.find((c) => c.id === selectedId) || null;
  // The three actions belong to the page, not to a tab, so their modal state
  // lives here — Add Category is reachable while the Customers tab is open,
  // which is where the operator notices a label is missing.
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  // The detail view REPLACES the page rather than sitting inside a tab: it is a
  // different screen about one customer, and leaving the tab bar above it would
  // invite clicking Categories and wondering which customer is still open.
  if (selectedCustomer) {
    return (
      <CustomerDetail
        key={selectedCustomer.id}
        customer={selectedCustomer}
        customerCategories={customerCategories}
        onBack={() => setSelectedId(null)}
        onUpdateCustomer={onUpdateCustomer}
        onDeleteCustomer={onDeleteCustomer}
        onFetchCustomerTransactions={onFetchCustomerTransactions}
      />
    );
  }

  return (
    <div className="animate-fade">
      {/* One joined button group, the same "Primary Horizontal" pattern as the
          outlet screen's Add Sale / Add AR Collection / … bar: every action here
          is page-wide rather than tab-specific, which is what makes them one
          set. Order is deliberate — the two "add one thing" actions, then the
          bulk one. */}
      <div className={styles.pageActions}>
        <div className={styles.buttonGroup} role="group" aria-label="Customer actions">
          <button onClick={() => setShowAddCustomer(true)} className={styles.groupButton}>
            <PlusIcon /> Add Customer
          </button>
          <button onClick={() => setShowAddCategory(true)} className={styles.groupButton}>
            <PlusIcon /> Add Category
          </button>
          {/* Deletes records, unlike the two beside it — which is what the
              dialog's three steps and its red confirm button are for, since
              nothing in this bar distinguishes it. */}
          <button onClick={() => setShowMerge(true)} className={styles.groupButton}>
            Merge Customers
          </button>
          {/* Disabled until a category exists: there would be nothing to assign
              to, and an empty picklist is a question that can't be answered. */}
          <button
            onClick={() => setShowBulkAssign(true)}
            className={styles.groupButton}
            disabled={customerCategories.length === 0}
            title={customerCategories.length === 0
              ? "Add a category first"
              : "File many customers into one category at once"}
          >
            Bulk Assign Categories
          </button>
        </div>
      </div>

      <div className={styles.subTabs}>
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`${styles.subTab} ${subTab === tab.key ? styles.subTabActive : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {subTab === "customers" ? (
          <CustomersTab
            customers={customers}
            customerCategories={customerCategories}
            onOpenCustomer={(c) => setSelectedId(c.id)}
            onUpdateCustomer={onUpdateCustomer}
            onDeleteCustomer={onDeleteCustomer}
          />
        ) : (
          <CategoriesTab
            customers={customers}
            customerCategories={customerCategories}
            onUpdateCategory={onUpdateCategory}
            onDeleteCategory={onDeleteCategory}
          />
        )}
      </div>

      {showAddCustomer && (
        <AddCustomerModal
          categories={customerCategories}
          onSubmit={(name, phone, categoryId) => onAddCustomer(name, phone, categoryId)}
          onClose={() => setShowAddCustomer(false)}
        />
      )}

      {showAddCategory && (
        <AddCategoryModal
          onSubmit={onAddCategory}
          onClose={() => setShowAddCategory(false)}
        />
      )}

      {showMerge && (
        <MergeCustomersModal
          customers={customers}
          categories={customerCategories}
          onPreview={onPreviewMerge}
          onMerge={onMergeCustomers}
          onClose={() => setShowMerge(false)}
        />
      )}

      {showBulkAssign && (
        <BulkAssignCategoryModal
          customers={customers}
          categories={customerCategories}
          onAssign={onBulkAssignCategory}
          onClose={() => setShowBulkAssign(false)}
        />
      )}
    </div>
  );
}
