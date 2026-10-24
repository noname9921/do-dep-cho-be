import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useCart } from "../lib/cart";
import { useItems } from "../lib/items";
import { percentOff, totalStock, vnd, type Color, type Size } from "../lib/types";
import { isValidHex } from "../components/ProductCard";
import NotFound from "./NotFound";

const MAX_COLORS = 6;
const perks = [
  { icon: "♥", title: "Bảo hiểm mẹ & bé", desc: "Bảo hiểm cho mẹ và bé khi mua các sản phẩm đủ điều kiện." },
];
const mockShades = ["bg-gray-200", "bg-gray-300", "bg-gray-400", "bg-gray-300"];

type Slide = { src?: string; alt: string };

function SlideImage({ src, alt, index, label, eager = false }: { src?: string; alt: string; index: number; label?: boolean; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className={`w-full h-full grid place-items-center text-text/40 text-lg ${mockShades[index % mockShades.length]}`}>
        {label ? `Ảnh ${index + 1}` : null}
      </div>
    );
  }
  return (
    <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="w-full h-full object-cover" />
  );
}

function Carousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const prev = () => setIndex((i) => (i - 1 + count) % count);
  const next = () => setIndex((i) => (i + 1) % count);
  const arrow = "absolute top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full bg-surface/90 border border-border shadow-md text-xl cursor-pointer hover:bg-surface transition-colors";

  return (
    <div
      role="group" aria-roledescription="carousel" aria-label="Ảnh sản phẩm" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "ArrowLeft") prev(); if (e.key === "ArrowRight") next(); }}
      className="outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
    >
      <div className="relative aspect-square overflow-hidden rounded-lg border border-border">
        <div className="flex h-full transition-transform duration-300 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((s, i) => (
            <div key={i} className="w-full h-full shrink-0" aria-hidden={i !== index}>
              <SlideImage src={s.src} alt={s.alt} index={i} label eager={i === 0} />
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <button type="button" onClick={prev} aria-label="Ảnh trước" className={`${arrow} left-3`}>‹</button>
            <button type="button" onClick={next} aria-label="Ảnh tiếp theo" className={`${arrow} right-3`}>›</button>
            <span aria-live="polite" className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-text/70 text-surface text-xs">{index + 1} / {count}</span>
          </>
        )}
      </div>
      {count > 1 && (
        <div className="flex gap-3 mt-4 overflow-x-auto pb-1">
          {slides.map((s, i) => (
            <button type="button" key={i} onClick={() => setIndex(i)} aria-label={`Xem ảnh ${i + 1}`} aria-current={i === index}
              className={`size-16 shrink-0 overflow-hidden rounded-md border cursor-pointer transition-opacity ${i === index ? "border-primary ring-1 ring-primary" : "border-border opacity-70 hover:opacity-100"}`}>
              <SlideImage src={s.src} alt="" index={i} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// keyed by id so color/size/qty never carry over from one product to the next
export default function Product() {
  const { itemId } = useParams();
  return <ProductView key={itemId} />;
}

function ProductView() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const { items, loading } = useItems();
  const [colorName, setColorName] = useState<string | null>(null);
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);
  const [showAllColors, setShowAllColors] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const id = Number(itemId);
  const item = items.find((i) => i.id === id);

  if (loading && !item) return <p className="p-8 text-text/60">Đang tải…</p>;
  if (!item) return <NotFound message="Sản phẩm này không tồn tại (hoặc đã bị xóa)." />;

  const name = item.name || "Sản phẩm chưa có tên";
  const hasPrice = item.price !== undefined && item.price !== null && item.price !== "";
  const tags = Array.isArray(item.displayTags) ? item.displayTags : [];
  const colors = (Array.isArray(item.colors) ? item.colors : []).filter(
    (c): c is Color & { name: string } => !!c && typeof c.name === "string" && c.name !== ""
  );
  const sizes = (Array.isArray(item.sizes) ? item.sizes : []).filter(
    (s): s is Size & { label: string } => !!s && typeof s.label === "string" && s.label !== ""
  );
  const images = (Array.isArray(item.images) ? item.images : []).filter((u): u is string => typeof u === "string" && u !== "");
  const variants = Array.isArray(item.variants) ? item.variants : [];

  const color = colors.find((c) => c.name === colorName) ?? (colors.length === 1 ? colors[0] : undefined);
  const size = sizes.find((s) => s.label === sizeLabel) ?? (sizes.length === 1 ? sizes[0] : undefined);
  const selectionComplete = (colors.length === 0 || !!color) && (sizes.length === 0 || !!size);

  const variant = selectionComplete
    ? variants.find((v) => (v.color ?? null) === (color?.name ?? null) && (v.size ?? null) === (size?.label ?? null))
    : undefined;

  const stockLeft = variant ? variant.stock ?? 0 : totalStock(item);
  const unitPrice = Number(variant?.price ?? item.price ?? 0);
  const q = Math.max(1, Math.min(qty, Math.max(stockLeft, 1)));
  const outOfStock = item.inStock === false || totalStock(item) <= 0;
  const canShop = !outOfStock && selectionComplete && !!variant && stockLeft > 0;

  const visibleColors = showAllColors ? colors : colors.filter((c, idx) => idx < MAX_COLORS || c.name === colorName);
  const hiddenCount = colors.length - visibleColors.length;

  const slides: Slide[] = images.length > 0
    ? images.map((src, n) => ({ src, alt: `${name} – ảnh ${n + 1}` }))
    : [1, 2, 3, 4].map((n) => ({ alt: `${name} – ảnh ${n}` }));

  function addToCart() {
    if (!canShop || !variant) return false;
    cart.add({
      productId: item!.id, variationId: variant.variationId, name, image: images[0],
      color: variant.color, size: variant.size, price: unitPrice, qty: q, max: stockLeft,
    });
    return true;
  }

  const optCls = (on: boolean) =>
    `inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border cursor-pointer transition-colors ${on ? "border-primary bg-surface-muted ring-1 ring-primary font-medium" : "border-border bg-surface hover:bg-surface-hover"
    }`;
  const groupHead = "flex items-baseline justify-between mb-3";
  const lowStock = !outOfStock && stockLeft > 0 && stockLeft <= 5;
  const unavailable = outOfStock || (selectionComplete && !!variant && stockLeft <= 0);

  const minP = Number(item.price ?? 0);
  const maxP = Number(item.maxPrice ?? item.price ?? 0);
  const showRange = !variant && maxP > minP;
  const wasPrice = variant?.originalPrice && variant.originalPrice > unitPrice ? variant.originalPrice : null;
  const off = percentOff(wasPrice, unitPrice);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <Link to="/shop" className="inline-block mb-6 text-sm text-text/60 hover:text-text hover:underline">← Quay lại cửa hàng</Link>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-14 items-start">
        {/* gallery */}
        <div className="min-w-0 md:sticky md:top-24">
          <Carousel key={item.id} slides={slides} />
        </div>

        {/* details */}
        <div className="min-w-0 flex flex-col gap-8">
          {/* title block */}
          <div className="flex flex-col gap-3">
            {(item.isBestseller || item.isNew) && (
              <div className="flex gap-2">
                {item.isBestseller && <span className="px-3 py-1 rounded-full bg-accent text-text text-xs font-semibold">★ Bán chạy</span>}
                {item.isNew && <span className="px-3 py-1 rounded-full bg-primary text-white text-xs font-semibold">Mới</span>}
              </div>
            )}
            {(item.brand || item.category) && (
              <p className="text-sm text-text/60">{[item.brand, item.category].filter(Boolean).join(" · ")}</p>
            )}
            <h1 className="font-bold text-3xl md:text-4xl leading-tight">{name}</h1>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {tags.map((t) => <span key={t} className="px-2.5 py-1 text-xs rounded-full border border-border text-text/70">{t}</span>)}
              </div>
            )}
          </div>

          {/* price + status */}
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-y border-border py-5">
            {hasPrice ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-3xl font-bold">
                  {showRange ? `${vnd(minP)} – ${vnd(maxP)}` : vnd(unitPrice)}
                </p>
                {wasPrice && <span className="text-lg text-text/50 line-through">{vnd(wasPrice)}</span>}
                {off > 0 && <span className="px-2.5 py-1 rounded-full bg-danger text-white text-xs font-semibold">-{off}%</span>}
                {showRange && item.onDiscount && <span className="px-2.5 py-1 rounded-full bg-danger text-white text-xs font-semibold">Giảm giá</span>}
              </div>
            ) : <span />}
            <p className="flex items-center gap-2 text-sm font-medium">
              <span className={`size-2.5 rounded-full ${unavailable ? "bg-danger" : lowStock ? "bg-accent" : "bg-success"}`} />
              {unavailable ? "Hết hàng" : lowStock ? `Chỉ còn ${stockLeft} sản phẩm` : `Còn hàng (${stockLeft} sản phẩm)`}
            </p>
          </div>

          {/* options */}
          {colors.length > 0 && (
            <div>
              <div className={groupHead}>
                <h2 className="font-semibold">Màu sắc</h2>
                <span className="text-sm text-text/60">{color?.name ?? "Chọn màu"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {visibleColors.map((c) => (
                  <button type="button" key={c.name} aria-pressed={color?.name === c.name}
                    onClick={() => { setColorName(c.name); setQty(1); }} className={optCls(color?.name === c.name)}>
                    {isValidHex(c.hex) && <span className="size-5 shrink-0 rounded-full border border-border" style={{ background: c.hex.trim() }} />}
                    <span className="whitespace-nowrap">{c.name}</span>
                  </button>
                ))}
                {(hiddenCount > 0 || (showAllColors && colors.length > MAX_COLORS)) && (
                  <button type="button" onClick={() => setShowAllColors((v) => !v)} aria-expanded={showAllColors}
                    className="px-4 py-2.5 rounded-lg text-sm text-text/70 border border-dashed border-border cursor-pointer hover:bg-surface-hover transition-colors">
                    {showAllColors ? "Thu gọn" : `+${hiddenCount} màu khác`}
                  </button>
                )}
              </div>
            </div>
          )}

          {sizes.length > 0 && (
            <div>
              <div className={groupHead}>
                <h2 className="font-semibold">Kích cỡ</h2>
                {item.sizeChart
                  ? <a href={item.sizeChart} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">Bảng kích cỡ →</a>
                  : <span className="text-sm text-text/60">{size?.label ?? "Chọn kích cỡ"}</span>}
              </div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button type="button" key={s.label} aria-pressed={size?.label === s.label}
                    onClick={() => { setSizeLabel(s.label); setQty(1); }} className={`${optCls(size?.label === s.label)} min-w-14 justify-center`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="font-semibold mb-3">Số lượng</h2>
            <div className="inline-flex items-center border border-border rounded-lg bg-surface">
              <button type="button" aria-label="Giảm" disabled={q <= 1} onClick={() => setQty(q - 1)} className="size-11 text-lg cursor-pointer disabled:opacity-40">−</button>
              <span className="w-12 text-center font-medium">{q}</span>
              <button type="button" aria-label="Tăng" disabled={q >= stockLeft} onClick={() => setQty(q + 1)} className="size-11 text-lg cursor-pointer disabled:opacity-40">+</button>
            </div>
          </div>

          {/* actions */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" disabled={!canShop} onClick={() => { if (addToCart()) { setAdded(true); setTimeout(() => setAdded(false), 1500); } }}
                className="flex-1 py-3.5 rounded-lg border border-primary text-primary font-semibold cursor-pointer hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed">
                {added ? "Đã thêm ✓" : "Thêm vào giỏ hàng"}
              </button>
              <button type="button" disabled={!canShop} onClick={() => { if (addToCart()) navigate("/checkout"); }}
                className="flex-1 py-3.5 rounded-lg bg-primary text-white font-semibold cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed">
                {outOfStock ? "Hết hàng" : "Mua ngay"}
              </button>
            </div>
            {!selectionComplete && !outOfStock && (
              <p className="text-sm text-text/60">Vui lòng chọn {[colors.length > 0 && !color && "màu", sizes.length > 0 && !size && "kích cỡ"].filter(Boolean).join(" và ")} để tiếp tục.</p>
            )}
          </div>

          {/* description */}
          {item.description && (
            <section className="border-t border-border pt-8 flex flex-col gap-3">
              <h2 className="font-semibold text-lg">Chi tiết sản phẩm</h2>
              <p className="text-sm leading-relaxed text-text/80 whitespace-pre-line">{item.description}</p>
            </section>
          )}

          {/* perks */}
          <ul className="flex flex-col gap-4 border-t border-border pt-8">
            {perks.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <span className="size-10 shrink-0 grid place-items-center rounded-full bg-surface-muted text-text">{p.icon}</span>
                <div><p className="font-semibold">{p.title}</p><p className="text-sm text-text/60">{p.desc}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}