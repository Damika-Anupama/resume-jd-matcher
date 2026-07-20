import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for the Resume ↔ JD Matcher frontend.
 *
 * The app runs fully self-contained (matching runs in a Next.js route handler,
 * no external API key needed), so the suite passes locally and against the
 * Vercel preview. Set E2E_BASE_URL to target a deployed preview.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // `next start` is incompatible with `output: "standalone"`, so serve the
        // standalone build (with static assets colocated) via scripts/serve-e2e.mjs.
        command: "npm run build && npm run start:e2e",
        url: "http://localhost:3000",
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
