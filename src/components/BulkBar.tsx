import { useState } from "react";
import { applyBulk, bulkChanged, columnPatch, describeOp, type BulkOp } from "../lib/exchange";
import { deleteItems, fetchItems, patchColumns, saveItems } from "../lib/productsApi";

const input = "p-2 rounded-md border border-border bg-surface text-sm";
const btn = "px-3 py-2 rounded-md border border-border text-sm cursor-pointer hover:bg-surface-hover disabled:opacity-40";
const btnPrimary = "px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40";

const ACTIONS = [
  { value: "discount-pct", label: "Giảm giá theo %" },
  { value: "discount-clear", label: "Xóa giảm giá" },
  { value: "price-up", label: "Tăng giá" },
  { value: "price-down", label: "Giảm giá bán" },
  { value: "stock-set", label: "Đặt tồn kho (mỗi phân loại) = …" },
  { value: "stock-add", label: "Cộng / trừ tồn kho" },
  { value: "new-on", label: "Đánh dấu “Mới”" },
  { value: "new-off", label: "Bỏ đánh dấu “Mới”" },
  { value: "best-on", label: "Đánh dấu “Bán chạy”" },
  { value: "best-off", label: "Bỏ đánh dấu “Bán chạy”" },
  { value: "brand", label: "Đổi thương hiệu" },
  { value: "category", label: "Đổi danh mục" },
  { value: "delete", label: "Xóa sản phẩm" },
] as const;
type Action = (typeof ACTIONS)[number]["value"];

type Props = {
  ids: number[];
  onClear: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
};

export default function BulkBar({ ids, onClear, onDone, onError }: Props) {
  const [action, setAction] = useState<Action>("discount-pct");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"pct" | "amount">("pct");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const needsNumber = ["discount-pct", "price-up", "price-down", "stock-set", "stock-add"].includes(action);
  const needsText = action === "brand" || action === "category";

  function buildOp(): BulkOp | string {
    const n = Number(value.replace(/[\s,]/g, ""));
    switch (action) {
      case "discount-pct": return n >= 1 && n <= 95 ? { kind: "discount-pct", pct: n } : "Nhập % giảm từ 1 đến 95.";
      case "discount-clear": return { kind: "discount-clear" };
      case "price-up":
      case "price-down":
        if (!(n > 0)) return "Nhập một số lớn hơn 0.";
        if (unit === "pct" && n > 500) return "Phần trăm quá lớn.";
        return { kind: "price-adjust", mode: unit, sign: action === "price-up" ? 1 : -1, value: n };
      case "stock-set": return n >= 0 && Number.isFinite(n) && value.trim() !== "" ? { kind: "stock-set", value: n } : "Nhập số tồn kho (0 trở lên).";
      case "stock-add": return Number.isFinite(n) && n !== 0 && value.trim() !== "" ? { kind: "stock-add", value: n } : "Nhập số cần cộng (hoặc trừ, ví dụ -5).";
      case "new-on": return { kind: "flag", flag: "is_new", on: true };
      case "new-off": return { kind: "flag", flag: "is_new", on: false };
      case "best-on": return { kind: "flag", flag: "is_bestseller", on: true };
      case "best-off": return { kind: "flag", flag: "is_bestseller", on: false };
      case "brand": return { kind: "brand", value };
      case "category": return { kind: "category", value };
      case "delete": return { kind: "delete" };
    }
  }

  async function run() {
    const op = buildOp();
    if (typeof op === "string") { onError(op); return; }
    onError("");
    const what = describeOp(op);
    const warn = op.kind === "delete"
      ? `Xóa vĩnh viễn ${ids.length} sản phẩm? Không thể hoàn tác. Các đơn hàng cũ vẫn giữ bản sao thông tin của chúng.`
      : `Áp dụng “${what}” cho ${ids.length} sản phẩm?`;
    if (!confirm(warn)) return;

    setBusy(true);
    const prog = (d: number, t: number) => setProgress(t ? `${d}/${t}` : `${d}`);
    try {
      let message: string;
      const patch = columnPatch(op);
      if (op.kind === "delete") {
        await deleteItems(ids, prog);
        message = `Đã xóa ${ids.length} sản phẩm.`;
        onClear();
      } else if (patch) {
        await patchColumns(ids, patch, prog);
        message = `Đã ${what} cho ${ids.length} sản phẩm.`;
      } else {
        setProgress("đang tải…");
        const items = await fetchItems(ids, prog);
        const changed = bulkChanged(items, op);
        if (changed.length === 0) { onError("Không có sản phẩm nào thay đổi."); return; }
        await saveItems(changed, prog);
        message = `Đã ${what}: ${changed.length} sản phẩm thay đổi${changed.length < items.length ? `, ${items.length - changed.length} không đổi` : ""}.`;
      }
      onDone(message);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Cập nhật thất bại.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  // small live preview so the effect is clear before you press Apply
  const preview = (() => {
    if (!needsNumber || value.trim() === "") return "";
    const op = buildOp();
    if (typeof op === "string") return "";
    const sample = applyBulk({ id: 0, variants: [{ variationId: "x", price: 200000, stock: 10 }] }, op).variants?.[0];
    if (!sample) return "";
    if (op.kind === "discount-pct" || op.kind === "price-adjust") return `Ví dụ: 200.000 ₫ → ${(sample.price ?? 0).toLocaleString("vi-VN")} ₫`;
    return `Ví dụ: tồn kho 10 → ${sample.stock}`;
  })();

  return (
    <div className="sticky top-2 z-20 bg-surface border border-primary rounded-lg p-4 shadow-md flex flex-wrap items-end gap-3">
      <p className="font-semibold pb-2">Đã chọn {ids.length} sản phẩm</p>
      <label className="flex flex-col gap-1 text-xs text-text/60">
        Thao tác hàng loạt
        <select className={input} value={action} onChange={(e) => { setAction(e.target.value as Action); setValue(""); }} disabled={busy}>
          {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
      </label>
      {(action === "price-up" || action === "price-down") && (
        <label className="flex flex-col gap-1 text-xs text-text/60">
          Theo
          <select className={input} value={unit} onChange={(e) => setUnit(e.target.value as "pct" | "amount")} disabled={busy}>
            <option value="pct">%</option>
            <option value="amount">Số tiền (₫)</option>
          </select>
        </label>
      )}
      {needsNumber && (
        <label className="flex flex-col gap-1 text-xs text-text/60">
          Giá trị
          <input className={`${input} w-32`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={action === "discount-pct" ? "vd: 20" : "vd: 5"} disabled={busy} />
        </label>
      )}
      {needsText && (
        <label className="flex flex-col gap-1 text-xs text-text/60">
          Giá trị mới
          <input className={`${input} w-52`} value={value} onChange={(e) => setValue(e.target.value)} disabled={busy} />
        </label>
      )}
      <button type="button" className={action === "delete" ? `${btnPrimary} !bg-danger` : btnPrimary} onClick={run} disabled={busy}>
        {busy ? `Đang xử lý… ${progress}` : action === "delete" ? "Xóa" : "Áp dụng"}
      </button>
      <button type="button" className={btn} onClick={onClear} disabled={busy}>Bỏ chọn</button>
      {preview && <p className="basis-full text-xs text-text/60">{preview}. Giá được làm tròn đến 500 ₫.</p>}
    </div>
  );
}