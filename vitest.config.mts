import mdx from "@mdx-js/rollup";
import remarkGfm from "remark-gfm";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [mdx({ remarkPlugins: [remarkGfm] })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
