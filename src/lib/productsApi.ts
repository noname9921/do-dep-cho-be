import { invalidateItems, itemToRow, rowToItem } from "./items";
import { supabase } from "./supabase";
import type { Item } from "./types";

// Reading and writing many products at once (used by import, export and bulk updates).
export type Progress = (done: number, total: number) => void;

const READ_CHUNK = 100;
const WRITE_CHUNK = 50;
const need = () => {
  if (!supabase) throw new Error("Chưa kết nối Supabase.");
  return supabase;
};

// ids = null -> every product
export async function fetchItems(ids: number[] | null, onProgress?: Progress): Promise<Item[]> {
  const db = need();
  const out: Item[] = [];
  if (ids === null) {
    for (let from = 0; ; from += 500) {
      const { data, error } = await db.from("products").select("*").order("id").range(from, from + 499);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []).map(rowToItem));
      onProgress?.(out.length, 0);
      if (!data || data.length < 500) break;
    }
    return out;
  }
  for (let i = 0; i < ids.length; i += READ_CHUNK) {
    const { data, error } = await db.from("products").select("*").in("id", ids.slice(i, i + READ_CHUNK)).order("id");
    if (error) throw new Error(error.message);
    out.push(...(data ?? []).map(rowToItem));
    onProgress?.(Math.min(i + READ_CHUNK, ids.length), ids.length);
  }
  return out;
}

// insert-or-update by id
export async function saveItems(items: Item[], onProgress?: Progress) {
  const db = need();
  for (let i = 0; i < items.length; i += WRITE_CHUNK) {
    const { error } = await db.from("products").upsert(items.slice(i, i + WRITE_CHUNK).map(itemToRow), { onConflict: "id" });
    if (error) throw new Error(`${error.message} (đã lưu ${i}/${items.length} sản phẩm)`);
    onProgress?.(Math.min(i + WRITE_CHUNK, items.length), items.length);
  }
  invalidateItems();
}

// set the same column(s) on many products
export async function patchColumns(ids: number[], patch: Record<string, unknown>, onProgress?: Progress) {
  const db = need();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("products").update(patch).in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`${error.message} (đã cập nhật ${i}/${ids.length})`);
    onProgress?.(Math.min(i + 200, ids.length), ids.length);
  }
  invalidateItems();
}

export async function deleteItems(ids: number[], onProgress?: Progress) {
  const db = need();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from("products").delete().in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`${error.message} (đã xóa ${i}/${ids.length})`);
    onProgress?.(Math.min(i + 200, ids.length), ids.length);
  }
  invalidateItems();
}