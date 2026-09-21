import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Echo UI Kit",
    description:
      "A hub of front-end dev tools: color/palette generators, page inspection overlays, and more.",
    // tabs: to find the active tab and read its URL, so a restricted page can be reported as
    // such instead of failing with an opaque messaging error.
    // host_permissions <all_urls>: the page tools are the reason this is an extension rather
    // than a web app, and they have to reach whatever site the user happens to be looking at.
    // The content script attaches a message listener and does nothing until asked.
    permissions: ["storage", "sidePanel", "tabs"],
    host_permissions: ["<all_urls>"],
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
