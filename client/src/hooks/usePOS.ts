import { useMemo, useState } from "react";

export interface PosProductRow {
  id: number;
  name: string;
  price: string;
  estimatedSalePrice?: number;
  stockTotal?: number;
}

export interface PosCartItem {
  product: PosProductRow;
  quantity: number;
}

export function usePOSCart() {
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [discountType, setDiscountType] = useState<"NONE" | "PERCENT" | "FIXED">("NONE");
  const [discountValue, setDiscountValue] = useState(0);
  const [surchargeType, setSurchargeType] = useState<"NONE" | "PERCENT" | "FIXED">("NONE");
  const [surchargeValue, setSurchargeValue] = useState(0);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.product.estimatedSalePrice ?? item.product.price) * item.quantity, 0),
    [cart],
  );

  const discountAmount = useMemo(() => {
    if (discountType === "PERCENT") return Math.min(subtotal, (subtotal * discountValue) / 100);
    if (discountType === "FIXED") return Math.min(subtotal, discountValue);
    return 0;
  }, [subtotal, discountType, discountValue]);

  const surchargeAmount = useMemo(() => {
    const base = subtotal - discountAmount;
    if (surchargeType === "PERCENT") return (base * surchargeValue) / 100;
    if (surchargeType === "FIXED") return surchargeValue;
    return 0;
  }, [subtotal, discountAmount, surchargeType, surchargeValue]);

  const total = subtotal - discountAmount + surchargeAmount;

  function clearCart() {
    setCart([]);
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function increaseQty(productId: number) {
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, quantity: i.quantity + 1 } : i)));
  }

  function decreaseQty(productId: number) {
    setCart((prev) => prev.map((i) => (i.product.id === productId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i)));
  }

  return {
    cart,
    setCart,
    clearCart,
    removeFromCart,
    increaseQty,
    decreaseQty,
    discountType,
    setDiscountType,
    discountValue,
    setDiscountValue,
    surchargeType,
    setSurchargeType,
    surchargeValue,
    setSurchargeValue,
    subtotal,
    discountAmount,
    surchargeAmount,
    total,
  };
}
