import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { ProductGrid } from "../components/ProductCard";
import { useItems } from "../lib/items";
import { fold, isOnSale, maxPercentOff, type Item } from "../lib/types";

const PAGE = 24;     // products per "Show more" click
const PREVIEW = 8;   // products per section on the default view
const FILTER_KEYS = ["q", "brand", "cat", "sale", "stock", "new", "best", "min", "max", "sort"];
const SORTS = [
  { value: "", label: "Nổi bật" },
  { value: "newest", label: "Mới nhất" },
  { value: "discount", label: "Giảm giá nhiều nhất" },
  { value: "price-asc", label: "Giá: thấp đến cao" },
  { value: "price-desc", label: "Giá: cao đến thấp" },
  { value: "name", label: "Tên: A–Z" },
];
const priceOf = (i: Item) => Number(i.price ?? 0);
const field = "p-2.5 rounded-lg border border-border bg-surface text-sm";
const chip = (on: boolean) =>
  `px-4 py-2 rounded-full border text-sm cursor-pointer transition-colors ${on ? "bg-primary text-white border-primary" : "bg-surface border-border hover:bg-surface-hover"}`;

function countBy(items: Item[], pick: (i: Item) => string | null | undefined) {
  const m = new Map<string, number>();
  items.forEach((i) => { const k = pick(i); if (k) m.set(k, (m.get(k) ?? 0) + 1); });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
}

function Section({ title, products, seeAll, showStock = true, badge, children }: {
  title: string; products: Item[]; seeAll: string; showStock?: boolean; badge?: string; children?: ReactNode;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mb-12">
      <div className="flex items-end justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-3xl text-text font-semibold">{title}</h2>
          {badge && <span className="px-2.5 py-1 rounded-full bg-danger text-white text-xs font-semibold uppercase tracking-wide">{badge}</span>}
        </div>
        <Link to={seeAll} className="text-sm text-primary hover:underline">Xem tất cả {products.length} →</Link>
      </div>
      <ProductGrid products={products.slice(0, PREVIEW)} showStock={showStock} />
      {children}
    </section>
  );
}

export default function Shop() {
  const { items: all, loading, error } = useItems();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE);
  const get = (k: string) => params.get(k) ?? "";

  const setParam = (k: string, v: string) =>
    setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });

  // search box keeps its own state (so Vietnamese IME typing isn't interrupted) and syncs to the URL
  const [qInput, setQInput] = useState(get("q"));
  const pushedQ = useRef(get("q")); // last q this component wrote to the URL
  useEffect(() => {
    const t = setTimeout(() => {
      const v = qInput.trim();
      if (v !== get("q")) { pushedQ.current = v; setParam("q", v); }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  // q changed from outside (nav link, back button, "Clear all") -> update the box too
  useEffect(() => {
    const urlQ = get("q");
    if (urlQ !== pushedQ.current) { pushedQ.current = urlQ; setQInput(urlQ); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => setLimit(PAGE), [params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = get("q"), brand = get("brand"), cat = get("cat"), sort = get("sort"), min = get("min"), max = get("max");
  const sale = !!get("sale"), stock = !!get("stock"), isNew = !!get("new"), best = !!get("best");
  const active = FILTER_KEYS.some((k) => get(k));
  const clearAll = () => { setQInput(""); setParams({}, { replace: true }); };

  const brands = useMemo(() => countBy(all, (i) => i.brand), [all]);
  const cats = useMemo(() => countBy(all, (i) => i.category), [all]);

  const results = useMemo(() => {
    const t = fold(q.trim());
    const lo = min !== "" && !isNaN(Number(min)) ? Number(min) : null;
    const hi = max !== "" && !isNaN(Number(max)) ? Number(max) : null;
    const r = all.filter((i) => {
      if (brand && i.brand !== brand) return false;
      if (cat && i.category !== cat) return false;
      if (sale && !isOnSale(i)) return false;
      if (stock && !i.inStock) return false;
      if (isNew && !i.isNew) return false;
      if (best && !i.isBestseller) return false;
      if (lo !== null && priceOf(i) < lo) return false;
      if (hi !== null && priceOf(i) > hi) return false;
      if (t && !fold(`${i.name ?? ""} ${i.brand ?? ""} ${i.category ?? ""}`).includes(t)) return false;
      return true;
    });
    if (sort === "newest") r.sort((a, b) => b.id - a.id);
    else if (sort === "discount") r.sort((a, b) => maxPercentOff(b) - maxPercentOff(a));
    else if (sort === "price-asc") r.sort((a, b) => priceOf(a) - priceOf(b));
    else if (sort === "price-desc") r.sort((a, b) => priceOf(b) - priceOf(a));
    else if (sort === "name") r.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "vi"));
    return r;
  }, [all, q, brand, cat, sale, stock, isNew, best, min, max, sort]);

  if (loading) return <p className="p-8 text-text/60">Đang tải sản phẩm…</p>;

  const onSale = all.filter(isOnSale).sort((a, b) => maxPercentOff(b) - maxPercentOff(a));
  const moreBtn = (total: number) =>
    limit < total && (
      <div className="flex justify-center mt-8">
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="px-6 py-3 rounded-lg border border-border bg-surface hover:bg-surface-hover cursor-pointer">
          Xem thêm (còn {total - limit})
        </button>
      </div>
    );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {error && <p className="mb-6 text-sm text-danger">Không kết nối được Supabase ({error}) – đang hiển thị dữ liệu cục bộ.</p>}

      {/* filter bar */}
      <div className="bg-surface border border-border rounded-lg p-4 md:p-5 mb-10 flex flex-col gap-4">
        <input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Tìm sản phẩm, thương hiệu…" className={`${field} w-full`} />
        <div className="flex flex-wrap gap-3">
          <select value={brand} onChange={(e) => setParam("brand", e.target.value)} className={field} aria-label="Thương hiệu">
            <option value="">Tất cả thương hiệu</option>
            {brands.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
          <select value={cat} onChange={(e) => setParam("cat", e.target.value)} className={field} aria-label="Danh mục">
            <option value="">Tất cả danh mục</option>
            {cats.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
          </select>
          <select value={sort} onChange={(e) => setParam("sort", e.target.value)} className={field} aria-label="Sắp xếp theo">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.value ? `Sắp xếp: ${s.label}` : "Sắp xếp: Nổi bật"}</option>)}
          </select>
          <div className="flex items-center gap-2">
            <input type="number" min={0} step={10000} value={min} onChange={(e) => setParam("min", e.target.value)} placeholder="Giá thấp nhất" className={`${field} w-32`} aria-label="Giá tối thiểu" />
            <span className="text-text/50">–</span>
            <input type="number" min={0} step={10000} value={max} onChange={(e) => setParam("max", e.target.value)} placeholder="Giá cao nhất" className={`${field} w-32`} aria-label="Giá tối đa" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={sale} onClick={() => setParam("sale", sale ? "" : "1")} className={chip(sale)}>Đang giảm giá</button>
          <button type="button" aria-pressed={stock} onClick={() => setParam("stock", stock ? "" : "1")} className={chip(stock)}>Còn hàng</button>
          <button type="button" aria-pressed={isNew} onClick={() => setParam("new", isNew ? "" : "1")} className={chip(isNew)}>Mới</button>
          <button type="button" aria-pressed={best} onClick={() => setParam("best", best ? "" : "1")} className={chip(best)}>Bán chạy</button>
          {active && <button type="button" onClick={clearAll} className="ml-auto text-sm text-primary hover:underline cursor-pointer">✕ Xóa tất cả</button>}
        </div>
      </div>

      {active ? (
        <>
          <p className="text-sm text-text/60 mb-6">{results.length} sản phẩm</p>
          {results.length === 0 ? (
            <p className="text-text/60">Không có sản phẩm phù hợp. <button type="button" onClick={clearAll} className="text-primary hover:underline cursor-pointer">Xóa bộ lọc</button></p>
          ) : (
            <>
              <ProductGrid products={results.slice(0, limit)} />
              {moreBtn(results.length)}
            </>
          )}
        </>
      ) : (
        <>
          <Section title="Đang giảm giá" badge="Giảm giá" products={onSale} seeAll="/shop?sale=1&sort=discount" />
          <Section title="Sản phẩm mới" products={all.filter((i) => i.isNew === true)} seeAll="/shop?new=1" />
          <Section title="Bán chạy nhất" products={all.filter((i) => i.isBestseller === true)} seeAll="/shop?best=1" />
          <Section title="Còn hàng" products={all.filter((i) => i.inStock === true)} seeAll="/shop?stock=1" showStock={false} />
          <section className="mb-10">
            <h2 className="text-3xl text-text font-semibold mb-6">Tất cả sản phẩm</h2>
            <ProductGrid products={all.slice(0, limit)} />
            {moreBtn(all.length)}
          </section>
        </>
      )}
    </div>
  );
}