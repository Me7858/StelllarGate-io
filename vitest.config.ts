import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/__tests__/**/*.ts"],
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
  },
});
