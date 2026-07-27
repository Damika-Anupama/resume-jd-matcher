import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for the Resume ↔ JD Matcher frontend.
 *
 * The public demo is fully browser-local (analysis never leaves the page), so
 * the suite needs no API keys or backend. Set E2E_BASE_URL to target a
 * deployed preview instead of the local standalone build.
 *
 * Projects:
 *   - chromium         desktop viewport (1280×720)
 *   - mobile-chromium  Pixel 7 device descriptor (touch, mobile viewport)
 *
 * Individual specs additionally sweep a viewport matrix
 * (320 / 375 / 390 / 768 / 1280) via page.setViewportSize.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  // The standalone server's first request after boot can be slow; give
  // assertions headroom so the first test isn't flaky on a cold start.
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
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
