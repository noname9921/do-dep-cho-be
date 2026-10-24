// node scripts/add-stock.mjs src/items.json
// Adds a top-level "stock" (sum of variants[].stock) to every item and sets inStock accordingly.
import fs from "node:fs";
const file = process.argv[2] ?? "src/items.json";
const items = JSON.parse(fs.readFileSync(file, "utf8"));
for (const it of items) {
  it.stock = (it.variants ?? []).reduce((s, v) => s + (Number(v.stock) || 0), 0);
  it.inStock = it.stock > 0;
}
fs.writeFileSync(file, JSON.stringify(items, null, 2));
console.log(`Updated ${items.length} items in ${file}`);
