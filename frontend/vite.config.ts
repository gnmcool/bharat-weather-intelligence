import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API runs on :8000 (FastAPI). In dev, Vite proxies /api so the browser sees one origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // public link via Cloudflare Tunnel (scripts/dev-wsl.sh) — allow its hostnames
    allowedHosts: [".trycloudflare.com"],
    proxy: { "/api": { target: process.env.BWI_API ?? "http://127.0.0.1:8000", changeOrigin: true } },
  },
  build: { chunkSizeWarningLimit: 1800 },
});
