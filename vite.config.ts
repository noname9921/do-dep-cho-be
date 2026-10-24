import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GitHub Pages serves the site from /<repo-name>/ ; locally it stays at /
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/do-dep-cho-be/" : "/",
  plugins: [react(), tailwindcss()],
}));