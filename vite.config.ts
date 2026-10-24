import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// dev server -> "/"   |   build and preview -> "/do-dep-cho-be/"
export default defineConfig(({ mode }) => ({
  base: mode === "development" ? "/" : "/do-dep-cho-be/",
  plugins: [react(), tailwindcss()],
}));