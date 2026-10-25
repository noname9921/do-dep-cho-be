import { useRef, useState } from "react";
import { buildPlan, detectKind, KIND_LABEL, parseItemsJson, planJson, type JsonMode, type JsonParse, type Plan } from "../lib/exchange";
import { readGrid } from "../lib/exchangeIO";
import { fetchItems, saveItems } from "../lib/productsApi";
import type { Item } from "../lib/types";

const btn = "px-3 py-2 rounded-md border border-border text-sm cursor-pointer hover:bg-surface-hover disabled:opacity-40";
const btnPrimary = "px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40";
const MAX_BYTES = 50 * 1024 * 1024;
const PREVIEW = 30;

type Props = { onClose: () => void; onDone: (message: string) => void };

export default function ImportDialog({ onClose, onDone }: Props) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<JsonMode>("upsert");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const existing = useRef<Item[]>([]);
  const json = useRef<JsonParse | null>(null);

  async function onFile(file: File) {
    setError(""); setPlan(null); json.current = null;
    try {
      if (file.size > MAX_BYTES) throw new Error("File quá lớn (tối đa 50 MB).");
      const isJson = /\.json$/i.test(file.name);
      if (!isJson && !/\.xlsx?$/i.test(file.name)) throw new Error("Chỉ hỗ trợ file .xlsx hoặc .json.");

      setBusy("Đang đọc file…");
      let build: (items: Item[]) => Plan;
      if (isJson) {
        const parsed = parseItemsJson(await file.text());
        if (parsed.fatal) throw new Error(parsed.fatal);
        json.current = parsed;
        build = (items) => planJson(parsed, items, mode);
      } else {
        const grid = await readGrid(file);
        const kind = detectKind(grid);
        if (!kind) throw new Error("Không nhận ra định dạng file. Hỗ trợ: sales_info, basic_info, media_info, discount_nominate của Shopee (.xlsx) và JSON.");
        build = (items) => buildPlan(kind as Exclude<typeof kind, "json">, grid, items);
      }
      setBusy("Đang so sánh với sản phẩm hiện có…");
      existing.current = await fetchItems(null);
      setPlan(build(existing.current));
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đọc được file.");
    } finally {
      setBusy("");
    }
  }

  function changeMode(m: JsonMode) {
    setMode(m);
    if (json.current) setPlan(planJson(json.current, existing.current, m));
  }

  async function apply() {
    if (!plan) return;
    const rows = [...plan.updated, ...plan.created];
    setError(""); setBusy("Đang lưu…");
    try {
      await saveItems(rows, (d, t) => setBusy(`Đang lưu… ${d}/${t}`));
      const parts = [];
      if (plan.updated.length) parts.push(`${plan.updated.length} sản phẩm được cập nhật`);
      if (plan.created.length) parts.push(`${plan.created.length} sản phẩm mới`);
      onDone(`Nhập “${fileName}” xong: ${parts.join(", ")}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lưu thất bại.");
      setBusy("");
    }
  }

  const total = plan ? plan.updated.length + plan.created.length : 0;
  const stat = (label: string, value: number) => (
    <div className="rounded-lg border border-border p-3"><p className="text-xs text-text/60">{label}</p><p className="text-xl font-semibold">{value.toLocaleString("vi-VN")}</p></div>
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/40 overflow-y-auto p-4" role="dialog" aria-modal="true">
      <div className="max-w-3xl mx-auto bg-surface border border-border rounded-lg p-6 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-2xl">Nhập dữ liệu</h2>
          <button type="button" className={btn} onClick={onClose} disabled={!!busy && busy.startsWith("Đang lưu")}>✕ Đóng</button>
        </div>

        {!plan && (
          <div className="flex flex-col gap-4">
            <label className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center cursor-pointer hover:bg-surface-hover">
              <span className="font-semibold">Chọn file .xlsx hoặc .json</span>
              <span className="text-sm text-text/60">Mình tự nhận dạng loại file, rồi cho bạn xem trước thay đổi — chưa lưu gì cho đến khi bạn bấm “Áp dụng”.</span>
              <input type="file" accept=".xlsx,.xls,.json" className="sr-only" disabled={!!busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
            </label>
            <ul className="text-sm text-text/70 flex flex-col gap-1 list-disc pl-5">
              <li><b>sales_info</b> (Giá &amp; số lượng): cập nhật tồn kho, giá gốc, SKU, GTIN của từng phân loại.</li>
              <li><b>discount_nominate</b>: đặt giá gốc và giá đã giảm cho từng phân loại.</li>
              <li><b>basic_info</b>: cập nhật tên, SKU sản phẩm, mô tả.</li>
              <li><b>media_info</b>: cập nhật ảnh, bảng size, danh mục và ảnh theo màu.</li>
              <li><b>JSON</b>: danh sách sản phẩm theo kiểu <code>Item</code> trong <code>lib/types.ts</code> (hoặc file JSON bạn xuất từ đây).</li>
            </ul>
            <p className="text-sm text-text/60">Chỉ cập nhật sản phẩm đã có (khớp theo mã sản phẩm / mã phân loại Shopee). Chỉ file JSON mới thêm được sản phẩm mới.</p>
            {busy && <p className="text-sm">{busy}</p>}
          </div>
        )}

        {plan && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="font-semibold">{KIND_LABEL[plan.kind]}</p>
              <p className="text-sm text-text/60">{fileName}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {stat(plan.kind === "json" ? "Sản phẩm trong file" : "Dòng trong file", plan.read)}
              {stat("Khớp", plan.matched)}
              {stat("Bỏ qua", plan.skipped)}
              {stat("Sẽ cập nhật", plan.updated.length)}
              {stat("Sẽ thêm mới", plan.created.length)}
            </div>

            {plan.kind === "json" && (
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="font-semibold mb-1">Khi sản phẩm đã tồn tại (cùng id)</legend>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "upsert"} onChange={() => changeMode("upsert")} /> Ghi đè bằng dữ liệu trong file và thêm sản phẩm mới</label>
                <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode === "new-only"} onChange={() => changeMode("new-only")} /> Chỉ thêm sản phẩm mới, giữ nguyên sản phẩm đã có</label>
              </fieldset>
            )}

            {plan.kind === "sales_info" && (
              <p className="text-xs text-text/60">Cột “Giá” trong file Shopee là giá gốc: phân loại đang giảm giá sẽ giữ giá giảm (nếu vẫn thấp hơn giá gốc mới); nếu không, giảm giá sẽ được xóa.</p>
            )}

            {plan.warnings.length > 0 && (
              <div className="rounded-lg border border-accent bg-surface-muted p-3 text-sm flex flex-col gap-1">
                {plan.warnings.map((w, i) => <p key={i} className="whitespace-pre-wrap">{w}</p>)}
              </div>
            )}

            {total === 0 ? (
              <p className="text-sm text-text/70">Không có thay đổi nào — dữ liệu hiện tại đã khớp với file.</p>
            ) : (
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-text/60"><tr><th className="p-2 font-medium">Sản phẩm</th><th className="p-2 font-medium">Thay đổi</th></tr></thead>
                  <tbody>
                    {plan.changes.slice(0, PREVIEW).map((c) => (
                      <tr key={c.id} className="border-t border-border align-top">
                        <td className="p-2"><span className="line-clamp-1">{c.name}</span><span className="text-xs text-text/50">#{c.id}</span></td>
                        <td className="p-2 text-text/70">{c.notes.join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.changes.length > PREVIEW && <p className="p-2 text-xs text-text/60 border-t border-border">… và {plan.changes.length - PREVIEW} sản phẩm khác</p>}
              </div>
            )}
            {total > 0 && <p className="text-xs text-text/60">Mẹo: xuất JSON trước để có bản sao lưu, phòng khi cần khôi phục.</p>}

            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className={btn} onClick={() => { setPlan(null); setError(""); }} disabled={!!busy}>Chọn file khác</button>
              <button type="button" className={btnPrimary} onClick={apply} disabled={!!busy || total === 0}>
                {busy || `Áp dụng ${total} thay đổi`}
              </button>
            </div>
          </div>
        )}
        {!plan && error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}