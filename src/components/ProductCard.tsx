import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { listOriginalPrice, percentOff, totalStock, vnd, type Color, type Item } from "../lib/types";

const MAX_SWATCHES = 5;
const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
export const isValidHex = (hex: unknown): hex is string =>
  typeof hex === "string" && HEX_RE.test(hex.trim());
const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "";
const hasName = (n: unknown): n is string => typeof n === "string" && n.trim() !== "";

function Tooltip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-0.5 rounded bg-text text-surface text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
      {children}
    </span>
  );
}

export function ProductImage({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className="w-full aspect-square bg-gray-300 rounded-sm" />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full aspect-square object-cover rounded-sm bg-gray-300"
    />
  );
}

function Swatch({ name, hex }: { name?: string | null; hex: string }) {
  return (
    <div className="relative group shrink-0">
      <span className="block size-5 rounded-full border border-border" style={{ background: hex.trim() }} />
      {hasName(name) && <Tooltip>{name}</Tooltip>}
    </div>
  );
}

function NameChip({ name }: { name: string }) {
  return (
    <span className="shrink-0 max-w-full truncate h-5 px-2 inline-flex items-center rounded-full border border-border text-xs text-text">
      {name}
    </span>
  );
}

function OverflowBadge({ count, names }: { count: number; names: string }) {
  return (
    <div className="relative group shrink-0">
      <span className="flex size-5 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-text">
        +{count}
      </span>
      {names && <Tooltip>{names}</Tooltip>}
    </div>
  );
}

function ColorSwatches({ colors }: { colors?: Color[] }) {
  if (!Array.isArray(colors)) return null;
  const displayable = colors.filter((c): c is Color => !!c && (isValidHex(c.hex) || hasName(c.name)));
  if (displayable.length === 0) return null;
  const visible = displayable.slice(0, MAX_SWATCHES);
  const hidden = displayable.slice(MAX_SWATCHES);
  return (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {visible.map((c, idx) =>
        isValidHex(c.hex) ? (
          <Swatch key={`${c.name ?? ""}-${idx}`} name={c.name} hex={c.hex} />
        ) : (
          <NameChip key={`${c.name ?? ""}-${idx}`} name={c.name as string} />
        )
      )}
      {hidden.length > 0 && (
        <OverflowBadge count={hidden.length} names={hidden.map((c) => c.name).filter(hasName).join(", ")} />
      )}
    </div>
  );
}

export function ProductCard({ item, showStock = true }: { item: Item; showStock?: boolean }) {
  const tags = Array.isArray(item.displayTags) ? item.displayTags : [];
  const hasStockInfo = typeof item.inStock === "boolean";
  const left = totalStock(item);
  const orig = listOriginalPrice(item);
  const off = percentOff(orig, Number(item.price));

  return (
    <Link to={`/shop/${item.id}`}>
      <div className="h-fit bg-surface p-6 transition-all duration-300 rounded-md shadow-xl hover:shadow-2xl">
        <ProductImage src={Array.isArray(item.images) ? item.images[0] : undefined} alt={item.name || "Ảnh sản phẩm"} />
        <h2 className="font-semibold text-xl mt-4 truncate">{item.name || "Sản phẩm chưa có tên"}</h2>
        {showStock && hasStockInfo && (
          <p className={`font-semibold text-lg truncate ${item.inStock ? "text-success" : "text-danger"}`}>
            {item.inStock ? (left > 0 && left <= 5 ? `Chỉ còn ${left}` : "Còn hàng") : "Hết hàng"}
          </p>
        )}
        <ColorSwatches colors={item.colors} />
        <div className="m-4" />
        {tags.map((t) => (
          <span key={t} className="m-2 p-2 px-3 ml-0 py-1.5 bg-background rounded-xs">{t}</span>
        ))}
        {hasValue(item.price) && (
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-xl">{vnd(item.price)}</span>
            {orig && <span className="text-sm text-text/50 line-through">{vnd(orig)}</span>}
            {off > 0 && <span className="px-2 py-0.5 rounded-full bg-danger text-white text-xs font-semibold">-{off}%</span>}
          </p>
        )}
      </div>
    </Link>
  );
}

export function ProductGrid({ products, showStock = true }: { products: Item[]; showStock?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 w-full gap-8">
      {products.map((i) => (
        <ProductCard key={i.id} item={i} showStock={showStock} />
      ))}
    </div>
  );
}