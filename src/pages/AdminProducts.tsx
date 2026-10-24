import { useCallback, useEffect, useMemo, useState } from "react";
import AdminGate from "../components/AdminGate";
import { invalidateItems, itemToRow, rowToItem } from "../lib/items";
import { supabase } from "../lib/supabase";
import { fold, percentOff, vnd, type Color, type Item, type Size, type Variant } from "../lib/types";

// ---------------------------------------------------------------- helpers
type Row = {
  id: number; name: string | null; brand: string | null; category: string | null; sku: string | null;
  price: number | null; stock: number | null; images: string[] | null;
  is_new: boolean; is_bestseller: boolean; in_stock: boolean;
  pct: number;     // biggest % off among variants (0 = no sale)
  find: string;    // folded text the search box looks through (name, SKUs, product numbers…)
};
const LIST_COLS = "id,name,brand,category,sku,shopee_product_id,price,stock,images,is_new,is_bestseller,in_stock,variants";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toRow = (r: any): Row => {
  const vs: Variant[] = Array.isArray(r.variants) ? r.variants : [];
  return {
    id: r.id, name: r.name, brand: r.brand, category: r.category, sku: r.sku,
    price: r.price, stock: r.stock, images: r.images,
    is_new: !!r.is_new, is_bestseller: !!r.is_bestseller, in_stock: !!r.in_stock,
    pct: vs.reduce((m, v) => Math.max(m, percentOff(v.originalPrice, v.price)), 0),
    find: fold([r.id, r.name, r.brand, r.category, r.sku, r.shopee_product_id, ...vs.map((v) => v.sku)].filter(Boolean).join(" ")),
  };
};
const SORTS: { value: string; label: string; cmp: (a: Row, b: Row) => number }[] = [
  { value: "id", label: "ID (cũ nhất trước)", cmp: (a, b) => a.id - b.id },
  { value: "newest", label: "ID (mới nhất trước)", cmp: (a, b) => b.id - a.id },
  { value: "name", label: "Tên A–Z", cmp: (a, b) => (a.name ?? "").localeCompare(b.name ?? "", "vi") },
  { value: "price-asc", label: "Giá: thấp đến cao", cmp: (a, b) => (a.price ?? 0) - (b.price ?? 0) },
  { value: "price-desc", label: "Giá: cao đến thấp", cmp: (a, b) => (b.price ?? 0) - (a.price ?? 0) },
  { value: "stock-asc", label: "Tồn kho: thấp đến cao", cmp: (a, b) => (a.stock ?? 0) - (b.stock ?? 0) },
  { value: "stock-desc", label: "Tồn kho: cao đến thấp", cmp: (a, b) => (b.stock ?? 0) - (a.stock ?? 0) },
  { value: "discount", label: "Giảm giá nhiều nhất", cmp: (a, b) => b.pct - a.pct },
];
const PAGE = 25;
const LOW = 5;

const newVid = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const slugify = (t: string) =>
  t.normalize("NFD").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
const numOrNull = (v: string) => (v === "" ? null : Number(v));
const HEX6 = /^#[0-9a-f]{6}$/i;

const input = "w-full p-2 rounded-md border border-border bg-surface text-sm";
const btn = "px-3 py-2 rounded-md border border-border text-sm cursor-pointer hover:bg-surface-hover";
const btnPrimary = "px-4 py-2 rounded-md bg-primary text-white text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 text-sm ${className}`}>
      <span className="text-text/60">{label}</span>
      {children}
    </label>
  );
}

const blankItem = (id: number): Item => ({
  id, name: "", brand: "", category: "", sku: null, slug: null, description: "",
  isNew: false, isBestseller: false, onDiscount: false, displayTags: [],
  images: [], colors: [], sizes: [],
  variants: [{ variationId: newVid(), sku: null, gtin: null, name: null, color: null, size: null, price: 0, stock: 0 }],
});

// ---------------------------------------------------------------- editor
function Editor({ initial, isNew, onClose, onSaved }: {
  initial: Item; isNew: boolean; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const [it, setIt] = useState<Item>(initial);
  const [tags, setTags] = useState((initial.displayTags ?? []).join(", "));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const colors = it.colors ?? [];
  const sizes = it.sizes ?? [];
  const variants = it.variants ?? [];
  const images = it.images ?? [];
  const patch = (p: Partial<Item>) => setIt((prev) => ({ ...prev, ...p }));

  const [pct, setPct] = useState("");
  const totalStock = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  const saleCount = variants.filter((v) => Number(v.originalPrice) > (Number(v.price) || 0)).length;
  const prices = variants.map((v) => Number(v.price) || 0);

  // ---- images
  const setImage = (i: number, v: string) => patch({ images: images.map((x, n) => (n === i ? v : x)) });
  const moveImage = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= images.length) return;
    const next = [...images];[next[i], next[j]] = [next[j], next[i]]; patch({ images: next });
  };

  // ---- colors (renaming keeps variants attached)
  const setColor = (i: number, p: Partial<Color>) => {
    const old = colors[i].name;
    patch({
      colors: colors.map((c, n) => (n === i ? { ...c, ...p } : c)),
      variants: p.name !== undefined ? variants.map((v) => (v.color === old ? { ...v, color: p.name } : v)) : variants,
    });
  };
  const removeColor = (i: number) => {
    const name = colors[i].name;
    const affected = variants.filter((v) => v.color === name).length;
    if (affected && !confirm(`Xóa màu này cũng sẽ xóa ${affected} biến thể. Tiếp tục?`)) return;
    patch({ colors: colors.filter((_, n) => n !== i), variants: variants.filter((v) => v.color !== name) });
  };

  // ---- sizes
  const setSize = (i: number, label: string) => {
    const old = sizes[i].label;
    patch({
      sizes: sizes.map((s, n) => (n === i ? { label } : s)),
      variants: variants.map((v) => (v.size === old ? { ...v, size: label } : v)),
    });
  };
  const removeSize = (i: number) => {
    const label = sizes[i].label;
    const affected = variants.filter((v) => v.size === label).length;
    if (affected && !confirm(`Xóa kích cỡ này cũng sẽ xóa ${affected} biến thể. Tiếp tục?`)) return;
    patch({ sizes: sizes.filter((_, n) => n !== i), variants: variants.filter((v) => v.size !== label) });
  };

  // ---- variants
  const setVariant = (i: number, p: Partial<Variant>) =>
    patch({ variants: variants.map((v, n) => (n === i ? { ...v, ...p } : v)) });

  const addVariant = () =>
    patch({
      variants: [...variants, {
        variationId: newVid(), sku: null, gtin: null, name: null,
        color: colors[0]?.name ?? null, size: sizes[0]?.label ?? null, price: variants[0]?.price ?? 0, stock: 0
      }]
    });

  const generateCombos = () => {
    const cs = colors.filter((c) => c.name).map((c) => c.name as string);
    const ss = sizes.filter((s) => s.label).map((s) => s.label as string);
    const rowsC: (string | null)[] = cs.length ? cs : [null];
    const rowsS: (string | null)[] = ss.length ? ss : [null];
    const added: Variant[] = [];
    for (const c of rowsC) for (const s of rowsS) {
      if (variants.some((v) => (v.color ?? null) === c && (v.size ?? null) === s)) continue;
      added.push({
        variationId: newVid(), sku: null, gtin: null, name: [c, s].filter(Boolean).join(",") || null,
        color: c, size: s, price: variants[0]?.price ?? 0, stock: 0
      });
    }
    patch({ variants: [...variants, ...added] });
  };

  // ---- discount tools
  const applyPct = () => {
    const p = Number(pct);
    if (!(p >= 1 && p <= 95)) { setErr("Nhập mức giảm giá từ 1 đến 95 %."); return; }
    setErr("");
    patch({
      variants: variants.map((v) => {
        const price = Number(v.price) || 0;
        const base = Number(v.originalPrice) > price ? Number(v.originalPrice) : price; // re-applying restarts from the original price
        return { ...v, originalPrice: base, price: Math.round((base * (1 - p / 100)) / 500) * 500 };
      }),
    });
  };
  const removeDiscount = () =>
    patch({
      variants: variants.map((v) => ({
        ...v,
        price: Number(v.originalPrice) > (Number(v.price) || 0) ? Number(v.originalPrice) : v.price,
        originalPrice: null,
      })),
    });

  // ---- validate + save
  function validate(): string | null {
    if (!it.name?.trim()) return "Vui lòng nhập tên sản phẩm.";
    if (variants.length === 0) return "Hãy thêm ít nhất một biến thể (biến thể chứa giá và tồn kho).";
    const seen = new Set<string>();
    for (const v of variants) {
      if (!(Number(v.price) > 0)) return "Mỗi biến thể cần có giá lớn hơn 0.";
      if (!(Number(v.stock) >= 0)) return "Mỗi biến thể cần có tồn kho từ 0 trở lên.";
      const op = Number(v.originalPrice) || 0;
      if (op && op <= (Number(v.price) || 0)) return "Giá gốc phải cao hơn giá bán (hoặc để trống nếu không giảm giá).";
      if (colors.length && !colors.some((c) => c.name === v.color)) return "Mỗi biến thể cần chọn một màu từ danh sách phía trên.";
      if (sizes.length && !sizes.some((s) => s.label === v.size)) return "Mỗi biến thể cần chọn một kích cỡ từ danh sách phía trên.";
      const k = `${v.color ?? ""}|${v.size ?? ""}`;
      if (seen.has(k)) return "Có hai biến thể trùng cả màu và kích cỡ.";
      seen.add(k);
    }
    if (new Set(colors.map((c) => c.name)).size !== colors.length) return "Có tên màu bị trùng.";
    if (new Set(sizes.map((s) => s.label)).size !== sizes.length) return "Có kích cỡ bị trùng.";
    if (colors.some((c) => !c.name?.trim())) return "Có một màu chưa có tên.";
    if (sizes.some((s) => !s.label?.trim())) return "Có một kích cỡ chưa có tên.";
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr("");

    const cleanVariants: Variant[] = variants.map((v) => ({
      ...v,
      price: Number(v.price) || 0,
      originalPrice: Number(v.originalPrice) > (Number(v.price) || 0) ? Number(v.originalPrice) : null,
      stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
      name: v.name || [v.color, v.size].filter(Boolean).join(",") || null,
      sku: v.sku || null,
    }));
    const stock = cleanVariants.reduce((s, v) => s + (v.stock ?? 0), 0);
    const ps = cleanVariants.map((v) => v.price ?? 0);
    const name = it.name!.trim();

    const out: Item = {
      ...it,
      name,
      slug: it.slug?.trim() || `${slugify(name)}-${it.id}`,
      brand: it.brand?.trim() || null,
      category: it.category?.trim() || null,
      categoryPath: it.categoryPath?.length ? it.categoryPath : it.category?.trim() ? [it.category.trim()] : [],
      description: it.description?.trim() || null,
      price: Math.min(...ps),
      onDiscount: cleanVariants.some((v) => !!v.originalPrice),
      maxPrice: Math.max(...ps),
      stock,
      inStock: stock > 0,
      displayTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      images: images.map((u) => u.trim()).filter(Boolean),
      colors: colors.map((c) => ({ name: c.name!.trim(), hex: c.hex?.trim() || null, image: c.image?.trim() || null })),
      sizes: sizes.map((s) => ({ label: s.label!.trim() })),
      variants: cleanVariants,
    };

    const row = itemToRow(out);
    const { error } = isNew
      ? await supabase!.from("products").insert(row)
      : await supabase!.from("products").update(row).eq("id", out.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    invalidateItems();
    onSaved(isNew ? `Đã tạo “${name}”` : `Đã lưu “${name}”`);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 overflow-y-auto p-4" role="dialog" aria-modal="true">
      <div className="max-w-4xl mx-auto bg-surface border border-border rounded-lg">
        <div className="p-6 flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-2xl">{isNew ? `Sản phẩm mới #${it.id}` : `Sửa sản phẩm #${it.id}`}</h2>
            <button type="button" onClick={onClose} className={btn}>✕ Đóng</button>
          </div>

          {/* basics */}
          <section className="grid sm:grid-cols-2 gap-4">
            <Field label="Tên sản phẩm *" className="sm:col-span-2">
              <input className={input} value={it.name ?? ""} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field label="Thương hiệu"><input className={input} value={it.brand ?? ""} onChange={(e) => patch({ brand: e.target.value })} /></Field>
            <Field label="Danh mục"><input className={input} value={it.category ?? ""} onChange={(e) => patch({ category: e.target.value })} /></Field>
            <Field label="SKU"><input className={input} value={it.sku ?? ""} onChange={(e) => patch({ sku: e.target.value })} /></Field>
            <Field label="Slug (để trống = tự động)"><input className={input} value={it.slug ?? ""} onChange={(e) => patch({ slug: e.target.value })} /></Field>
            <Field label="Mô tả" className="sm:col-span-2">
              <textarea rows={6} className={input} value={it.description ?? ""} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
            <Field label="Thẻ (cách nhau bằng dấu phẩy)" className="sm:col-span-2">
              <input className={input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VD: Quà tặng, Hữu cơ" />
            </Field>
            <div className="sm:col-span-2 flex flex-wrap gap-6 text-sm">
              {([["isNew", "Mới"], ["isBestseller", "Bán chạy"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={!!it[k]} onChange={(e) => patch({ [k]: e.target.checked })} /> {l}
                </label>
              ))}
            </div>
          </section>

          {/* images */}
          <section className="flex flex-col gap-3">
            <h3 className="font-semibold text-lg">Hình ảnh <span className="text-sm font-normal text-text/50">(ảnh đầu tiên là ảnh bìa; dán đường dẫn URL)</span></h3>
            {images.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="size-10 shrink-0 rounded bg-gray-300 overflow-hidden">
                  {u && <img src={u} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                </div>
                <input className={input} value={u} onChange={(e) => setImage(i, e.target.value)} placeholder="https://…" />
                <button type="button" className={btn} onClick={() => moveImage(i, -1)} aria-label="Di chuyển lên">↑</button>
                <button type="button" className={btn} onClick={() => moveImage(i, 1)} aria-label="Di chuyển xuống">↓</button>
                <button type="button" className={btn} onClick={() => patch({ images: images.filter((_, n) => n !== i) })} aria-label="Xóa">✕</button>
              </div>
            ))}
            <div><button type="button" className={btn} onClick={() => patch({ images: [...images, ""] })}>+ Thêm ảnh</button></div>
          </section>

          {/* colors + sizes */}
          <section className="grid md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold text-lg">Màu sắc <span className="text-sm font-normal text-text/50">(không bắt buộc)</span></h3>
              {colors.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={input} value={c.name ?? ""} onChange={(e) => setColor(i, { name: e.target.value })} placeholder="Tên" />
                  <input type="color" value={c.hex && HEX6.test(c.hex) ? c.hex : "#cccccc"} onChange={(e) => setColor(i, { hex: e.target.value })} className="size-9 shrink-0 p-0 border border-border rounded cursor-pointer" aria-label="Chọn màu" />
                  <button type="button" className={btn} title="Xóa mã màu" onClick={() => setColor(i, { hex: null })}>{c.hex ? "mã màu ✕" : "chưa có mã"}</button>
                  <button type="button" className={btn} onClick={() => removeColor(i)} aria-label="Xóa màu">✕</button>
                </div>
              ))}
              <div><button type="button" className={btn} onClick={() => patch({ colors: [...colors, { name: "", hex: null, image: null }] as Color[] })}>+ Thêm màu</button></div>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="font-semibold text-lg">Kích cỡ <span className="text-sm font-normal text-text/50">(không bắt buộc)</span></h3>
              {sizes.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={input} value={s.label ?? ""} onChange={(e) => setSize(i, e.target.value)} placeholder="VD: 3-6M" />
                  <button type="button" className={btn} onClick={() => removeSize(i)} aria-label="Xóa kích cỡ">✕</button>
                </div>
              ))}
              <div><button type="button" className={btn} onClick={() => patch({ sizes: [...sizes, { label: "" }] as Size[] })}>+ Thêm kích cỡ</button></div>
            </div>
          </section>

          {/* variants */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-lg">Biến thể – giá &amp; tồn kho</h3>
              <div className="flex gap-2">
                <button type="button" className={btn} onClick={generateCombos}>Tạo tất cả tổ hợp màu × kích cỡ</button>
                <button type="button" className={btn} onClick={addVariant}>+ Thêm biến thể</button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-muted/40 p-4">
              <Field label="Giảm giá tất cả biến thể (%)" className="w-52">
                <input type="number" min={1} max={95} className={input} value={pct} onChange={(e) => setPct(e.target.value)} placeholder="VD: 20" />
              </Field>
              <button type="button" className={btn} onClick={applyPct}>Áp dụng</button>
              <button type="button" className={btn} onClick={removeDiscount}>Bỏ giảm giá</button>
              <p className="basis-full text-xs text-text/60">
                Giữ giá cũ làm “Giá gốc” và giảm “Giá” theo tỷ lệ % đó, làm tròn đến 500 ₫ gần nhất. Áp dụng lại sẽ tính lại từ giá gốc.
                Bạn cũng có thể đặt giá gốc riêng cho từng biến thể bên dưới; sản phẩm sẽ tự động được đánh dấu “đang giảm giá”.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-text/60">
                  <tr>
                    {colors.length > 0 && <th className="pr-2 pb-1">Màu</th>}
                    {sizes.length > 0 && <th className="pr-2 pb-1">Kích cỡ</th>}
                    <th className="pr-2 pb-1">Giá (₫)</th><th className="pr-2 pb-1">Giá gốc (₫)</th><th className="pr-2 pb-1">Giảm</th><th className="pr-2 pb-1">Tồn kho</th><th className="pr-2 pb-1">SKU</th><th />
                  </tr>
                </thead>
                <tbody>
                  {variants.map((v, i) => (
                    <tr key={v.variationId}>
                      {colors.length > 0 && (
                        <td className="pr-2 py-1">
                          <select className={input} value={v.color ?? ""} onChange={(e) => setVariant(i, { color: e.target.value || null })}>
                            <option value="">—</option>
                            {colors.map((c, n) => <option key={n} value={c.name ?? ""}>{c.name}</option>)}
                          </select>
                        </td>
                      )}
                      {sizes.length > 0 && (
                        <td className="pr-2 py-1">
                          <select className={input} value={v.size ?? ""} onChange={(e) => setVariant(i, { size: e.target.value || null })}>
                            <option value="">—</option>
                            {sizes.map((s, n) => <option key={n} value={s.label ?? ""}>{s.label}</option>)}
                          </select>
                        </td>
                      )}
                      <td className="pr-2 py-1"><input type="number" min={0} className={input} value={v.price ?? ""} onChange={(e) => setVariant(i, { price: numOrNull(e.target.value) })} /></td>
                      <td className="pr-2 py-1"><input type="number" min={0} className={input} placeholder="không giảm giá" value={v.originalPrice ?? ""} onChange={(e) => setVariant(i, { originalPrice: numOrNull(e.target.value) })} /></td>
                      <td className="pr-2 py-1 whitespace-nowrap text-danger font-medium">{percentOff(Number(v.originalPrice) || 0, Number(v.price) || 0) > 0 ? `-${percentOff(Number(v.originalPrice) || 0, Number(v.price) || 0)}%` : ""}</td>
                      <td className="pr-2 py-1"><input type="number" min={0} className={input} value={v.stock ?? ""} onChange={(e) => setVariant(i, { stock: numOrNull(e.target.value) })} /></td>
                      <td className="pr-2 py-1"><input className={input} value={v.sku ?? ""} onChange={(e) => setVariant(i, { sku: e.target.value })} /></td>
                      <td className="py-1"><button type="button" className={btn} onClick={() => patch({ variants: variants.filter((_, n) => n !== i) })} aria-label="Xóa biến thể">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-text/60">
              Tổng tồn kho <b>{totalStock}</b> · giá {variants.length ? (Math.min(...prices) === Math.max(...prices) ? vnd(prices[0]) : `${vnd(Math.min(...prices))} – ${vnd(Math.max(...prices))}`) : "—"}
              {saleCount > 0 && <> · <b>{saleCount}</b> đang giảm giá</>}<span className="text-text/40"> (tự động tính khi lưu)</span>
            </p>
          </section>
        </div>

        <div className="sticky bottom-0 bg-surface border-t border-border rounded-b-lg p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-danger">{err}</p>
          <div className="flex gap-2 shrink-0">
            <button type="button" className={btn} onClick={onClose}>Hủy</button>
            <button type="button" className={btnPrimary} disabled={busy} onClick={save}>{busy ? "Đang lưu…" : "Lưu sản phẩm"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- list
function Manager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "in" | "low" | "out">("all");
  const [saleF, setSaleF] = useState<"all" | "sale" | "none">("all");
  const [brandF, setBrandF] = useState("");
  const [catF, setCatF] = useState("");
  const [sort, setSort] = useState("id");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ item: Item; isNew: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const all: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase!.from("products").select(LIST_COLS).order("id").range(from, from + 999);
      if (error) { setErr(error.message); break; }
      all.push(...(data ?? []).map(toRow));
      if (!data || data.length < 1000) break;
    }
    setRows(all);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const nextId = useMemo(() => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1, [rows]);

  const brands = useMemo(() => [...new Set(rows.map((r) => r.brand).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "vi")), [rows]);
  const cats = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "vi")), [rows]);

  const shown = useMemo(() => {
    const t = fold(q.trim()).replace(/^#/, "");
    const cmp = SORTS.find((x) => x.value === sort)?.cmp ?? SORTS[0].cmp;
    return rows
      .filter((r) => {
        if (t && !r.find.includes(t)) return false;
        if (brandF && r.brand !== brandF) return false;
        if (catF && r.category !== catF) return false;
        if (saleF === "sale" && r.pct <= 0) return false;
        if (saleF === "none" && r.pct > 0) return false;
        const st = r.stock ?? 0;
        if (filter === "in") return st > 0;
        if (filter === "out") return st <= 0;
        if (filter === "low") return st > 0 && st <= LOW;
        return true;
      })
      .sort(cmp);
  }, [rows, q, filter, saleF, brandF, catF, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const view = shown.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => { setPage(0); }, [q, filter, saleF, brandF, catF, sort]);

  async function fetchFull(id: number): Promise<Item | null> {
    const { data, error } = await supabase!.from("products").select("*").eq("id", id).single();
    if (error) { setErr(error.message); return null; }
    return rowToItem(data);
  }
  async function edit(id: number) { const item = await fetchFull(id); if (item) setEditing({ item, isNew: false }); }
  async function duplicate(id: number) {
    const src = await fetchFull(id); if (!src) return;
    setEditing({
      isNew: true,
      item: {
        ...src, id: nextId, name: `${src.name ?? ""} (bản sao)`, slug: null, sku: null,
        shopeeProductId: null, shopeeUrl: null,
        variants: (src.variants ?? []).map((v) => ({ ...v, variationId: newVid(), sku: null })),
      },
    });
  }
  async function remove(r: Row) {
    if (!confirm(`Xóa vĩnh viễn “${r.name}”? Các đơn hàng cũ vẫn giữ bản sao thông tin của riêng chúng.`)) return;
    const { error } = await supabase!.from("products").delete().eq("id", r.id);
    if (error) { setErr(error.message); return; }
    invalidateItems(); setNotice(`Đã xóa “${r.name}”`); load();
  }
  async function toggle(r: Row, col: "is_new" | "is_bestseller") {
    const { error } = await supabase!.from("products").update({ [col]: !r[col] }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    invalidateItems(); setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, [col]: !r[col] } : x)));
  }

  return (
    <div className="max-w-6xl mx-auto p-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-4xl">Sản phẩm</h1>
        <div className="flex gap-2">
          <button className={btnPrimary} onClick={() => setEditing({ item: blankItem(nextId), isNew: true })}>+ Sản phẩm mới</button>
          <button className={btn} onClick={() => supabase!.auth.signOut()}>Đăng xuất</button>
        </div>
      </div>

      {err && <p className="text-sm text-danger">{err}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      <div className="flex flex-col gap-3">
        <input className={input} placeholder="Tìm theo tên sản phẩm, SKU hoặc mã sản phẩm…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap items-center gap-3">
          <select className={`${input} w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Lọc theo tồn kho">
            <option value="all">Tồn kho: tất cả</option><option value="in">Còn hàng</option><option value="low">Sắp hết (≤ {LOW})</option><option value="out">Hết hàng</option>
          </select>
          <select className={`${input} w-auto`} value={saleF} onChange={(e) => setSaleF(e.target.value as typeof saleF)} aria-label="Lọc theo giảm giá">
            <option value="all">Giảm giá: tất cả</option><option value="sale">Đang giảm giá</option><option value="none">Không giảm giá</option>
          </select>
          <select className={`${input} w-auto max-w-[12rem]`} value={brandF} onChange={(e) => setBrandF(e.target.value)} aria-label="Lọc theo thương hiệu">
            <option value="">Tất cả thương hiệu</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className={`${input} w-auto max-w-[12rem]`} value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Lọc theo danh mục">
            <option value="">Tất cả danh mục</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className={`${input} w-auto`} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sắp xếp theo">
            {SORTS.map((x) => <option key={x.value} value={x.value}>Sắp xếp: {x.label}</option>)}
          </select>
          {(q || filter !== "all" || saleF !== "all" || brandF || catF || sort !== "id") && (
            <button type="button" className="text-sm text-primary hover:underline cursor-pointer" onClick={() => { setQ(""); setFilter("all"); setSaleF("all"); setBrandF(""); setCatF(""); setSort("id"); }}>✕ Đặt lại</button>
          )}
          <span className="ml-auto text-sm text-text/60">{shown.length} / {rows.length}</span>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm [&_th]:px-4 [&_td]:px-4 [&_th]:py-4 [&_td]:py-4">
          <thead className="text-left text-text/60">
            <tr><th className="px-4 py-4 font-medium">Sản phẩm</th><th className="px-4 py-4 font-medium">Thương hiệu</th><th className="px-4 py-4 font-medium">Giá</th><th className="px-4 py-4 font-medium">Giảm giá</th><th className="px-4 py-4 font-medium text-right">Tồn kho</th><th className="px-4 py-4 font-medium text-center">Mới</th><th className="px-4 py-4 font-medium text-center">Bán chạy</th><th className="px-4 py-4" /></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="p-4 text-text/60">Đang tải…</td></tr>}
            {!loading && view.length === 0 && <tr><td colSpan={8} className="p-4 text-text/60">Không tìm thấy sản phẩm nào.</td></tr>}
            {view.map((r) => (
              <tr key={r.id} className="border-t border-border align-middle">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-4 min-w-[18rem]">
                    <div className="size-10 shrink-0 rounded bg-gray-300 overflow-hidden">
                      {r.images?.[0] && <img src={r.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium line-clamp-1">{r.name || "Chưa có tên"}</p>
                      <p className="text-xs text-text/50">#{r.id}{r.category ? ` · ${r.category}` : ""}{r.sku ? ` · SKU ${r.sku}` : ""}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">{r.brand ?? "—"}</td>
                <td className="px-4 py-4 whitespace-nowrap">{r.price != null ? vnd(r.price) : "—"}</td>
                <td className="px-4 py-4">{r.pct > 0 ? <span className="px-2 py-0.5 rounded-full bg-danger text-white text-xs font-semibold">-{r.pct}%</span> : <span className="text-text/40">—</span>}</td>
                <td className={`px-4 py-4 text-right font-semibold ${(r.stock ?? 0) <= 0 ? "text-danger" : (r.stock ?? 0) <= LOW ? "text-accent" : ""}`}>{r.stock ?? 0}</td>
                <td className="px-4 py-4 text-center"><input type="checkbox" className="size-4 cursor-pointer" checked={r.is_new} onChange={() => toggle(r, "is_new")} aria-label="Mới" /></td>
                <td className="px-4 py-4 text-center"><input type="checkbox" className="size-4 cursor-pointer" checked={r.is_bestseller} onChange={() => toggle(r, "is_bestseller")} aria-label="Bán chạy" /></td>
                <td className="px-4 py-4 whitespace-nowrap text-right">
                  <button className={btn} onClick={() => edit(r.id)}>Sửa</button>{" "}
                  <button className={btn} onClick={() => duplicate(r.id)}>Nhân bản</button>{" "}
                  <button className={`${btn} text-danger`} onClick={() => remove(r)}>Xóa</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-4 text-sm">
        <button className={btn} disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Trước</button>
        <span>Trang {page + 1} / {pages}</span>
        <button className={btn} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Sau ›</button>
      </div>

      {editing && (
        <Editor
          key={`${editing.isNew}-${editing.item.id}`}
          initial={editing.item}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); setNotice(msg); setErr(""); load(); }}
        />
      )}
    </div>
  );
}

export default function AdminProducts() {
  return (
    <AdminGate>
      <Manager />
    </AdminGate>
  );
}