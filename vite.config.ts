import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8088",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
  },
  define: {
    __API_BASE__: JSON.stringify(
      mode === "android"
        ? process.env.VITE_API_BASE_URL || "http://localhost:8088"
        : ""
    ),
  },
}));
