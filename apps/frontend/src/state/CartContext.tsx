import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Product } from '../types/domain';

export interface CartLine {
  product: Product;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  clear: () => void;
  itemCount: number;
  subtotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

// Deliberately in-memory only (no localStorage) — the cart is client state
// per the brief, and a demo shop generating telemetry has no need to survive
// a tab reload; keeping it simple avoids a whole class of stale-cart bugs.
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);

  const addItem = (product: Product, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + quantity } : l));
      }
      return [...prev, { product, quantity }];
    });
  };

  const removeItem = (productId: number) => {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  };

  const setQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)));
  };

  const clear = () => setLines([]);

  const itemCount = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.quantity * l.product.price, 0), [lines]);

  const value: CartContextValue = { lines, addItem, removeItem, setQuantity, clear, itemCount, subtotal };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
