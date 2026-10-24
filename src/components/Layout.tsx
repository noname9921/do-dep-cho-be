import { useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration } from "react-router";
import { CartProvider, useCart } from "../lib/cart";
import { CONTACT, SHOP_NAME } from "../lib/config";

const links = [
  { to: "/", label: "Trang chủ", end: true },
  { to: "/shop", label: "Cửa hàng" },
  { to: "/contact", label: "Liên hệ" },
  { to: "/orders", label: "Đơn hàng của tôi" },
  { to: "/analytics", label: "Thống kê" },
  { to: "/admin/products", label: "Sản phẩm" },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const { count } = useCart();

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-surface-muted text-text" : "text-text/70 hover:bg-surface-hover"
    }`;

  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-border">
      <nav className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="font-bold text-xl text-text" onClick={() => setOpen(false)}>
          {SHOP_NAME}
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkCls}>
              {l.label}
            </NavLink>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/checkout"
            aria-label={`Giỏ hàng, ${count} sản phẩm`}
            className="relative px-3 py-2 rounded-md border border-border text-sm hover:bg-surface-hover"
          >
            🛒 Giỏ hàng
            {count > 0 && (
              <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 grid place-items-center rounded-full bg-primary text-white text-xs font-semibold">
                {count}
              </span>
            )}
          </Link>
          <button
            type="button"
            className="md:hidden px-3 py-2 rounded-md border border-border"
            aria-expanded={open}
            aria-label="Mở/đóng menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {open && (
        <div className="md:hidden border-t border-border px-4 py-2 flex flex-col">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={linkCls} onClick={() => setOpen(false)}>
              {l.label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-surface mt-12">
      <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row justify-between gap-4 text-sm text-text/70">
        <p>© {new Date().getFullYear()} {SHOP_NAME}</p>
        <p>{CONTACT.phone}</p>
      </div>
    </footer>
  );
}

export default function Layout() {
  return (
    <CartProvider>
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
      </div>
      <ScrollRestoration />
    </CartProvider>
  );
}