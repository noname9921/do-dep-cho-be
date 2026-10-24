import { useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { ProductCard, ProductGrid } from "../components/ProductCard";
import { useItems } from "../lib/items";
import { isOnSale, maxPercentOff, totalStock, type Item } from "../lib/types";
import { SHOP_NAME } from "../lib/config";

// ---- MOCK CONTENT: replace later ----
const perks = [
  { icon: "♥", title: "Bảo hiểm mẹ & bé", desc: "Áp dụng cho các sản phẩm đủ điều kiện." },
  { icon: "🚚", title: "Thanh toán khi nhận hàng", desc: "Hoặc chuyển khoản qua mã QR – tùy bạn chọn." },
];
const reviews = [
  { name: "huongtran30", rating: 5, text: "Áo đẹp vừa vặn" },
  {
    name: "vananhthephong", rating: 5, text: "Hãng lapome thì quá yên tâm rồi, vải mịn co giãn tốt. Mọi người nên mua nha"
  },
  { name: "lananh.bctt", rating: 5, text: "Màu sắc đẹp, chất liệu mềm phù hợp mặc trời lạnh, săn sale được giá rẻ" },
  { name: "phuggthao.7193", rating: 5, text: "Giao hàng nhanh. Đóng gói cẩn thận. Hàng chính hãng đẹp lắm nha. Sẽ mua lại" },
  {
    name: "vananhhhhhhhh25", rating: 5, text: "Chất mát mẻ, bộ xinh nên mua nhé. Shop giao hàng nhanh, đóng gói cẩn thận loại cán vỡ này dễ ăn nấu cháo các loại dễ ăn, để nấu ăn sáng tiện  nhanh mà đủ chất"
  },
  { name: "uv8o3oed7b", rating: 5, text: "Chất liệu sợi tre mềm, mát, thấm hút mồ hôi tốt. Bé được tặng 4 bộ mặc ngắn rồi giờ mình đặt thêm cho bé với lại đã mua đồ của shop 1 lần thấy chất lượng tốt nên quay lại mua" },
];

const MAX_FEATURED = 900;
const LIMITED_AT = 5; // "limited" = 1..5 units left
const MAX_LIMITED = 4;
const MAX_BRANDS = 24;

const Stars = ({ n }: { n: number }) => (
  <p className="text-accent text-lg" role="img" aria-label={`${n} trên 5 sao`}>
    {"★".repeat(n)}
    <span className="text-border">{"★".repeat(5 - n)}</span>
  </p>
);

// horizontal scroll-snap carousel with prev/next buttons
function ProductCarousel({ products, label = "Sản phẩm nổi bật" }: { products: Item[]; label?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) =>
    track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.8, behavior: "smooth" });

  const arrow =
    "absolute top-1/2 -translate-y-1/2 z-10 size-10 hidden sm:grid place-items-center rounded-full bg-surface/95 border border-border shadow-md text-xl cursor-pointer hover:bg-surface transition-colors";

  return (
    <div role="group" aria-roledescription="carousel" aria-label={label} className="relative">
      <button type="button" aria-label="Sản phẩm trước" onClick={() => scroll(-1)} className={`${arrow} -left-4`}>‹</button>
      <button type="button" aria-label="Sản phẩm tiếp theo" onClick={() => scroll(1)} className={`${arrow} -right-4`}>›</button>

      <div
        ref={track}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") scroll(-1);
          if (e.key === "ArrowRight") scroll(1);
        }}
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth px-1 pt-2 pb-8 outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p) => (
          <div key={p.id} className="snap-start shrink-0 w-64 sm:w-72">
            <ProductCard item={p} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, badge, children }: { title: string; badge?: string; children?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-semibold">{title}</h2>
        {badge && <span className="px-2.5 py-1 rounded-full bg-danger text-white text-xs font-semibold uppercase tracking-wide">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

export default function Home() {
  const { items, loading } = useItems();

  // flagged items first; until you set flags, fall back to in-stock products
  const flagged = items.filter((i) => i.isBestseller || i.isNew);
  const featured = (flagged.length > 0 ? flagged : items.filter((i) => i.inStock)).slice(0, MAX_FEATURED);

  const saleAll = items.filter(isOnSale);
  const onSale = saleAll.filter((i) => i.inStock !== false).sort((a, b) => maxPercentOff(b) - maxPercentOff(a)).slice(0, MAX_FEATURED);

  const limited = items
    .map((i) => ({ i, left: totalStock(i) }))
    .filter((x) => x.left > 0 && x.left <= LIMITED_AT)
    .sort((a, b) => a.left - b.left)
    .slice(0, MAX_LIMITED)
    .map((x) => x.i);

  // brands found in the catalogue, biggest first
  const brandCounts = new Map<string, number>();
  items.forEach((i) => i.brand && brandCounts.set(i.brand, (brandCounts.get(i.brand) ?? 0) + 1));
  const brands = [...brandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_BRANDS);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-14">
      {/* hero */}
      <section className="grid md:grid-cols-2 gap-8 items-center bg-surface border border-border rounded-lg p-8">
        <div className="flex flex-col gap-4">
          <h1 className="font-bold text-4xl md:text-5xl">Chào mừng đến {SHOP_NAME}</h1>
          <p className="text-text/70">Chúng tôi bán quần áo dành cho trẻ em với đánh giá 5 sao trên Shopee</p>
          <div className="flex gap-3">
            <Link to="/shop" className="px-5 py-3 rounded-md bg-primary text-white font-semibold hover:opacity-90">Mua sắm ngay</Link>
            <Link to="/contact" className="px-5 py-3 rounded-md border border-border hover:bg-surface-hover">Liên hệ</Link>
          </div>
        </div>
      </section>

      {/* on sale */}
      {!loading && onSale.length > 0 && (
        <section>
          <SectionHeader title="Đang giảm giá" badge="Giảm giá">
            <Link to="/shop?sale=1&sort=discount" className="text-sm text-primary hover:underline">Xem tất cả {saleAll.length} →</Link>
          </SectionHeader>
          <ProductCarousel products={onSale} label="Sản phẩm đang giảm giá" />
        </section>
      )}

      {/* featured carousel */}
      <section>
        <SectionHeader title="Nổi bật">
          <Link to="/shop" className="text-sm text-primary hover:underline">Xem tất cả →</Link>
        </SectionHeader>
        {loading ? <p className="text-text/60">Đang tải…</p> : <ProductCarousel products={featured} />}
      </section>

      {/* limited stock */}
      {!loading && limited.length > 0 && (
        <section>
          <SectionHeader title="Sắp hết hàng" badge="Số lượng có hạn">
            <Link to="/shop" className="text-sm text-primary hover:underline">Xem tất cả →</Link>
          </SectionHeader>
          <ProductGrid products={limited} />
        </section>
      )}

      {/* brands */}
      {!loading && brands.length > 0 && (
        <section>
          <SectionHeader title="Mua theo thương hiệu" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {brands.map(([name, count]) => (
              <Link
                key={name}
                to={`/shop?brand=${encodeURIComponent(name)}`}
                className="flex items-center gap-3 bg-surface border border-border rounded-lg p-4 hover:shadow-lg transition-shadow"
              >
                <span className="size-10 shrink-0 grid place-items-center rounded-full bg-surface-muted font-semibold">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold truncate">{name}</span>
                  <span className="block text-xs text-text/60">{count} sản phẩm</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* perks */}
      <section className="grid md:grid-cols-2 gap-6">
        {perks.map((p) => (
          <div key={p.title} className="flex items-start gap-3 bg-surface border border-border rounded-lg p-5">
            <span className="size-9 shrink-0 grid place-items-center rounded-full bg-surface-muted">{p.icon}</span>
            <div>
              <p className="font-semibold">{p.title}</p>
              <p className="text-sm text-text/60">{p.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ratings */}
      <section>
        <h2 className="text-3xl font-semibold mb-6">Khách hàng nói gì</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((r, i) => (
            <figure key={i} className="bg-surface border border-border rounded-lg p-5">
              <Stars n={r.rating} />
              <blockquote className="mt-2 text-text/80">“{r.text}”</blockquote>
              <figcaption className="mt-3 text-sm font-semibold">{r.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}