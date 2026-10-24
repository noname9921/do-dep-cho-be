import { supabase } from "./supabase";

// Orders placed from this browser are remembered in localStorage, so the customer can come back
// and see the delivery status without an account. The status itself is read from Supabase
// (track_orders needs the order id AND the phone number used on the order).
export type MyOrderLine = { name: string; color?: string | null; size?: string | null; qty: number; price: number };
export type MyOrder = {
  id: number | string;
  phone: string;
  total: number;
  pay: "transfer" | "cod";
  createdAt: string;
  lines: MyOrderLine[];
  status: string;    // pending | paid | cancelled
  delivery: string;  // preparing | shipped | delivered | returned
  checkedAt?: string;
};

const KEY = "my-orders-v1";
const MAX_KEPT = 30;

export function loadOrders(): MyOrder[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (o): o is MyOrder => !!o && typeof o === "object" && o.id != null && Array.isArray(o.lines)
    ).map((o) => ({ ...o, status: o.status ?? "pending", delivery: o.delivery ?? "preparing", total: Number(o.total) || 0 }));
  } catch {
    return [];
  }
}

function store(orders: MyOrder[]) {
  try { localStorage.setItem(KEY, JSON.stringify(orders.slice(0, MAX_KEPT))); } catch { /* storage unavailable */ }
}

export function saveOrder(o: MyOrder) {
  store([o, ...loadOrders().filter((x) => x.id !== o.id)]);
}

export function clearOrders() {
  store([]);
}

// asks Supabase for the latest status of every saved order, saves it, and returns the merged list
export async function refreshOrders(): Promise<MyOrder[]> {
  const local = loadOrders();
  const known = local.filter((o) => typeof o.id === "number");
  if (!supabase || known.length === 0) return local;

  const { data, error } = await supabase.rpc("track_orders", {
    p_orders: known.map((o) => ({ id: o.id, phone: o.phone })),
  });
  if (error) throw new Error(error.message);

  const byId = new Map<number, { status: string; delivery_status: string; total: number }>();
  (Array.isArray(data) ? data : []).forEach((r: { id: number; status: string; delivery_status: string; total: number }) => byId.set(Number(r.id), r));

  const now = new Date().toISOString();
  const merged = loadOrders().map((o) => {
    const r = typeof o.id === "number" ? byId.get(o.id) : undefined;
    return r ? { ...o, status: r.status, delivery: r.delivery_status, total: Number(r.total), checkedAt: now } : o;
  });
  store(merged);
  return merged;
}

// a customer may cancel only while nothing has been paid or shipped yet
export const canCancel = (o: MyOrder) => o.status === "pending" && o.delivery === "preparing";

// deletes the order on the server (Supabase function cancel_order, see cancel_order.sql) and then locally
export async function cancelOrder(o: MyOrder): Promise<MyOrder[]> {
  if (!canCancel(o)) throw new Error("Đơn hàng này không thể hủy được nữa. Vui lòng liên hệ với chúng tôi.");
  if (supabase && typeof o.id === "number") {
    const { data, error } = await supabase.rpc("cancel_order", { p_id: o.id, p_phone: o.phone });
    if (error) throw new Error(error.message);
    if (data !== true) throw new Error("Đơn hàng này không thể hủy được nữa (đã thanh toán hoặc đã giao đi). Vui lòng liên hệ với chúng tôi.");
  }
  // the order row is gone from Supabase now, so drop it from this device too
  const rest = loadOrders().filter((x) => x.id !== o.id);
  store(rest);
  return rest;
}

// forget one order on this device only
export function removeOrder(id: number | string): MyOrder[] {
  const rest = loadOrders().filter((x) => x.id !== id);
  store(rest);
  return rest;
}