import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /e2e\.spec\.ts/,
  use: {
    baseURL: "http://127.0.0.1:8766",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    command: "python3 -m http.server 8766",
    port: 8766,
    reuseExistingServer: !process.env.CI,
  },
});
