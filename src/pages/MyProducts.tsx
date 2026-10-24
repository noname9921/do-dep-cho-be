import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { cancelOrder, canCancel, clearOrders, loadOrders, refreshOrders, removeOrder, type MyOrder } from "../lib/myOrders";
import { vnd } from "../lib/types";

const STEPS = [
  { key: "preparing", label: "Đang chuẩn bị" },
  { key: "shipped", label: "Đang giao" },
  { key: "delivered", label: "Đã giao" },
];

function Progress({ delivery }: { delivery: string }) {
  const at = STEPS.findIndex((s) => s.key === delivery);
  return (
    <ol className="flex items-center" aria-label="Tiến trình giao hàng">
      {STEPS.map((s, i) => {
        const reached = i <= at;
        return (
          <li key={s.key} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
            <span className="flex flex-col items-center gap-1">
              <span className={`size-7 grid place-items-center rounded-full text-xs font-semibold ${reached ? "bg-primary text-white" : "bg-surface-muted text-text/50"}`}>
                {reached ? "✓" : i + 1}
              </span>
              <span className={`text-xs ${i === at ? "font-semibold" : "text-text/60"}`}>{s.label}</span>
            </span>
            {i < STEPS.length - 1 && <span className={`flex-1 h-0.5 mx-2 mb-5 ${i < at ? "bg-primary" : "bg-border"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

// one clear headline status per order (what the customer cares about), plus a quieter payment note
function headline(o: MyOrder) {
  if (o.status === "cancelled") return { text: "Đã hủy", cls: "bg-danger/10 text-danger", dot: "bg-danger" };
  if (o.delivery === "returned") return { text: "Đã trả lại", cls: "bg-surface-muted text-text/70", dot: "bg-text/40" };
  if (o.delivery === "delivered") return { text: "Đã giao", cls: "bg-success/10 text-success", dot: "bg-success" };
  if (o.delivery === "shipped") return { text: "Đang trên đường giao", cls: "bg-primary/10 text-primary", dot: "bg-primary" };
  return { text: "Đang chuẩn bị", cls: "bg-accent/30 text-text", dot: "bg-accent" };
}
function paymentNote(o: MyOrder) {
  if (o.status === "paid") return "Đã thanh toán";
  if (o.pay === "cod") return "Thanh toán khi nhận hàng";
  return "Chờ chuyển khoản";
}

function Lines({ o }: { o: MyOrder }) {
  return (
    <ul className="flex flex-col gap-1 text-sm border-t border-border pt-4">
      {o.lines.map((l, i) => (
        <li key={i} className="flex justify-between gap-4">
          <span className="min-w-0">{l.qty}× {l.name}{(l.color || l.size) && <span className="text-text/60"> ({[l.color, l.size].filter(Boolean).join(", ")})</span>}</span>
          <span className="whitespace-nowrap">{vnd(l.price * l.qty)}</span>
        </li>
      ))}
      <li className="flex justify-between gap-4 font-semibold pt-2"><span>Tổng cộng</span><span>{vnd(o.total)}</span></li>
    </ul>
  );
}

export default function MyOrders() {
  const [orders, setOrders] = useState<MyOrder[]>(() => loadOrders());
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try { setOrders(await refreshOrders()); }
    catch (e) { setError(e instanceof Error ? e.message : "Không cập nhật được trạng thái."); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  function clearAll() {
    if (!confirm("Xóa lịch sử đơn hàng đã lưu trên thiết bị này? Bản thân các đơn hàng của bạn không bị ảnh hưởng.")) return;
    clearOrders(); setOrders([]);
  }

  async function cancel(o: MyOrder) {
    if (!confirm(`Hủy đơn hàng #${o.id}? Thao tác này không thể hoàn tác.`)) return;
    setBusyId(o.id); setError("");
    try { setOrders(await cancelOrder(o)); }
    catch (e) { setError(e instanceof Error ? e.message : "Không hủy được đơn hàng."); }
    setBusyId(null);
  }

  const active = orders.filter((o) => o.status !== "cancelled");
  const cancelled = orders.filter((o) => o.status === "cancelled");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-12 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-3xl">Đơn hàng của tôi</h1>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} disabled={loading} className="px-4 py-2 rounded-lg border border-border bg-surface text-sm cursor-pointer hover:bg-surface-hover disabled:opacity-40">
            {loading ? "Đang kiểm tra…" : "↻ Cập nhật trạng thái"}
          </button>
          {orders.length > 0 && (
            <button type="button" onClick={clearAll} className="px-4 py-2 rounded-lg border border-border bg-surface text-sm text-danger cursor-pointer hover:bg-surface-hover">Xóa</button>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      {active.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg p-8 text-center">
          <p className="text-text/70">{orders.length === 0 ? "Chưa có đơn hàng nào được lưu trên thiết bị này." : "Không có đơn hàng đang xử lý."}</p>
          <Link to="/shop" className="inline-block mt-3 text-primary hover:underline">Đến cửa hàng →</Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-5">
          {active.map((o) => {
            const h = headline(o);
            return (
              <li key={o.id} className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-lg">Đơn hàng #{o.id}</p>
                    <p className="text-sm text-text/60">{new Date(o.createdAt).toLocaleString("vi-VN")} · {paymentNote(o)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold ${h.cls}`}>
                    <span className={`size-2 rounded-full ${h.dot}`} />{h.text}
                  </span>
                </div>

                {o.delivery === "returned"
                  ? <p className="text-sm text-text/70">Đơn hàng này đã được trả lại cho chúng tôi.</p>
                  : <Progress delivery={o.delivery} />}

                {o.pay === "transfer" && o.status === "pending" && (
                  <p className="text-sm text-text/70">Nội dung chuyển khoản: <b>DH{o.id}</b></p>
                )}

                <Lines o={o} />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-text/50">{o.checkedAt ? `Trạng thái cập nhật lúc ${new Date(o.checkedAt).toLocaleString("vi-VN")}` : ""}</p>
                  {canCancel(o) && (
                    <button type="button" disabled={busyId === o.id} onClick={() => cancel(o)}
                      className="px-4 py-2 rounded-lg border border-danger text-danger text-sm font-medium cursor-pointer hover:bg-danger/10 disabled:opacity-40">
                      {busyId === o.id ? "Đang hủy…" : "Hủy đơn hàng"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {cancelled.length > 0 && (
        <details className="bg-surface border border-border rounded-lg">
          <summary className="px-6 py-4 cursor-pointer font-semibold text-text/80">Đã hủy ({cancelled.length})</summary>
          <ul className="flex flex-col divide-y divide-border border-t border-border">
            {cancelled.map((o) => (
              <li key={o.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-text/70">Đơn hàng #{o.id} <span className="ml-2 px-2 py-0.5 rounded-full bg-danger/10 text-danger text-xs font-semibold">Đã hủy</span></p>
                  <p className="text-xs text-text/50">{new Date(o.createdAt).toLocaleString("vi-VN")} · <span className="line-through">{vnd(o.total)}</span></p>
                </div>
                <button type="button" onClick={() => setOrders(removeOrder(o.id))} className="text-xs text-text/60 hover:underline cursor-pointer">Xóa khỏi danh sách</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-text/50">Đơn hàng chỉ được lưu trên thiết bị và trình duyệt này. Xóa dữ liệu trình duyệt sẽ làm mất danh sách này.</p>
    </div>
  );
}