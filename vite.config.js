import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.gltf", "**/*.bin"],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    open: true,
    headers: {
      "Cache-Control": "no-store",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    open: true,
  },
});
