"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import CustomersPage from "../../../views/customers/CustomersPage";

export default function CustomersRoutePage() {
  const data = useAppData();
  return (
    <CustomersPage
      customers={data.customers}
      customerCategories={data.customerCategories}
      onAddCustomer={data.addCustomer}
      onUpdateCustomer={data.updateCustomer}
      onDeleteCustomer={data.deleteCustomer}
      onFetchCustomerTransactions={data.fetchCustomerTransactions}
      onAddCategory={data.addCustomerCategory}
      onUpdateCategory={data.updateCustomerCategory}
      onDeleteCategory={data.deleteCustomerCategory}
      onBulkAssignCategory={data.bulkAssignCustomerCategory}
    />
  );
}
