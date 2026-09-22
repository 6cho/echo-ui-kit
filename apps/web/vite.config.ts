import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative so the build works under a subpath — a project page on GitHub Pages is served from
  // /<repo>/, and absolute asset URLs would 404 there.
  base: "./",
});
