import { storage } from "../storage";

export type CreateSaleServiceInput = {
  tenantId: number;
  branchId: number | null;
  cashierUserId: number;
  currency: string;
  paymentMethod: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "OTRO";
  notes: string | null;
  customerId?: number | null;
  discountType: "NONE" | "PERCENT" | "FIXED";
  discountValue: number;
  surchargeType: "NONE" | "PERCENT" | "FIXED";
  surchargeValue: number;
  items: Array<{ productId: number; quantity: number; unitPrice?: number }>;
};

export async function submitSale(input: CreateSaleServiceInput) {
  return storage.createSaleAtomic(input);
}
