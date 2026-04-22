import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "lib/**/*.test.ts",
      "artifacts/api-server/src/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@workspace/db": new URL("./lib/db/src/index.ts", import.meta.url).pathname,
    },
  },
});
