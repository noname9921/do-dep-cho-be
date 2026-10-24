import { useState } from "react";
import { Link } from "react-router";
import BankCard from "../components/BankCard";
import { useCart } from "../lib/cart";
import { invalidateItems } from "../lib/items";
import { saveOrder } from "../lib/myOrders";
import { supabase } from "../lib/supabase";
import { vnd } from "../lib/types";

type Pay = "transfer" | "cod";

export default function Checkout() {
  const cart = useCart();
  const [pay, setPay] = useState<Pay>("transfer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: number | string; total: number; pay: Pay } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    let total = cart.subtotal;
    setBusy(true);

    let id: number | string;
    if (supabase) {
      const { data, error } = await supabase.rpc("place_order", {
        p_name: String(f.get("name")),
        p_phone: String(f.get("phone")),
        p_address: String(f.get("address")),
        p_note: String(f.get("note") || ""),
        p_payment: pay,
        p_items: cart.lines.map((l) => ({ productId: l.productId, variationId: l.variationId, qty: l.qty })),
      });
      if (error) { setError(error.message); setBusy(false); return; }
      const res = data as { id: number; total: number } | null;
      if (!res || res.id == null) { setError("Máy chủ chưa xác nhận đơn hàng. Vui lòng thử lại."); setBusy(false); return; }
      id = res.id;
      total = Number(res.total); // the total the server actually charged
      invalidateItems(); // refresh stock numbers
    } else {
      id = `DEMO-${Date.now().toString().slice(-6)}`; // no Supabase configured
      console.log("DEMO order", { form: Object.fromEntries(f), pay, lines: cart.lines });
    }
    saveOrder({
      id, phone: String(f.get("phone")), total, pay, createdAt: new Date().toISOString(),
      lines: cart.lines.map((l) => ({ name: l.name, color: l.color, size: l.size, qty: l.qty, price: l.price })),
      status: "pending", delivery: "preparing",
    });
    cart.clear();
    setDone({ id, total, pay });
    setBusy(false);
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto p-8 flex flex-col gap-6">
        <div className="bg-surface border border-border rounded-lg p-8">
          <h1 className="font-bold text-3xl">Cảm ơn bạn! 🎉</h1>
          <p className="mt-2 text-text/70">Đã nhận đơn hàng <b>#{done.id}</b> – tổng cộng <b>{vnd(done.total)}</b>.</p>
          {done.pay === "cod" && <p className="mt-2">Vui lòng chuẩn bị tiền mặt và thanh toán khi nhận hàng.</p>}
        </div>
        {done.pay === "transfer" && (
          <>
            <p className="text-sm">Quét mã QR hoặc chuyển khoản vào tài khoản bên dưới. <b>Hãy nhập đúng nội dung chuyển khoản</b> để chúng tôi đối chiếu thanh toán của bạn.</p>
            <BankCard amount={done.total} memo={`DH${done.id}`} />
          </>
        )}
        <div className="flex flex-wrap gap-6">
          <Link to="/orders" className="text-primary hover:underline">Theo dõi đơn hàng →</Link>
          <Link to="/shop" className="text-primary hover:underline">← Tiếp tục mua sắm</Link>
        </div>
      </div>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center">
        <h1 className="font-bold text-3xl mb-3">Giỏ hàng của bạn đang trống</h1>
        <Link to="/shop" className="text-primary hover:underline">Đến cửa hàng →</Link>
      </div>
    );
  }

  const input = "w-full p-2.5 rounded-md border border-border bg-surface";
  const radio = (on: boolean) => `flex items-start gap-3 p-4 rounded-md border cursor-pointer ${on ? "border-primary ring-1 ring-primary" : "border-border"}`;

  return (
    <div className="max-w-6xl mx-auto p-8 grid lg:grid-cols-[1fr_380px] gap-8">
      <form id="checkout" onSubmit={onSubmit} className="flex flex-col gap-6">
        <section className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-4">
          <h1 className="font-bold text-2xl">Thông tin giao hàng</h1>
          <label className="flex flex-col gap-1 text-sm">Họ và tên<input name="name" required className={input} /></label>
          <label className="flex flex-col gap-1 text-sm">Số điện thoại<input name="phone" type="tel" required pattern="[0-9+ ]{9,15}" className={input} /></label>
          <label className="flex flex-col gap-1 text-sm">Địa chỉ<textarea name="address" required rows={2} className={input} /></label>
          <label className="flex flex-col gap-1 text-sm">Ghi chú (không bắt buộc)<input name="note" className={input} /></label>
        </section>

        <section className="bg-surface border border-border rounded-lg p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-xl">Thanh toán</h2>
          <label className={radio(pay === "transfer")}>
            <input type="radio" name="pay" checked={pay === "transfer"} onChange={() => setPay("transfer")} className="mt-1" />
            <div><p className="font-semibold">Chuyển khoản ngân hàng (QR)</p><p className="text-sm text-text/60">Thanh toán ngay bằng cách quét mã QR.</p></div>
          </label>
          <label className={radio(pay === "cod")}>
            <input type="radio" name="pay" checked={pay === "cod"} onChange={() => setPay("cod")} className="mt-1" />
            <div><p className="font-semibold">Thanh toán khi nhận hàng (COD)</p><p className="text-sm text-text/60">Trả tiền mặt khi nhận được hàng.</p></div>
          </label>
          {pay === "transfer" && <BankCard amount={cart.subtotal} />}
        </section>
      </form>

      <aside className="bg-surface border border-border rounded-lg p-6 h-fit flex flex-col gap-4 lg:sticky lg:top-24">
        <h2 className="font-semibold text-xl">Tóm tắt đơn hàng</h2>
        <ul className="flex flex-col gap-4">
          {cart.lines.map((l) => (
            <li key={l.key} className="flex gap-3">
              <div className="size-16 shrink-0 rounded bg-gray-300 overflow-hidden">
                {l.image && <img src={l.image} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium line-clamp-2">{l.name}</p>
                <p className="text-xs text-text/60">{[l.color, l.size].filter(Boolean).join(" · ")}</p>
                <div className="flex items-center justify-between mt-1">
                  <div className="inline-flex items-center border border-border rounded">
                    <button type="button" aria-label="Giảm" onClick={() => cart.setQty(l.key, l.qty - 1)} className="px-2 cursor-pointer">−</button>
                    <span className="w-7 text-center text-sm">{l.qty}</span>
                    <button type="button" aria-label="Tăng" disabled={l.qty >= l.max} onClick={() => cart.setQty(l.key, l.qty + 1)} className="px-2 cursor-pointer disabled:opacity-40">+</button>
                  </div>
                  <button type="button" onClick={() => cart.remove(l.key)} className="text-xs text-danger cursor-pointer hover:underline">Xóa</button>
                </div>
              </div>
              <p className="text-sm font-semibold whitespace-nowrap">{vnd(l.price * l.qty)}</p>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
          <span>Tổng cộng</span><span>{vnd(cart.subtotal)}</span>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button form="checkout" disabled={busy} className="w-full py-3 rounded-md bg-primary text-white font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40">
          {busy ? "Đang đặt hàng…" : pay === "cod" ? "Đặt hàng (thanh toán khi nhận hàng)" : "Đặt hàng và nhận nội dung chuyển khoản"}
        </button>
        {!supabase && <p className="text-xs text-text/50">Chế độ demo: chưa cấu hình Supabase nên đơn hàng không được lưu.</p>}
      </aside>
    </div>
  );
}