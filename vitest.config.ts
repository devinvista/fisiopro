import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "lib/**/*.test.ts",
      "artifacts/api-server/src/**/*.test.ts",
      "artifacts/fisiogest/src/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@workspace/db": new URL("./lib/db/src/index.ts", import.meta.url).pathname,
      // `@/` é o alias do fisiogest (vite + tsconfig do app) — replicado aqui
      // para que os testes de schemas/ utils da UI consigam resolver imports
      // como `@/utils/masks` quando rodados pela suíte raiz.
      "@/": new URL("./artifacts/fisiogest/src/", import.meta.url).pathname,
    },
  },
});
