"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import CustomersPage from "../../../views/CustomersPage";

export default function CustomersRoutePage() {
  const data = useAppData();
  return (
    <CustomersPage
      customers={data.customers}
      onAddCustomer={data.addCustomer}
      onUpdateCustomer={data.updateCustomer}
      onDeleteCustomer={data.deleteCustomer}
      onFetchCustomerTransactions={data.fetchCustomerTransactions}
    />
  );
}
