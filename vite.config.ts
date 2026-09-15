import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["test/unit/**/*.test.ts", "test/integration/**/*.test.ts"],
  },
});
