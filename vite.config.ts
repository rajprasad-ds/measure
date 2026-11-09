import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa.svg"],
      manifest: {
        name: "JEE Practice",
        short_name: "JEE Practice",
        description: "An offline-ready practice tracker for JEE question sessions.",
        theme_color: "#f5f5f0",
        background_color: "#f5f5f0",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/pwa.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any"
          }
        ]
      }
    })
  ]
});
