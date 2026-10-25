import { useState } from "react";
import {
  productGrid, shopeeBasicGrid, shopeeDiscountGrid, shopeeSalesGrid, toCSV, toJSONExport, variantGrid,
} from "../lib/exchange";
import { downloadText, downloadXlsx } from "../lib/exchangeIO";
import { fetchItems } from "../lib/productsApi";

const btn = "px-3 py-2 rounded-md border border-border text-sm cursor-pointer hover:bg-surface-hover disabled:opacity-40";
const btnPrimary = "px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40";

type Scope = "all" | "filtered" | "selected";
type Format = "xlsx" | "csv" | "json" | "shopee_sales" | "shopee_discount" | "shopee_basic";

const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: "xlsx", label: "Excel (.xlsx)", hint: "2 trang: Sản phẩm và Phân loại." },
  { value: "csv", label: "CSV (.csv)", hint: "Mỗi dòng là một phân loại. Mã dài có thể hiện dạng 4.39E+10 trong Excel — dùng .xlsx nếu cần." },
  { value: "json", label: "JSON (.json)", hint: "Đầy đủ mọi trường; có thể nhập lại bằng “Nhập dữ liệu”." },
  { value: "shopee_sales", label: "Excel · Giá & tồn kho (bố cục Shopee sales_info)", hint: "“Giá” là giá gốc (chưa giảm)." },
  { value: "shopee_discount", label: "Excel · Giá khuyến mãi (bố cục Shopee discount_nominate)", hint: "Chỉ gồm các phân loại đang giảm giá." },
  { value: "shopee_basic", label: "Excel · Tên, SKU, mô tả (bố cục Shopee basic_info)", hint: "" },
];

type Props = { all: number[]; filtered: number[]; selected: number[]; onClose: () => void };

export default function ExportDialog({ all, filtered, selected, onClose }: Props) {
  const [scope, setScope] = useState<Scope>(selected.length ? "selected" : filtered.length !== all.length ? "filtered" : "all");
  const [format, setFormat] = useState<Format>("xlsx");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const counts: Record<Scope, number> = { all: all.length, filtered: filtered.length, selected: selected.length };
  const ids = scope === "all" ? null : scope === "filtered" ? filtered : selected;
  const hint = FORMATS.find((f) => f.value === format)?.hint;

  async function run() {
    setBusy(true); setError("");
    try {
      const items = await fetchItems(ids, (d, t) => setProgress(t ? `${d}/${t}` : `${d}`));
      if (items.length === 0) throw new Error("Không có sản phẩm nào để xuất.");
      setProgress("đang tạo file…");
      const day = new Date().toISOString().slice(0, 10);
      if (format === "json") downloadText(`san-pham-${day}.json`, toJSONExport(items), "application/json");
      else if (format === "csv") downloadText(`san-pham-${day}.csv`, toCSV(variantGrid(items)), "text/csv");
      else if (format === "xlsx") {
        await downloadXlsx(`san-pham-${day}.xlsx`, [
          { name: "Sản phẩm", grid: productGrid(items), widths: [14, 14, 14, 50, 16, 20, 12, 12, 12, 10, 10, 9, 6, 9, 11, 8, 30, 36, 60] },
          { name: "Phân loại", grid: variantGrid(items), widths: [14, 14, 14, 50, 16, 20, 6, 9, 15, 15, 12, 20, 20, 11, 11, 9, 9] },
        ]);
      } else if (format === "shopee_sales") await downloadXlsx(`sales_info_${day}.xlsx`, [{ name: "Sheet1", grid: shopeeSalesGrid(items) }]);
      else if (format === "shopee_discount") await downloadXlsx(`discount_nominate_${day}.xlsx`, [{ name: "Sheet1", grid: shopeeDiscountGrid(items) }]);
      else await downloadXlsx(`mass_update_basic_info_${day}.xlsx`, [{ name: "Sheet1", grid: shopeeBasicGrid(items) }]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xuất dữ liệu thất bại.");
    } finally {
      setBusy(false); setProgress("");
    }
  }

  const radio = (on: boolean) => `flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${on ? "border-primary bg-surface-muted" : "border-border hover:bg-surface-hover"}`;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 overflow-y-auto p-4" role="dialog" aria-modal="true">
      <div className="max-w-xl mx-auto bg-surface border border-border rounded-lg p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-2xl">Xuất dữ liệu</h2>
          <button type="button" className={btn} onClick={onClose} disabled={busy}>✕ Đóng</button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold mb-2">Xuất những sản phẩm nào?</legend>
          {(["selected", "filtered", "all"] as Scope[]).map((s) => (
            <label key={s} className={`${radio(scope === s)} ${counts[s] === 0 ? "opacity-40 pointer-events-none" : ""}`}>
              <input type="radio" name="scope" className="mt-1" checked={scope === s} onChange={() => setScope(s)} disabled={counts[s] === 0} />
              <span>{s === "selected" ? "Đã chọn" : s === "filtered" ? "Kết quả đang lọc / tìm kiếm" : "Tất cả sản phẩm"} <b>({counts[s]})</b></span>
            </label>
          ))}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold mb-2">Định dạng</legend>
          {FORMATS.map((f) => (
            <label key={f.value} className={radio(format === f.value)}>
              <input type="radio" name="format" className="mt-1" checked={format === f.value} onChange={() => setFormat(f.value)} />
              <span className="text-sm">{f.label}</span>
            </label>
          ))}
          {hint && <p className="text-xs text-text/60">{hint}</p>}
          {format.startsWith("shopee_") && <p className="text-xs text-text/60">Cùng cột và dòng tiêu đề với file mẫu Shopee của bạn; mình chưa thử tải ngược file này lên Shopee.</p>}
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={btn} onClick={onClose} disabled={busy}>Hủy</button>
          <button type="button" className={btnPrimary} onClick={run} disabled={busy || counts[scope] === 0}>
            {busy ? `Đang xuất… ${progress}` : "Tải xuống"}
          </button>
        </div>
      </div>
    </div>
  );
}