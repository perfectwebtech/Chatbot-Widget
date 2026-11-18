import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: [
    {
      command: "node e2e/mock-rasa.mjs",
      port: 5005,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node e2e/serve.mjs",
      port: 4173,
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
