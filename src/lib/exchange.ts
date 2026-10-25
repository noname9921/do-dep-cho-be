import { fold, percentOff, type Color, type Item, type Variant } from "./types";
import { BASIC_HEAD, DISCOUNT_HEAD, SALES_HEAD } from "./shopeeTemplates";

// Everything here is plain data in -> data out (no React, no Supabase), so it can be tested on its own.
//   • import:  spreadsheet grid / JSON text  ->  Plan (what would change)  ->  caller saves plan.updated + plan.created
//   • export:  Item[]  ->  rows for CSV / XLSX / JSON
//   • bulk:    Item + BulkOp -> changed Item

export type Cell = string | number | boolean | null | undefined;
export type Grid = Cell[][];

// ------------------------------------------------------------------ small helpers
// Excel stores some control characters as _x000D_ (carriage return); turn those back into real characters
const unesc = (s: string) => s.replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
const text = (c: Cell): string => (c === null || c === undefined ? "" : unesc(String(c)).trim());
const idOf = (c: Cell): string => (typeof c === "number" ? String(Math.round(c)) : text(c).replace(/\.0+$/, ""));
const num = (c: Cell): number | null => {
  if (c === null || c === undefined) return null;
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  const s = String(c).replace(/[\s,]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const normText = (s: string) => unesc(s).replace(/\r\n?/g, "\n").trim();
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const slugify = (t: string) =>
  fold(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);

// price / stock / flags of a product follow from its variants (same rules as the product editor)
export function recompute(i: Item): Item {
  const vs = i.variants ?? [];
  if (vs.length === 0) return i;
  const ps = vs.map((v) => Number(v.price) || 0);
  const stock = vs.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  i.price = Math.min(...ps);
  i.maxPrice = Math.max(...ps);
  i.stock = stock;
  i.inStock = stock > 0;
  i.onDiscount = vs.some((v) => Number(v.originalPrice) > (Number(v.price) || 0));
  return i;
}

// ------------------------------------------------------------------ import: plan
export type ImportKind = "sales_info" | "basic_info" | "media_info" | "discount" | "json";
export const KIND_LABEL: Record<ImportKind, string> = {
  sales_info: "Shopee · Giá & tồn kho (sales_info)",
  basic_info: "Shopee · Tên, SKU, mô tả (basic_info)",
  media_info: "Shopee · Hình ảnh & danh mục (media_info)",
  discount: "Shopee · Giá khuyến mãi (discount_nominate)",
  json: "JSON sản phẩm",
};

export type PlanChange = { id: number; name: string; notes: string[] };
export type Plan = {
  kind: ImportKind;
  read: number;       // data rows (or products, for JSON) in the file
  matched: number;    // rows that found their product / variant
  skipped: number;    // rows that could not be used
  updated: Item[];    // existing products to overwrite
  created: Item[];    // new products (JSON only)
  changes: PlanChange[];
  warnings: string[];
};

type Index = { byPid: Map<string, Item>; byId: Map<number, Item> };
function indexItems(items: Item[]): Index {
  const byPid = new Map<string, Item>();
  const byId = new Map<number, Item>();
  for (const i of items) {
    byId.set(i.id, i);
    if (i.shopeeProductId) byPid.set(String(i.shopeeProductId), i);
  }
  return { byPid, byId };
}
const findItem = (ix: Index, pid: string) => ix.byPid.get(pid) ?? ix.byId.get(Number(pid));

// collects edits on copies of the products and remembers what changed, so the preview can explain it
class Work {
  private copies = new Map<number, Item>();
  private notes = new Map<number, Map<string, number>>();
  edit(item: Item): Item {
    let w = this.copies.get(item.id);
    if (!w) { w = clone(item); this.copies.set(item.id, w); }
    return w;
  }
  note(id: number, label: string) {
    const m = this.notes.get(id) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + 1);
    this.notes.set(id, m);
  }
  finish(): { updated: Item[]; changes: PlanChange[] } {
    const updated: Item[] = [];
    const changes: PlanChange[] = [];
    for (const [id, w] of this.copies) {
      const n = this.notes.get(id);
      if (!n || n.size === 0) continue; // touched but nothing really changed
      recompute(w);
      updated.push(w);
      changes.push({ id, name: w.name ?? `#${id}`, notes: [...n].map(([k, c]) => (c > 1 ? `${k} ×${c}` : k)) });
    }
    return { updated, changes };
  }
}

const emptyPlan = (kind: ImportKind): Plan => ({ kind, read: 0, matched: 0, skipped: 0, updated: [], created: [], changes: [], warnings: [] });

// ---- the Shopee exports have a row of technical keys (et_title_…) followed by hint rows; find them
function keyIndex(grid: Grid) {
  const hdr = grid.findIndex((r) => r.some((c) => text(c) === "et_title_product_id"));
  const cols = new Map<string, number>();
  if (hdr >= 0) grid[hdr].forEach((c, i) => { const k = text(c); if (k) cols.set(k, i); });
  return { cols, rows: hdr >= 0 ? grid.slice(hdr + 1).filter((r) => /^\d{4,}$/.test(idOf(r[cols.get("et_title_product_id") ?? 0]))) : [] };
}

export function detectKind(grid: Grid): ImportKind | null {
  const seen = new Set<string>();
  grid.slice(0, 8).forEach((r) => r.forEach((c) => seen.add(text(c))));
  if (seen.has("et_title_variation_stock") || seen.has("et_title_variation_price")) return "sales_info";
  if (seen.has("et_title_product_description")) return "basic_info";
  if (seen.has("ps_item_cover_image")) return "media_info";
  const h = (grid[0] ?? []).map((c) => fold(text(c)));
  if (h.some((x) => x.includes("gia da giam") || x.includes("discounted price"))) return "discount";
  return null;
}

export function buildPlan(kind: Exclude<ImportKind, "json">, grid: Grid, items: Item[]): Plan {
  if (kind === "sales_info") return planSales(grid, items);
  if (kind === "basic_info") return planBasic(grid, items);
  if (kind === "media_info") return planMedia(grid, items);
  return planDiscount(grid, items);
}

function summarize(plan: Plan, work: Work, missing: Set<string>, extra: string[] = []) {
  const { updated, changes } = work.finish();
  plan.updated = updated;
  plan.changes = changes;
  if (missing.size) {
    const ex = [...missing].slice(0, 5).join(", ");
    plan.warnings.push(`${missing.size} mã sản phẩm trong file không có trong cửa hàng (vd: ${ex}) — đã bỏ qua.`);
  }
  plan.warnings.push(...extra);
  return plan;
}

// ---- sales_info: stock, regular price, SKU, GTIN of each variant
function planSales(grid: Grid, items: Item[]): Plan {
  const plan = emptyPlan("sales_info");
  const { cols, rows } = keyIndex(grid);
  const get = (r: Cell[], k: string): Cell => { const i = cols.get(k); return i === undefined ? null : r[i]; };
  const ix = indexItems(items);
  const work = new Work();
  const missing = new Set<string>();
  let noVariant = 0, badPrice = 0;

  for (const r of rows) {
    plan.read++;
    const pid = idOf(get(r, "et_title_product_id"));
    const item = findItem(ix, pid);
    if (!item) { plan.skipped++; missing.add(pid); continue; }
    const w = work.edit(item);
    const vid = idOf(get(r, "et_title_variation_id"));
    const vs = w.variants ?? [];
    const v = vid && vid !== "0" ? vs.find((x) => x.variationId === vid) : vs.length === 1 ? vs[0] : undefined;
    if (!v) { plan.skipped++; noVariant++; continue; }
    plan.matched++;

    const stock = num(get(r, "et_title_variation_stock"));
    if (stock !== null) {
      const s = Math.max(0, Math.round(stock));
      if (v.stock !== s) { v.stock = s; work.note(w.id, "tồn kho"); }
    }
    const price = num(get(r, "et_title_variation_price"));
    if (price !== null) {
      if (price < 1000 || price > 120_000_000) badPrice++;
      else {
        // "Giá" in the Shopee file is the regular price: keep a running sale if it is still lower
        const cur = Number(v.price) || 0;
        const onSale = Number(v.originalPrice) > cur;
        if (onSale && price > cur) {
          if (v.originalPrice !== price) { v.originalPrice = price; work.note(w.id, "giá gốc"); }
        } else if (onSale) {
          v.price = price; v.originalPrice = null; work.note(w.id, "giá (hết giảm giá)");
        } else if (v.price !== price) {
          v.price = price; work.note(w.id, "giá");
        }
      }
    }
    const sku = text(get(r, "et_title_variation_sku"));
    if (sku && sku !== (v.sku ?? "")) { v.sku = sku; work.note(w.id, "SKU phân loại"); }
    const gtin = text(get(r, "ps_gtin_code"));
    if (gtin && gtin !== (v.gtin ?? "")) { v.gtin = gtin; work.note(w.id, "GTIN"); }
    const psku = text(get(r, "et_title_parent_sku"));
    if (psku && psku !== (w.sku ?? "")) { w.sku = psku; work.note(w.id, "SKU sản phẩm"); }
  }
  const extra: string[] = [];
  if (noVariant) extra.push(`${noVariant} dòng không tìm thấy mã phân loại trong sản phẩm — đã bỏ qua.`);
  if (badPrice) extra.push(`${badPrice} dòng có giá ngoài khoảng 1.000 – 120.000.000 ₫ — giá của các dòng này không được đổi.`);
  return summarize(plan, work, missing, extra);
}

// ---- discount_nominate: "Giá gốc" + "Giá đã giảm" per variant
function planDiscount(grid: Grid, items: Item[]): Plan {
  const plan = emptyPlan("discount");
  const head = (grid[0] ?? []).map((c) => fold(text(c)));
  const at = (label: string, fallback: number) => { const i = head.findIndex((h) => h.startsWith(label)); return i >= 0 ? i : fallback; };
  const cPid = at("ma san pham", 0), cVid = at("ma phan loai", 3), cOrig = at("gia goc", 6), cDisc = at("gia da giam", 7);
  const ix = indexItems(items);
  const work = new Work();
  const missing = new Set<string>();
  let noVariant = 0, invalid = 0;

  for (const r of grid.slice(1)) {
    const pid = idOf(r[cPid]);
    if (!/^\d{4,}$/.test(pid)) continue;
    plan.read++;
    const item = findItem(ix, pid);
    if (!item) { plan.skipped++; missing.add(pid); continue; }
    const w = work.edit(item);
    const vid = idOf(r[cVid]);
    const vs = w.variants ?? [];
    const v = vid && vid !== "0" ? vs.find((x) => x.variationId === vid) : vs.length === 1 ? vs[0] : undefined;
    if (!v) { plan.skipped++; noVariant++; continue; }
    const disc = num(r[cDisc]);
    const cur = Number(v.price) || 0;
    const regular = Number(v.originalPrice) > cur ? Number(v.originalPrice) : cur;
    const orig = num(r[cOrig]) ?? regular;
    if (disc === null || disc < 1000 || disc >= orig) { plan.skipped++; invalid++; continue; }
    plan.matched++;
    if (v.price !== disc || v.originalPrice !== orig) {
      v.originalPrice = orig; v.price = disc; work.note(w.id, "giá khuyến mãi");
    }
  }
  const extra: string[] = [];
  if (noVariant) extra.push(`${noVariant} dòng không tìm thấy mã phân loại — đã bỏ qua.`);
  if (invalid) extra.push(`${invalid} dòng có “Giá đã giảm” trống hoặc không thấp hơn giá gốc — đã bỏ qua.`);
  return summarize(plan, work, missing, extra);
}

// ---- basic_info: name, parent SKU, description
function planBasic(grid: Grid, items: Item[]): Plan {
  const plan = emptyPlan("basic_info");
  const { cols, rows } = keyIndex(grid);
  const get = (r: Cell[], k: string): Cell => { const i = cols.get(k); return i === undefined ? null : r[i]; };
  const ix = indexItems(items);
  const work = new Work();
  const missing = new Set<string>();

  for (const r of rows) {
    plan.read++;
    const pid = idOf(get(r, "et_title_product_id"));
    const item = findItem(ix, pid);
    if (!item) { plan.skipped++; missing.add(pid); continue; }
    plan.matched++;
    const w = work.edit(item);
    const name = text(get(r, "et_title_product_name"));
    if (name && name !== (w.name ?? "").trim()) { w.name = name; work.note(w.id, "tên"); }
    const sku = text(get(r, "et_title_parent_sku"));
    if (sku && sku !== (w.sku ?? "").trim()) { w.sku = sku; work.note(w.id, "SKU"); }
    const desc = normText(String(get(r, "et_title_product_description") ?? ""));
    if (desc && desc !== normText(w.description ?? "")) { w.description = desc; work.note(w.id, "mô tả"); }
  }
  return summarize(plan, work, missing);
}

// ---- media_info: images, size chart, category, colour images
function planMedia(grid: Grid, items: Item[]): Plan {
  const plan = emptyPlan("media_info");
  const { cols, rows } = keyIndex(grid);
  const get = (r: Cell[], k: string): Cell => { const i = cols.get(k); return i === undefined ? null : r[i]; };
  const ix = indexItems(items);
  const work = new Work();
  const missing = new Set<string>();
  const url = (c: Cell) => { const s = text(c); return /^https?:\/\//i.test(s) ? s : ""; };

  for (const r of rows) {
    plan.read++;
    const pid = idOf(get(r, "et_title_product_id"));
    const item = findItem(ix, pid);
    if (!item) { plan.skipped++; missing.add(pid); continue; }
    plan.matched++;
    const w = work.edit(item);

    const imgs = [get(r, "ps_item_cover_image"), ...Array.from({ length: 8 }, (_, n) => get(r, `ps_item_image.${n + 1}`))].map(url).filter(Boolean);
    if (imgs.length && !same(imgs, w.images ?? [])) { w.images = imgs; work.note(w.id, "ảnh"); }

    const chart = url(get(r, "et_title_size_chart"));
    if (chart && chart !== (w.sizeChart ?? "")) { w.sizeChart = chart; work.note(w.id, "bảng size"); }

    const m = /^\s*(\d+)\s*-\s*(.+)$/.exec(text(get(r, "et_title_product_category")));
    if (m) {
      const path = m[2].split("/").map((s) => s.trim()).filter(Boolean);
      const id = Number(m[1]);
      if (id !== w.categoryId || !same(path, w.categoryPath ?? [])) {
        w.categoryId = id; w.categoryPath = path; w.category = path[path.length - 1] ?? w.category;
        work.note(w.id, "danh mục");
      }
    }

    // option images (only for colours the product already has; names must match)
    for (let n = 1; n <= 24; n++) {
      const name = text(get(r, `et_title_option_${n}_for_variation_1`));
      const img = url(get(r, `et_title_option_image_${n}_for_variation_1`));
      if (!name || !img) continue;
      const c = (w.colors ?? []).find((x: Color) => fold(x.name ?? "") === fold(name));
      if (c && c.image !== img) { c.image = img; work.note(w.id, "ảnh phân loại"); }
    }
  }
  return summarize(plan, work, missing);
}

// ------------------------------------------------------------------ import: JSON (validated against the Item type in types.ts)
type Raw = Record<string, unknown>;
const isObj = (x: unknown): x is Raw => typeof x === "object" && x !== null && !Array.isArray(x);

function fStr(o: Raw, k: string, errs: string[]): string | null {
  const v = o[k];
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  errs.push(`“${k}” phải là chuỗi`);
  return null;
}
function fNum(o: Raw, k: string, errs: string[]): number | null {
  const v = o[k];
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[\s,]/g, "")) : NaN;
  if (Number.isFinite(n)) return n;
  errs.push(`“${k}” phải là số`);
  return null;
}
function fBool(o: Raw, k: string, errs: string[]): boolean {
  const v = o[k];
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  errs.push(`“${k}” phải là true/false`);
  return false;
}
function fStrArr(o: Raw, k: string, errs: string[]): string[] {
  const v = o[k];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) { errs.push(`“${k}” phải là danh sách`); return []; }
  const out: string[] = [];
  v.forEach((x, n) => {
    if (typeof x === "string") out.push(x);
    else if (typeof x === "number" && Number.isFinite(x)) out.push(String(x));
    else errs.push(`“${k}[${n}]” phải là chuỗi`);
  });
  return out;
}

export function validateItem(raw: unknown): { item?: Item; errors: string[] } {
  const errs: string[] = [];
  if (!isObj(raw)) return { errors: ["không phải một đối tượng"] };
  const idN = fNum(raw, "id", errs);
  if (idN === null || !Number.isInteger(idN) || idN <= 0) errs.push("thiếu “id” (số nguyên dương)");
  const name = fStr(raw, "name", errs);
  if (!name) errs.push("thiếu “name”");

  const colors: Color[] = [];
  if (raw.colors !== undefined && raw.colors !== null) {
    if (!Array.isArray(raw.colors)) errs.push("“colors” phải là danh sách");
    else raw.colors.forEach((c, n) => {
      if (!isObj(c)) { errs.push(`“colors[${n}]” không hợp lệ`); return; }
      const e: string[] = [];
      colors.push({ name: fStr(c, "name", e), hex: fStr(c, "hex", e), image: fStr(c, "image", e) });
      e.forEach((m) => errs.push(`colors[${n}]: ${m}`));
    });
  }
  const sizes: { label: string | null }[] = [];
  if (raw.sizes !== undefined && raw.sizes !== null) {
    if (!Array.isArray(raw.sizes)) errs.push("“sizes” phải là danh sách");
    else raw.sizes.forEach((s, n) => {
      if (!isObj(s)) { errs.push(`“sizes[${n}]” không hợp lệ`); return; }
      const e: string[] = [];
      sizes.push({ label: fStr(s, "label", e) });
      e.forEach((m) => errs.push(`sizes[${n}]: ${m}`));
    });
  }
  const variants: Variant[] = [];
  const seen = new Set<string>();
  if (raw.variants !== undefined && raw.variants !== null) {
    if (!Array.isArray(raw.variants)) errs.push("“variants” phải là danh sách");
    else raw.variants.forEach((v, n) => {
      if (!isObj(v)) { errs.push(`“variants[${n}]” không hợp lệ`); return; }
      const e: string[] = [];
      const variationId = fStr(v, "variationId", e);
      if (!variationId) e.push("thiếu “variationId”");
      else if (seen.has(variationId)) e.push(`“variationId” ${variationId} bị trùng`);
      else seen.add(variationId);
      const price = fNum(v, "price", e), orig = fNum(v, "originalPrice", e), stock = fNum(v, "stock", e);
      if (price !== null && price < 0) e.push("“price” không được âm");
      if (stock !== null && stock < 0) e.push("“stock” không được âm");
      if (orig !== null && price !== null && orig <= price) e.push("“originalPrice” phải lớn hơn “price” (hoặc để trống)");
      variants.push({
        variationId: variationId ?? "", sku: fStr(v, "sku", e), gtin: fStr(v, "gtin", e), name: fStr(v, "name", e),
        color: fStr(v, "color", e), size: fStr(v, "size", e), price, originalPrice: orig, stock: stock === null ? 0 : Math.round(stock),
      });
      e.forEach((m) => errs.push(`variants[${n}]: ${m}`));
    });
  }
  if (errs.length) return { errors: errs };

  const id = idN as number;
  const item: Item = {
    id,
    shopeeProductId: fStr(raw, "shopeeProductId", errs),
    sku: fStr(raw, "sku", errs),
    slug: fStr(raw, "slug", errs) ?? `${slugify(name as string)}-${id}`,
    brand: fStr(raw, "brand", errs),
    category: fStr(raw, "category", errs),
    categoryId: fNum(raw, "categoryId", errs),
    categoryPath: fStrArr(raw, "categoryPath", errs),
    description: fStr(raw, "description", errs),
    sizeChart: fStr(raw, "sizeChart", errs),
    shopeeUrl: fStr(raw, "shopeeUrl", errs),
    name: name as string,
    price: fNum(raw, "price", errs),
    maxPrice: fNum(raw, "maxPrice", errs),
    inStock: fBool(raw, "inStock", errs),
    stock: fNum(raw, "stock", errs),
    isNew: fBool(raw, "isNew", errs),
    isBestseller: fBool(raw, "isBestseller", errs),
    onDiscount: fBool(raw, "onDiscount", errs),
    displayTags: fStrArr(raw, "displayTags", errs),
    images: fStrArr(raw, "images", errs),
    colors,
    sizes,
    variants,
  };
  if (errs.length) return { errors: errs };
  return { item: variants.length ? recompute(item) : item, errors: [] };
}

export type JsonParse = { items: Item[]; total: number; errors: string[]; fatal?: string };

export function parseItemsJson(src: string): JsonParse {
  let data: unknown;
  try { data = JSON.parse(src); } catch (e) { return { items: [], total: 0, errors: [], fatal: `JSON không hợp lệ: ${e instanceof Error ? e.message : e}` }; }
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.items) ? data.items : null;
  if (!list) return { items: [], total: 0, errors: [], fatal: "Không tìm thấy danh sách sản phẩm. File phải là một mảng, hoặc { \"items\": [...] }." };
  const items: Item[] = [];
  const errors: string[] = [];
  const ids = new Set<number>();
  list.forEach((raw, n) => {
    const { item, errors: e } = validateItem(raw);
    const label = `#${n + 1}${isObj(raw) && raw.id !== undefined ? ` (id ${String(raw.id)})` : ""}`;
    if (!item) { errors.push(`${label}: ${e.join("; ")}`); return; }
    if (ids.has(item.id)) { errors.push(`${label}: id ${item.id} bị trùng trong file`); return; }
    ids.add(item.id);
    items.push(item);
  });
  return { items, total: list.length, errors };
}

export type JsonMode = "upsert" | "new-only";

export function planJson(parsed: JsonParse, existing: Item[], mode: JsonMode): Plan {
  const plan = emptyPlan("json");
  const ix = indexItems(existing);
  plan.read = parsed.total;
  plan.skipped = parsed.total - parsed.items.length;
  if (parsed.errors.length) {
    plan.warnings.push(`${parsed.errors.length} sản phẩm không hợp lệ — đã bỏ qua:`);
    plan.warnings.push(...parsed.errors.slice(0, 15).map((m) => `  ${m}`));
    if (parsed.errors.length > 15) plan.warnings.push(`  … và ${parsed.errors.length - 15} lỗi khác`);
  }
  for (const it of parsed.items) {
    const cur = ix.byId.get(it.id);
    if (!cur) { plan.created.push(it); plan.matched++; plan.changes.push({ id: it.id, name: it.name ?? `#${it.id}`, notes: ["thêm mới"] }); continue; }
    if (mode === "new-only") { plan.skipped++; continue; }
    plan.matched++;
    // compare like with like: run the stored product through the same normalisation first
    if (same(validateItem(cur).item ?? cur, it)) continue;
    plan.updated.push(it);
    plan.changes.push({ id: it.id, name: it.name ?? `#${it.id}`, notes: ["ghi đè"] });
  }
  return plan;
}

// ------------------------------------------------------------------ bulk updates
export type BulkOp =
  | { kind: "discount-pct"; pct: number }
  | { kind: "discount-clear" }
  | { kind: "price-adjust"; mode: "pct" | "amount"; sign: 1 | -1; value: number }
  | { kind: "stock-set"; value: number }
  | { kind: "stock-add"; value: number }
  | { kind: "flag"; flag: "is_new" | "is_bestseller"; on: boolean }
  | { kind: "brand"; value: string }
  | { kind: "category"; value: string }
  | { kind: "delete" };

// operations that are a single column update (no need to load the products first)
export function columnPatch(op: BulkOp): Record<string, unknown> | null {
  if (op.kind === "flag") return { [op.flag]: op.on };
  if (op.kind === "brand") return { brand: op.value.trim() || null };
  if (op.kind === "category") return { category: op.value.trim() || null };
  return null;
}

const round500 = (n: number) => Math.round(n / 500) * 500;

export function applyBulk(src: Item, op: BulkOp): Item {
  const it = clone(src);
  for (const v of it.variants ?? []) {
    const price = Number(v.price) || 0;
    const orig = Number(v.originalPrice) > price ? Number(v.originalPrice) : 0;
    switch (op.kind) {
      case "discount-pct": {
        const base = orig || price;
        const np = Math.max(1000, round500(base * (1 - op.pct / 100)));
        if (base > 0 && np < base) { v.originalPrice = base; v.price = np; }
        break;
      }
      case "discount-clear":
        if (orig) { v.price = orig; v.originalPrice = null; }
        break;
      case "price-adjust": {
        const f = (p: number) => Math.max(1000, op.mode === "pct" ? round500(p * (1 + (op.sign * op.value) / 100)) : Math.round(p + op.sign * op.value));
        if (price) v.price = f(price);
        if (orig) v.originalPrice = f(orig);
        if (v.originalPrice && v.price != null && v.originalPrice <= v.price) v.originalPrice = null;
        break;
      }
      case "stock-set": v.stock = Math.max(0, Math.round(op.value)); break;
      case "stock-add": v.stock = Math.max(0, (Number(v.stock) || 0) + Math.round(op.value)); break;
      default: break;
    }
  }
  return recompute(it);
}

export function bulkChanged(items: Item[], op: BulkOp): Item[] {
  return items.map((i) => ({ before: i, after: applyBulk(i, op) })).filter((x) => !same(x.before, x.after)).map((x) => x.after);
}

export function describeOp(op: BulkOp): string {
  switch (op.kind) {
    case "discount-pct": return `giảm giá ${op.pct}%`;
    case "discount-clear": return "xóa giảm giá";
    case "price-adjust": return `${op.sign > 0 ? "tăng" : "giảm"} giá ${op.value.toLocaleString("vi-VN")}${op.mode === "pct" ? "%" : " ₫"}`;
    case "stock-set": return `đặt tồn kho = ${op.value}`;
    case "stock-add": return `${op.value >= 0 ? "cộng" : "trừ"} ${Math.abs(op.value)} tồn kho`;
    case "flag": return `${op.on ? "đánh dấu" : "bỏ đánh dấu"} ${op.flag === "is_new" ? "Mới" : "Bán chạy"}`;
    case "brand": return `đổi thương hiệu thành “${op.value}”`;
    case "category": return `đổi danh mục thành “${op.value}”`;
    case "delete": return "xóa";
  }
}

// ------------------------------------------------------------------ export: rows
const flag = (b: unknown) => (b ? 1 : 0);
const pctOf = (v: Variant) => percentOff(v.originalPrice, v.price);
const maxPct = (i: Item) => (i.variants ?? []).reduce((m, v) => Math.max(m, pctOf(v)), 0);

export const VARIANT_HEAD = [
  "ID", "Mã Shopee", "SKU sản phẩm", "Tên sản phẩm", "Thương hiệu", "Danh mục", "Mới", "Bán chạy",
  "Mã phân loại", "SKU phân loại", "GTIN", "Màu", "Kích cỡ", "Giá bán", "Giá gốc", "Giảm (%)", "Tồn kho",
];
export function variantGrid(items: Item[]): Grid {
  const rows: Grid = [VARIANT_HEAD];
  for (const i of items) {
    const base: Cell[] = [i.id, i.shopeeProductId ?? "", i.sku ?? "", i.name ?? "", i.brand ?? "", i.category ?? "", flag(i.isNew), flag(i.isBestseller)];
    const vs = i.variants ?? [];
    if (vs.length === 0) { rows.push([...base, "", "", "", "", "", i.price ?? "", "", "", i.stock ?? 0]); continue; }
    for (const v of vs) {
      rows.push([...base, v.variationId, v.sku ?? "", v.gtin ?? "", v.color ?? "", v.size ?? "", v.price ?? "", v.originalPrice ?? "", pctOf(v) || "", v.stock ?? 0]);
    }
  }
  return rows;
}

export const PRODUCT_HEAD = [
  "ID", "Mã Shopee", "SKU", "Tên sản phẩm", "Thương hiệu", "Danh mục", "Mã danh mục", "Giá thấp nhất", "Giá cao nhất",
  "Giảm tối đa (%)", "Tồn kho", "Còn hàng", "Mới", "Bán chạy", "Số phân loại", "Số ảnh", "Bảng size", "Link Shopee", "Mô tả",
];
export function productGrid(items: Item[]): Grid {
  return [
    PRODUCT_HEAD,
    ...items.map((i): Cell[] => [
      i.id, i.shopeeProductId ?? "", i.sku ?? "", i.name ?? "", i.brand ?? "", i.category ?? "", i.categoryId ?? "",
      i.price ?? "", i.maxPrice ?? "", maxPct(i) || "", i.stock ?? 0, flag(i.inStock), flag(i.isNew), flag(i.isBestseller),
      (i.variants ?? []).length, (i.images ?? []).length, i.sizeChart ?? "", i.shopeeUrl ?? "", i.description ?? "",
    ]),
  ];
}

const csvCell = (c: Cell): string => {
  const s = c === null || c === undefined ? "" : String(c);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// UTF-8 with BOM so Excel shows Vietnamese correctly
export const toCSV = (grid: Grid): string => "\uFEFF" + grid.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export const toJSONExport = (items: Item[]): string =>
  JSON.stringify({ format: "shop-manager/products", version: 1, exportedAt: new Date().toISOString(), count: items.length, items }, null, 2);

const regularPrice = (v: Variant) => (Number(v.originalPrice) > (Number(v.price) || 0) ? Number(v.originalPrice) : v.price ?? "");

// Shopee layouts: same columns / header rows as the files you uploaded, so the result can be imported back here
export function shopeeSalesGrid(items: Item[]): Grid {
  const rows: Grid = SALES_HEAD.map((r) => [...r]);
  for (const i of items) {
    (i.variants ?? []).forEach((v, n) => {
      rows.push([String(i.shopeeProductId ?? i.id), i.name ?? "", v.variationId, v.name ?? "", n === 0 ? i.sku ?? "" : "", v.sku ?? "", regularPrice(v), v.gtin ?? "", v.stock ?? 0, ""]);
    });
  }
  return rows;
}
export function shopeeDiscountGrid(items: Item[]): Grid {
  const rows: Grid = [[...DISCOUNT_HEAD]];
  for (const i of items) {
    for (const v of i.variants ?? []) {
      if (!(Number(v.originalPrice) > (Number(v.price) || 0))) continue;
      rows.push([String(i.shopeeProductId ?? i.id), i.name ?? "", i.sku ?? "", v.variationId, v.name ?? "", v.sku ?? "", v.originalPrice ?? "", v.price ?? "", ""]);
    }
  }
  return rows;
}
export function shopeeBasicGrid(items: Item[]): Grid {
  const rows: Grid = BASIC_HEAD.map((r) => [...r]);
  for (const i of items) rows.push([String(i.shopeeProductId ?? i.id), i.sku ?? "", i.name ?? "", i.description ?? "", ""]);
  return rows;
}