"use client";
import { useAppData } from "../../../lib/providers/AppDataProvider";
import { usePricingSettings } from "../../../lib/hooks/usePricingSettings";
import ProductsPage from "../../../views/pricing/ProductsPage";

export default function PricingRoutePage() {
  const data = useAppData();
  const { approverEmail, saveApproverEmail } = usePricingSettings();
  return (
    <ProductsPage
      products={data.products}
      pricebooks={data.pricebooks}
      activePricebook={data.activePricebook}
      approverEmail={approverEmail}
      onCreatePricebook={data.createPricebook}
      onUpdatePricebook={data.updatePricebook}
      onActivatePricebook={data.activatePricebook}
      onDeletePricebook={data.deletePricebook}
      onAddProduct={data.addProduct}
      onUpdateProduct={data.updateProduct}
      onDeleteProduct={data.deleteProduct}
      onSaveApproverEmail={saveApproverEmail}
    />
  );
}
