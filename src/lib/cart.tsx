import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartLine = {
  key: string;
  productId: number;
  variationId: string;
  name: string;
  image?: string;
  color?: string | null;
  size?: string | null;
  price: number;
  qty: number;
  max: number;
};

type CartCtx = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (l: Omit<CartLine, "key">) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const STORE = "cart-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORE) || "[]"); } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(lines)); } catch { /* ignore */ }
  }, [lines]);

  const value: CartCtx = {
    lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: lines.reduce((s, l) => s + l.qty * l.price, 0),
    add: (l) =>
      setLines((prev) => {
        const key = `${l.productId}:${l.variationId}`;
        const hit = prev.find((p) => p.key === key);
        if (hit) {
          return prev.map((p) =>
            p.key === key ? { ...p, max: l.max, qty: Math.min(p.qty + l.qty, l.max) } : p
          );
        }
        return [...prev, { ...l, key, qty: Math.min(l.qty, l.max) }];
      }),
    setQty: (key, qty) =>
      setLines((prev) =>
        prev.map((p) => (p.key === key ? { ...p, qty: Math.max(1, Math.min(qty, p.max)) } : p))
      ),
    remove: (key) => setLines((prev) => prev.filter((p) => p.key !== key)),
    clear: () => setLines([]),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside <CartProvider>");
  return c;
}
