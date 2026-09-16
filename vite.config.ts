import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // The admin page (/admin) talks to server/index.mjs, which must be
    // running separately (npm run server). Proxied so the browser sees a
    // single origin — matches how a real deploy would sit an admin API
    // behind the same reverse proxy as the static museum.
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.ADMIN_PORT ?? 3001}`,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
  },
});
