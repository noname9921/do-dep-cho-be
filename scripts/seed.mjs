// npm i -D @supabase/supabase-js (already a dep) ; then:
// node --env-file=.env scripts/seed.mjs src/items.json
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2] ?? "src/items.json";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const items = JSON.parse(fs.readFileSync(file, "utf8"));

const rows = items.map((i) => {
  const stock = (i.variants ?? []).reduce((s, v) => s + (Number(v.stock) || 0), 0);
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
    in_stock: stock > 0,
    stock,
    display_tags: i.displayTags ?? [],
    images: i.images ?? [],
    sizes: i.sizes ?? [],
    colors: i.colors ?? [],
    variants: i.variants ?? [],
  };
});

// Small batches + retries: survives flaky connections (ECONNRESET, timeouts)
const BATCH = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let done = 0;

for (let n = 0; n < rows.length; n += BATCH) {
  const chunk = rows.slice(n, n + BATCH);
  let ok = false;
  for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
    const { error } = await sb.from("products").upsert(chunk);
    if (!error) { ok = true; break; }
    console.warn(`batch at row ${n} failed (try ${attempt}/5): ${error.message}`);
    // schema problems won't fix themselves on retry
    if (/column|relation|schema cache|violates|JWT|Invalid API key/i.test(error.message)) {
      console.error(error); process.exit(1);
    }
    await sleep(1500 * attempt);
  }
  if (!ok) { console.error(`Giving up at row ${n}. Re-run the script; finished batches are kept.`); process.exit(1); }
  done += chunk.length;
  process.stdout.write(`\rUploaded ${done}/${rows.length}`);
}
console.log(`\nUpserted ${rows.length} products`);
