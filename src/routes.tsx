import { createBrowserRouter } from "react-router";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import Contact from "./pages/Contact";
import Checkout from "./pages/Checkout";
import Analytics from "./pages/Analytics";
import AdminProducts from "./pages/AdminProducts";
import MyOrders from "./pages/MyProducts";
import NotFound from "./pages/NotFound";

// main.tsx:  <RouterProvider router={router} />
export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/shop", element: <Shop /> },
      { path: "/shop/:itemId", element: <Product /> },
      { path: "/contact", element: <Contact /> },
      { path: "/checkout", element: <Checkout /> },
      { path: "/orders", element: <MyOrders /> },
      { path: "/analytics", element: <Analytics /> },
      { path: "/admin/products", element: <AdminProducts /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);