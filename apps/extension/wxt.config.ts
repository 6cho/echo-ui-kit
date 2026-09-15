import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Echo UI Kit",
    description:
      "A hub of front-end dev tools: color/palette generators, page inspection overlays, and more.",
    permissions: ["storage", "sidePanel"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
