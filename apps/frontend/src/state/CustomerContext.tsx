import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface CustomerContextValue {
  /** The most recently used fake customer id (from checkout's random 1–10000
   * picker), so "Order History" has somewhere sensible to point without
   * making the user remember a number. Session-only, like the cart. */
  lastCustomerId: number | null;
  setLastCustomerId: (id: number) => void;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [lastCustomerId, setLastCustomerId] = useState<number | null>(null);
  return <CustomerContext.Provider value={{ lastCustomerId, setLastCustomerId }}>{children}</CustomerContext.Provider>;
}

export function useCustomer(): CustomerContextValue {
  const ctx = useContext(CustomerContext);
  if (!ctx) {
    throw new Error('useCustomer must be used within a CustomerProvider');
  }
  return ctx;
}
