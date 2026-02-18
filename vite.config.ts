import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Orbia",
        short_name: "Orbia",
        display: "standalone",
        start_url: "/app",
        scope: "/",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "/uploads/dummy/orbia_logo.png", sizes: "192x192", type: "image/png" },
          { src: "/uploads/dummy/orbia_logo.png", sizes: "512x512", type: "image/png" },
        ],
      },
      includeAssets: ["favicon.ico", "manifest-tenant.json", "manifest-delivery.json", "manifest-owner.json", "icons/**"],
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
