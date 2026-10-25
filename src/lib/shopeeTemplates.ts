import type { Cell } from "./exchange";

// Header rows copied from the Shopee mass-update templates (your files 1.xlsx and mass_update_basic_info_*.xlsx).
// Row 2 holds Shopee's template id and your shop id; keep it as is when you upload the file back to Shopee.
export const SALES_HEAD: Cell[][] = [
  [
    "et_title_product_id",
    "et_title_product_name",
    "et_title_variation_id",
    "et_title_variation_name",
    "et_title_parent_sku",
    "et_title_variation_sku",
    "et_title_variation_price",
    "ps_gtin_code",
    "et_title_variation_stock",
    "et_title_reason"
  ],
  [
    "sales_info",
    "700a3d5d251db047505a7f359b80bb1a",
    "0",
    "1937828",
    "{\"search_condition\":{}}",
    null,
    null,
    null,
    null,
    null
  ],
  [
    "Mã Sản phẩm",
    "Tên Sản phẩm",
    "Mã Phân loại",
    "Tên phân loại",
    "SKU Sản phẩm",
    "SKU",
    "Giá",
    "GTIN",
    "Số lượng",
    "Lý do thất bại"
  ],
  [
    "",
    "",
    "",
    "",
    "",
    "",
    "Bắt buộc",
    "",
    "Bắt buộc",
    ""
  ],
  [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ],
  [
    "",
    "",
    "",
    "",
    "",
    "",
    "Vui lòng nhập 1000 đến 120000000 để biết giá sản phẩm. Giá của sản phẩm đắt nhất chia cho giá của giới hạn sản phẩm rẻ nhất: 5",
    "",
    "",
    ""
  ]
];

export const BASIC_HEAD: Cell[][] = [
  [
    "et_title_product_id",
    "et_title_parent_sku",
    "et_title_product_name",
    "et_title_product_description",
    "et_title_reason"
  ],
  [
    "basic_info",
    "31088f6adee4ec7cf043840b511a8b1d",
    "0",
    "1937828",
    "{\"search_condition\":{}}"
  ],
  [
    "Mã Sản phẩm",
    "SKU Sản phẩm",
    "Tên Sản phẩm",
    "Mô tả Sản phẩm",
    "Lý do thất bại"
  ],
  [
    "",
    "",
    "",
    "",
    ""
  ],
  [
    "",
    "",
    "",
    "",
    ""
  ],
  [
    "",
    "",
    "",
    "",
    ""
  ]
];

export const DISCOUNT_HEAD: Cell[] = [
  "Mã sản phẩm",
  "Tên Sản phẩm (Tùy chọn)",
  "Số SKU Sản phẩm (Tùy chọn)",
  "Mã phân loại hàng",
  "Tên phân loại hàng (Tùy chọn)",
  "Số SKU Phân loại hàng (Tùy chọn)",
  "Giá gốc (Tùy chọn)",
  "Giá đã giảm",
  "Giới hạn đặt hàng (Tùy chọn)"
];