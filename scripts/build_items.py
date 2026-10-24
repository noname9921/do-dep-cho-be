#!/usr/bin/env python3
"""
Build src/items.json from Shopee "mass update" Excel exports.

    python scripts/build_items.py <folder-with-xlsx-files> [out.json]

The folder should contain (any file names, detected by their columns):
  * 1+ "sales_info" exports      -> variants, prices, stock
  * 1  "media_info"  export      -> images, category, color options, size chart
  * 1  "basic_info"  export      -> descriptions
Needs: pandas, openpyxl.
"""
import collections
import glob
import io
import json
import os
import re
import sys
import unicodedata
import zipfile

import pandas as pd

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "src/items.json"

# Brands recognised in product names (extend freely). First match wins.
BRANDS = [
    ("La Pomme", r"\b(la\s+)?pomme\b"), ("Rogo", r"\brogo\b"), ("Chaang", r"\bchaang\b"),
    ("Coon", r"\bcoon\b"), ("Nous", r"\bnous\b"), ("Medela", r"\bmedela\b"),
    ("Philips Avent", r"\bavent\b"), ("Babymoov", r"\bbabymoov\b"), ("HRNEE", r"\bhrnee\b"),
    ("Bambus", r"\bbambus\b"), ("Bons", r"\bbons\b"), ("Nu Doux", r"\bnu\s+doux\b"),
    ("Pigeon", r"\bpigeon\b"), ("Spectra", r"\bspectra\b"), ("Lotus", r"\blotus\b"),
]


# ---------------------------------------------------------------- reading
def read_sheet(path):
    """Shopee exports carry an invalid <pane activePane> that openpyxl rejects; strip it."""
    buf = io.BytesIO()
    with zipfile.ZipFile(path) as zin, zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zout:
        for it in zin.infolist():
            data = zin.read(it.filename)
            if it.filename.startswith("xl/worksheets/sheet"):
                data = re.sub(rb'\sactivePane="[^"]*"', b"", data)
                data = re.sub(rb"<pane[^>]*/>", b"", data)
            zout.writestr(it, data)
    buf.seek(0)
    return pd.read_excel(buf, dtype=str)


is_id = lambda s: isinstance(s, str) and s.strip().isdigit()


def real_rows(df):
    """Drop the 5 header/instruction rows Shopee puts above the data."""
    return df[df["et_title_product_id"].map(is_id)].copy()


sales_parts, media, basic, shop_id = [], None, None, None
for f in sorted(glob.glob(os.path.join(SRC, "*.xlsx"))):
    df = read_sheet(f)
    cols = set(df.columns)
    if "et_title_variation_stock" in cols:
        sales_parts.append(real_rows(df))
    elif "ps_item_cover_image" in cols:
        media = real_rows(df)
        shop_id = str(df.iloc[0, 3]).strip()  # header row: ... | 0 | <shop id> | ...
    elif "et_title_product_description" in cols:
        basic = real_rows(df)
    else:
        print("skipping unknown file:", f)

assert sales_parts and media is not None, "need sales_info and media_info exports"
sales = pd.concat(sales_parts, ignore_index=True)
media = media.reset_index(drop=True)
desc_by_id = {}
if basic is not None:
    desc_by_id = dict(zip(basic.et_title_product_id, basic.et_title_product_description))


# ---------------------------------------------------------------- helpers
def norm(s):
    return re.sub(r"\s+", " ", str(s)).strip()


def key(s):
    return norm(s).lower()


SIZE_RE = re.compile(
    r"^(newborn|nb\b|sơ sinh|free ?size|size\b"
    r"|(\d+([.,]\d+)?\s*[-–~]\s*)?\d+([.,]\d+)?\s*(m|y|t|tháng|tuổi|kg|cm|ml)\b"
    r"|\d+\s*[-–]\s*\d+"
    r"|(xs|s|m|l|xl|xxl|xxxl)(\s*[\(\[].*)?$"
    r"|\d{1,3}$)"
)
looks_size = lambda s: bool(SIZE_RE.match(key(s)))
size_group = lambda g: bool(re.search(r"kích|size|cỡ|co\b", key(g or "")))


def split_variant(name, opts, group_is_size):
    """'Xanh lá,0-3M [2,5-6Kg]' -> ('Xanh lá', '0-3M [2,5-6Kg]'), single tiers -> one side only."""
    name = norm(name)
    if not name or name.lower() == "nan":
        return None, None

    def single():
        return (None, name) if (group_is_size or looks_size(name)) else (name, None)

    if key(name) in opts:                       # whole name is one option of tier 1
        return single()
    commas = [i for i, c in enumerate(name) if c == ","]
    for i in commas:                            # 1) left part is a known tier-1 option
        if key(name[:i]) in opts:
            return order(name[:i].strip(), name[i + 1:].strip())
    for i in commas:                            # 2) right part looks like a size
        if looks_size(name[i + 1:]):
            return order(name[:i].strip(), name[i + 1:].strip())
    for i in commas:                            # 3) left part looks like a size (size,color)
        if looks_size(name[:i]) and not looks_size(name[i + 1:]):
            return name[i + 1:].strip(), name[:i].strip()
    return single()


def order(a, b):
    """Return (color, size); swap when tier 1 is the size."""
    if looks_size(a) and not looks_size(b):
        return b, a
    return a, b


def slugify(text):
    t = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:70].strip("-")


def size_sort_key(label):
    k = key(label)
    if re.match(r"newborn|nb\b|sơ sinh", k):
        return (-1, 0, k)
    n = [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[.,]\d+)?", k)[:2]]
    unit = 12 if re.search(r"\d\s*y", k.split("(")[0].split("[")[0]) else 1  # years after months
    return (0, (n[0] * unit if n else 1e9), n[1] if len(n) > 1 else 0, k)


def to_int(x):
    try:
        return int(float(str(x).replace(",", "")))
    except ValueError:
        return None


def find_brand(name):
    for brand, pat in BRANDS:
        if re.search(pat, name, re.I):
            return brand
    return None


# ---------------------------------------------------------------- build
opt_cols = [c for c in media.columns if re.match(r"et_title_option_\d+_for_variation_1$", c)]
img_cols = ["ps_item_cover_image"] + [f"ps_item_image.{i}" for i in range(1, 9)]
sales_by_pid = {pid: g for pid, g in sales.groupby("et_title_product_id", sort=False)}

items, warnings = [], collections.Counter()
for n, row in enumerate(media.itertuples(index=False), start=1):
    r = row._asdict() if hasattr(row, "_asdict") else {}
    r = dict(zip(media.columns, row))
    pid = r["et_title_product_id"].strip()
    name = norm(r["et_title_product_name"])
    group = r.get("et_title_variation_1")
    group_is_size = size_group(group)

    # tier-1 options (with their images) as listed in the media sheet
    opt_names, opt_images = [], {}
    for c in opt_cols:
        v = r.get(c)
        if isinstance(v, str) and v.strip():
            opt_names.append(norm(v))
            idx = re.search(r"option_(\d+)_", c).group(1)
            img = r.get(f"et_title_option_image_{idx}_for_variation_1")
            if isinstance(img, str) and img.strip():
                opt_images[key(v)] = img.strip()
    opts = {key(o) for o in opt_names}

    # variants
    variants, colors_seen, sizes_seen = [], [], []
    g = sales_by_pid.get(pid)
    if g is None:
        warnings["no sales rows"] += 1
        g = pd.DataFrame()
    for v in g.itertuples(index=False):
        v = dict(zip(g.columns, v))
        color, size = split_variant(v.get("et_title_variation_name"), opts, group_is_size)
        if color and color not in colors_seen:
            colors_seen.append(color)
        if size and size not in sizes_seen:
            sizes_seen.append(size)
        price = to_int(v.get("et_title_variation_price"))
        variants.append({
            "variationId": str(v["et_title_variation_id"]).strip(),
            "sku": norm(v["et_title_variation_sku"]) if isinstance(v.get("et_title_variation_sku"), str) else None,
            "gtin": norm(v["ps_gtin_code"]) if isinstance(v.get("ps_gtin_code"), str) else None,
            "name": norm(v["et_title_variation_name"]) if isinstance(v.get("et_title_variation_name"), str) else None,
            "color": color,
            "size": size,
            "price": price,
            "stock": to_int(v.get("et_title_variation_stock")) or 0,
        })

    # colours: keep the shop's own option order, then any extras
    rank = {key(o): i for i, o in enumerate(opt_names)}
    colors_seen.sort(key=lambda c: rank.get(key(c), 10_000))
    sizes_seen.sort(key=size_sort_key)
    colors = [{"name": c, "hex": None, "image": opt_images.get(key(c))} for c in colors_seen]
    sizes = [{"label": s} for s in sizes_seen]

    keys = [(v["color"], v["size"]) for v in variants]
    if len(keys) != len(set(keys)):
        warnings["duplicate colour+size combos"] += 1

    prices = [v["price"] for v in variants if v["price"] is not None]
    stock = sum(v["stock"] for v in variants)

    images = []
    for c in img_cols:
        u = r.get(c)
        if isinstance(u, str) and u.strip() and u.strip() not in images:
            images.append(u.strip())

    cat = r.get("et_title_product_category")
    cat_id, cat_path = None, []
    if isinstance(cat, str) and cat.strip():
        m = re.match(r"\s*(\d+)\s*-\s*(.+)$", cat)
        cat_id = int(m.group(1)) if m else None
        cat_path = [p.strip() for p in (m.group(2) if m else cat).split("/")]

    desc = desc_by_id.get(pid)
    desc = desc.replace("\r\n", "\n").strip() if isinstance(desc, str) and desc.strip() else None
    chart = r.get("et_title_size_chart")
    sku = r.get("et_title_parent_sku")

    items.append({
        "id": n,
        "shopeeProductId": pid,
        "sku": norm(sku) if isinstance(sku, str) and sku.strip() else None,
        "slug": f"{slugify(name)}-{n}",
        "name": name,
        "brand": find_brand(name),
        "category": cat_path[-1] if cat_path else None,
        "categoryId": cat_id,
        "categoryPath": cat_path,
        "description": desc,
        "price": min(prices) if prices else None,
        "maxPrice": max(prices) if prices else None,
        "onDiscount": False,
        "isNew": False,
        "isBestseller": False,
        "inStock": stock > 0,
        "stock": stock,
        "displayTags": [],
        "images": images,
        "sizeChart": chart.strip() if isinstance(chart, str) and chart.strip() else None,
        "colors": colors,
        "sizes": sizes,
        "variants": variants,
        "shopeeUrl": f"https://shopee.vn/product/{shop_id}/{pid}" if shop_id else None,
    })

os.makedirs(os.path.dirname(OUT) or ".", exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(items, fh, ensure_ascii=False, indent=2)

# ---------------------------------------------------------------- report
print(f"Wrote {len(items)} products -> {OUT} ({os.path.getsize(OUT)/1e6:.1f} MB)")
print("variants:", sum(len(i['variants']) for i in items),
      "| in stock:", sum(i['inStock'] for i in items),
      "| total units:", sum(i['stock'] for i in items))
print("with colors:", sum(bool(i['colors']) for i in items), "| with sizes:", sum(bool(i['sizes']) for i in items),
      "| with brand:", sum(bool(i['brand']) for i in items), "| with description:", sum(bool(i['description']) for i in items))
for k, v in warnings.items():
    print("warning:", k, v)
