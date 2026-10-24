export type Color = { name?: string | null; hex?: string | null; image?: string | null };
export type Size = { label?: string | null };
export type Variant = {
  variationId: string;
  sku?: string | null;
  gtin?: string | null;
  name?: string | null;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  originalPrice?: number | null; // price before discount (price = sale price)
  stock?: number | null;
};
export type Item = {
  id: number;
  shopeeProductId?: string | null;
  sku?: string | null;
  slug?: string | null;
  brand?: string | null;
  category?: string | null;
  categoryId?: number | null;
  categoryPath?: string[];
  description?: string | null;
  sizeChart?: string | null;
  shopeeUrl?: string | null;
  name?: string | null;
  price?: number | string | null;
  maxPrice?: number | string | null;
  inStock?: boolean;
  stock?: number | null;
  isNew?: boolean;
  isBestseller?: boolean;
  onDiscount?: boolean;
  displayTags?: string[];
  images?: string[];
  colors?: Color[];
  sizes?: Size[];
  variants?: Variant[];
};

export const totalStock = (i: Item): number =>
  typeof i.stock === "number"
    ? i.stock
    : (i.variants ?? []).reduce((s, v) => s + (v.stock ?? 0), 0);

export const vnd = (n: number | string | null | undefined) =>
  `${Number(n ?? 0).toLocaleString("vi-VN")}\u00a0₫`;

// percent off, rounded; 0 when there is no real discount
export const percentOff = (orig?: number | null, price?: number | null) =>
  orig && price != null && orig > price ? Math.round((1 - price / orig) * 100) : 0;

// the "was" price of the cheapest variant, for a strikethrough on listing cards
export const listOriginalPrice = (i: Item): number | null => {
  const vs = (i.variants ?? []).filter((v) => v.price != null);
  if (vs.length === 0) return null;
  const cheapest = vs.reduce((a, b) => ((b.price as number) < (a.price as number) ? b : a));
  return cheapest.originalPrice && cheapest.originalPrice > (cheapest.price as number) ? cheapest.originalPrice : null;
};

// lowercase + strip Vietnamese accents, so "bo quan ao" finds "Bộ quần áo"
export const fold = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();

// biggest percent-off among a product's variants (0 = not on sale)
export const maxPercentOff = (i: Item): number =>
  (i.variants ?? []).reduce((m, v) => Math.max(m, percentOff(v.originalPrice, v.price)), 0);
export const isOnSale = (i: Item) => maxPercentOff(i) > 0;