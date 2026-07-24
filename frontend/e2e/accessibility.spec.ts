import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  NO_SIGNAL_JD,
  SYNTH_RESUME,
  hasNoHorizontalOverflow,
  runAnalysis,
  runSampleAnalysis,
} from "./helpers";

/**
 * Accessibility coverage:
 *  - axe-core scans (no serious/critical violations) on the three key states,
 *  - 200% zoom usability,
 *  - no horizontal scrollbar at 320px.
 */

/** Fail the test if axe reports any serious or critical violations. */
async function expectNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? "")
  );
  expect(
    serious.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target),
    }))
  ).toEqual([]);
}

test.describe("accessibility (axe-core)", () => {
  test("initial page has no serious/critical violations", async ({ page }) => {
    await page.goto("/");
    await expectNoSeriousViolations(page);
  });

  test("results state has no serious/critical violations", async ({ page }) => {
    await page.goto("/");
    await runSampleAnalysis(page);
    await expect(page.getByTestId("results-region")).toBeVisible();
    await expectNoSeriousViolations(page);
  });

  test("insufficient-signal state has no serious/critical violations", async ({
    page,
  }) => {
    await page.goto("/");
    await runAnalysis(page, SYNTH_RESUME, NO_SIGNAL_JD);
    await expect(page.getByTestId("insufficient-state")).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});

test.describe("zoom and reflow", () => {
  test("page remains usable at 200% zoom", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    // Emulate 200% zoom via CSS zoom (halves the effective CSS viewport).
    await page.evaluate(() => {
      (document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom =
        "2";
    });
    // Core controls stay visible and operable.
    await expect(page.getByTestId("resume-input")).toBeVisible();
    await expect(page.getByTestId("jd-input")).toBeVisible();
    await expect(page.getByTestId("analyze-button")).toBeVisible();
    await expect(page.getByTestId("sample-button")).toBeVisible();
    // The flow still works while zoomed.
    await runSampleAnalysis(page);
    await expect(page.getByTestId("results-region")).toBeVisible();
  });

  test("no horizontal scrollbar at 320px width", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
    // Also after results render (widest state).
    await runSampleAnalysis(page);
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });
});
