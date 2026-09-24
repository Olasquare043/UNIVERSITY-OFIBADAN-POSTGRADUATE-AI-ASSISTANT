import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// `vite --mode mock` reads .env.mock, which points the proxy at the mock server.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiTarget = process.env.VITE_API_TARGET || env.VITE_API_TARGET || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": apiTarget },
    },
    build: { outDir: "dist" },
  };
});
