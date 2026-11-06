import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/*/src/**/*.test.ts", "pacotes/*/src/**/*.test.ts"],
    environment: "node",
    testTimeout: 10_000,
  },
});
