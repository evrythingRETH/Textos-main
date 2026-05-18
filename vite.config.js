import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    open: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    open: true,
  },
});
