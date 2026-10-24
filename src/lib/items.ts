import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Item } from "./types";

// local copy of the catalogue; loaded lazily (own chunk) only when Supabase is missing/unreachable
const loadFallback = async (): Promise<Item[]> => {
  const mod = await import("../items.json");
  const raw = (mod as { default: unknown }).default;
  return (Array.isArray(raw) ? raw : []) as unknown as Item[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rowToItem(r: any): Item {
  return {
    id: r.id,
    shopeeProductId: r.shopee_product_id,
    name: r.name,
    price: r.price,
    maxPrice: r.max_price,
    isBestseller: r.is_bestseller,
    onDiscount: r.on_discount,
    isNew: r.is_new,
    inStock: r.in_stock,
    stock: r.stock,
    sku: r.sku,
    slug: r.slug,
    brand: r.brand,
    category: r.category,
    categoryId: r.category_id,
    categoryPath: r.category_path ?? [],
    description: r.description,
    sizeChart: r.size_chart,
    shopeeUrl: r.shopee_url,
    displayTags: r.display_tags ?? [],
    images: r.images ?? [],
    sizes: r.sizes ?? [],
    colors: r.colors ?? [],
    variants: r.variants ?? [],
  };
}

let cache: Item[] | null = null;

export function useItems() {
  const [items, setItems] = useState<Item[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (!supabase) {
        cache = await loadFallback();
        setItems(cache);
        return;
      }
      const { data, error } = await supabase.from("products").select("*").order("id");
      if (error) {
        setError(error.message);
        cache = await loadFallback(); // keep the site usable
        setItems(cache);
      } else {
        cache = (data ?? []).map(rowToItem);
        setItems(cache);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được sản phẩm.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cache) reload();
  }, [reload]);

  return { items, loading, error, reload };
}

// call after checkout so stock numbers refresh
export const invalidateItems = () => { cache = null; };

// Item -> products table row (used by the admin page)
export function itemToRow(i: Item) {
  return {
    id: i.id,
    shopee_product_id: i.shopeeProductId ?? null,
    sku: i.sku ?? null,
    slug: i.slug ?? null,
    brand: i.brand ?? null,
    category: i.category ?? null,
    category_id: i.categoryId ?? null,
    category_path: i.categoryPath ?? [],
    description: i.description ?? null,
    size_chart: i.sizeChart ?? null,
    shopee_url: i.shopeeUrl ?? null,
    name: i.name ?? null,
    price: i.price ?? null,
    max_price: i.maxPrice ?? null,
    is_bestseller: !!i.isBestseller,
    on_discount: !!i.onDiscount,
    is_new: !!i.isNew,
    in_stock: !!i.inStock,
    stock: i.stock ?? 0,
    display_tags: i.displayTags ?? [],
    images: i.images ?? [],
    sizes: i.sizes ?? [],
    colors: i.colors ?? [],
    variants: i.variants ?? [],
  };
}
