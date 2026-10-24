import { useEffect, useMemo, useState } from "react";
import AdminGate from "../components/AdminGate";
import { supabase } from "../lib/supabase";
import { useItems } from "../lib/items";
import { totalStock, vnd } from "../lib/types";

type OrderLine = { productId: number; name: string; qty: number; price: number; color?: string | null; size?: string | null };
type Order = {
  id: number; created_at: string; customer_name: string; phone: string;
  payment_method: "transfer" | "cod"; status: string; delivery_status: string; address: string | null; total: number; items: OrderLine[];
};
const STATUSES = ["pending", "paid", "cancelled"];
const DELIVERY = ["preparing", "shipped", "delivered", "returned"];
// display names only: the English keys above are what is stored in the database
const STATUS_VI: Record<string, string> = { pending: "Chờ thanh toán", paid: "Đã thanh toán", cancelled: "Đã hủy" };
const DELIVERY_VI: Record<string, string> = { preparing: "Đang chuẩn bị", shipped: "Đang giao", delivered: "Đã giao", returned: "Đã trả lại" };

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-surface border border-border rounded-lg p-5">
    <p className="text-sm text-text/60">{label}</p>
    <p className="text-2xl font-semibold mt-1">{value}</p>
  </div>
);

function Bars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-1.5 h-48">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${d.label}: ${vnd(d.value)}`}>
          <div className="w-full bg-primary rounded-t" style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 2 : 0 }} />
          <span className="text-[10px] text-text/60 mt-1 truncate">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const { items } = useItems();
  const [orders, setOrders] = useState<Order[]>([]);
  const [err, setErr] = useState("");
  const [dFilter, setDFilter] = useState("");

  async function load() {
    const { data, error } = await supabase!.from("orders").select("*").order("created_at", { ascending: false }).limit(2000);
    if (error) setErr(error.message); else setOrders((data ?? []) as Order[]);
  }
  useEffect(() => { load(); }, []);

  // stock is adjusted by a database trigger when an order becomes (or stops being) delivered;
  // if that fails (e.g. not enough stock) the change is rolled back and the message shows here
  async function update(id: number, patch: { status?: string; delivery_status?: string }) {
    const { error } = await supabase!.from("orders").update(patch).eq("id", id);
    if (error) setErr(error.message); else { setErr(""); load(); }
  }

  const s = useMemo(() => {
    const live = orders.filter((o) => o.status !== "cancelled" && o.delivery_status !== "returned");
    const revenue = live.reduce((a, o) => a + Number(o.total), 0);
    const units = live.reduce((a, o) => a + (o.items ?? []).reduce((x, l) => x + l.qty, 0), 0);

    const days: { label: string; value: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const key = d.toDateString();
      days.push({
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        value: live.filter((o) => new Date(o.created_at).toDateString() === key).reduce((a, o) => a + Number(o.total), 0),
      });
    }

    const byProduct = new Map<number, { name: string; qty: number; revenue: number }>();
    live.forEach((o) => (o.items ?? []).forEach((l) => {
      const p = byProduct.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0 };
      p.qty += l.qty; p.revenue += l.qty * l.price; byProduct.set(l.productId, p);
    }));
    const top = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    const pay = { transfer: live.filter((o) => o.payment_method === "transfer").length, cod: live.filter((o) => o.payment_method === "cod").length };
    return { revenue, units, count: live.length, aov: live.length ? revenue / live.length : 0, days, top, pay };
  }, [orders]);

  // "" = active (everything not cancelled), "cancelled" = cancelled only, otherwise a delivery status
  const matches = (o: Order, d: string) =>
    d === "cancelled" ? o.status === "cancelled"
      : o.status !== "cancelled" && (d === "" || o.delivery_status === d);
  const shownOrders = orders.filter((o) => matches(o, dFilter));
  const low = items.map((i) => ({ i, left: totalStock(i) })).filter((x) => x.left <= 5).sort((a, b) => a.left - b.left).slice(0, 8);
  const inventoryUnits = items.reduce((a, i) => a + totalStock(i), 0);

  return (
    <div className="max-w-6xl mx-auto p-8 flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-4xl">Thống kê</h1>
        <button onClick={() => supabase!.auth.signOut()} className="text-sm text-text/70 hover:underline cursor-pointer">Đăng xuất</button>
      </div>
      {err && <p className="text-danger text-sm">{err}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Doanh thu" value={vnd(s.revenue)} />
        <Stat label="Đơn hàng" value={String(s.count)} />
        <Stat label="Số lượng đã bán" value={String(s.units)} />
        <Stat label="Giá trị đơn trung bình" value={vnd(Math.round(s.aov))} />
        <Stat label="Số lượng tồn kho" value={String(inventoryUnits)} />
      </div>

      <section className="bg-surface border border-border rounded-lg p-6">
        <h2 className="font-semibold text-xl mb-4">Doanh thu – 14 ngày qua</h2>
        <Bars data={s.days} />
      </section>

      <div className="grid md:grid-cols-3 gap-8">
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="font-semibold text-xl mb-4">Sản phẩm bán chạy</h2>
          {s.top.length === 0 ? <p className="text-sm text-text/60">Chưa có đơn bán nào.</p> : (
            <ol className="flex flex-col gap-3 text-sm">
              {s.top.map((p, i) => (
                <li key={i} className="flex justify-between gap-3"><span className="truncate">{p.name}</span><span className="font-medium whitespace-nowrap">{p.qty} × · {vnd(p.revenue)}</span></li>
              ))}
            </ol>
          )}
        </section>
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="font-semibold text-xl mb-4">Sắp hết hàng (≤ 5)</h2>
          {low.length === 0 ? <p className="text-sm text-text/60">Tồn kho đầy đủ.</p> : (
            <ul className="flex flex-col gap-3 text-sm">
              {low.map(({ i, left }) => (
                <li key={i.id} className="flex justify-between gap-3"><span className="truncate">{i.name}</span><span className={`font-semibold ${left === 0 ? "text-danger" : ""}`}>{left}</span></li>
              ))}
            </ul>
          )}
        </section>
        <section className="bg-surface border border-border rounded-lg p-6">
          <h2 className="font-semibold text-xl mb-4">Phương thức thanh toán</h2>
          <p className="text-sm flex justify-between"><span>Chuyển khoản ngân hàng</span><b>{s.pay.transfer}</b></p>
          <p className="text-sm flex justify-between mt-2"><span>Thanh toán khi nhận hàng</span><b>{s.pay.cod}</b></p>
        </section>
      </div>

      <section className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-xl mr-2">Đơn hàng</h2>
          {["", ...DELIVERY, "cancelled"].map((d) => {
            const n = orders.filter((o) => matches(o, d)).length;
            return (
              <button key={d || "all"} type="button" onClick={() => setDFilter(d)} aria-pressed={dFilter === d}
                className={`px-3 py-1.5 rounded-full border text-sm cursor-pointer ${dFilter === d ? "bg-primary text-white border-primary" : "border-border hover:bg-surface-hover"}`}>
                {d ? (d === "cancelled" ? "Đã hủy" : DELIVERY_VI[d]) : "Tất cả"} ({n})
              </button>
            );
          })}
        </div>
        <p className="text-xs text-text/60">Tồn kho được trừ khi đơn hàng được đánh dấu <b>đã giao</b>, và được hoàn lại nếu sau đó đơn bị bỏ trạng thái đã giao, bị trả lại hoặc bị hủy. Đơn đã hủy sẽ chuyển sang tab <b>Đã hủy</b>.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[60rem]">
            <thead className="text-text/60"><tr><th className="p-3">#</th><th className="p-3">Ngày</th><th className="p-3">Khách hàng</th><th className="p-3">Sản phẩm</th><th className="p-3">Phương thức</th><th className="p-3">Tổng tiền</th><th className="p-3">Thanh toán</th><th className="p-3">Giao hàng</th></tr></thead>
            <tbody>
              {shownOrders.slice(0, 50).map((o) => (
                <tr key={o.id} className="border-t border-border align-top">
                  <td className="p-3">{o.id}</td>
                  <td className="p-3 whitespace-nowrap">{new Date(o.created_at).toLocaleString("vi-VN")}</td>
                  <td className="p-3">{o.customer_name}<span className="block text-xs text-text/50">{o.phone}</span><span className="block text-xs text-text/50 max-w-[14rem]">{o.address}</span></td>
                  <td className="p-3 text-xs text-text/70 max-w-[16rem]">
                    {(o.items ?? []).map((l, n) => (
                      <span key={n} className="block">{l.qty}× {l.name}{(l.color || l.size) ? ` (${[l.color, l.size].filter(Boolean).join(", ")})` : ""}</span>
                    ))}
                  </td>
                  <td className="p-3">{o.payment_method === "cod" ? "COD" : "Chuyển khoản"}</td>
                  <td className="p-3 whitespace-nowrap">{vnd(o.total)}</td>
                  <td className="p-3">
                    <select value={o.status} onChange={(e) => update(o.id, { status: e.target.value })} className="border border-border rounded p-1 bg-surface">
                      {STATUSES.map((x) => <option key={x} value={x}>{STATUS_VI[x] ?? x}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <select value={o.delivery_status} onChange={(e) => update(o.id, { delivery_status: e.target.value })} className="border border-border rounded p-1 bg-surface">
                      {DELIVERY.map((x) => <option key={x} value={x}>{DELIVERY_VI[x] ?? x}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {shownOrders.length === 0 && <tr><td colSpan={8} className="py-4 px-3 text-text/60">{dFilter === "cancelled" ? "Chưa có đơn hàng nào bị hủy." : dFilter ? "Không có đơn hàng nào ở trạng thái giao hàng này." : "Chưa có đơn hàng nào."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function Analytics() {
  return (
    <AdminGate>
      <Dashboard />
    </AdminGate>
  );
}