import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      ["tests/overlay.test.js", "jsdom"],
      ["tests/**", "node"],
    ],
    include: ["tests/**/*.test.js"],
    setupFiles: ["./tests/setup-jsdom.js"],
  },
});
