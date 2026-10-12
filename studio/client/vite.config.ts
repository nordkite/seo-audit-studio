import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

const STUDIO_PORT = process.env.STUDIO_PORT ?? "4321";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // `npm run studio:dev` runs Vite alongside studio/server.ts; the API lives
    // on the server, everything else is served by Vite with hot reload.
    proxy: { "/api": { target: `http://127.0.0.1:${STUDIO_PORT}`, changeOrigin: true } },
  },
  // Not "assets" — the server serves report images from /assets/<slug>/..., which
  // is the exact path stored in the report JSON. Vite's bundle goes elsewhere.
  build: { outDir: "dist", emptyOutDir: true, assetsDir: "static" },
});
