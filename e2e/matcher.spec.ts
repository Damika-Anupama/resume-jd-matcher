import { test, expect } from "@playwright/test";
import {
  SYNTH_JD,
  SYNTH_RESUME,
  VIEWPORT_MATRIX,
  runAnalysis,
  runSampleAnalysis,
} from "./helpers";

/**
 * Smoke coverage for the browser-local keyword-coverage demo.
 *
 * Deeper flow, accessibility, keyboard, upload and privacy coverage live in
 * the dedicated specs (flows / accessibility / keyboard / files /
 * storage-and-console).
 */

test.describe("matcher smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the core controls", async ({ page }) => {
    await expect(page.getByTestId("resume-input")).toBeVisible();
    await expect(page.getByTestId("jd-input")).toBeVisible();
    await expect(page.getByTestId("analyze-button")).toBeVisible();
    await expect(page.getByTestId("sample-button")).toBeVisible();
  });

  test("manual analysis produces the coverage breakdown", async ({ page }) => {
    await runAnalysis(page, SYNTH_RESUME, SYNTH_JD);
    await expect(page.getByTestId("results-region")).toBeVisible();
    await expect(page.getByTestId("score-value")).toBeVisible();
    await expect(page.getByTestId("score-band")).toBeVisible();

    // SYNTH_RESUME covers python/react; kubernetes is a required gap and
    // terraform a nice-to-have gap (see helpers.ts).
    await expect(page.getByTestId("required-matched-list")).toContainText("python");
    await expect(page.getByTestId("required-matched-list")).toContainText("react");
    await expect(page.getByTestId("required-missing-list")).toContainText("kubernetes");
    await expect(page.getByTestId("nice-missing-list")).toContainText("terraform");

    // Extra skills (docker in the resume, absent from the JD) are surfaced.
    await expect(page.getByTestId("extra-skills-list")).toContainText("docker");

    // Suggestions never encourage fabrication and never claim ATS behaviour.
    const suggestions = await page
      .getByTestId("suggestions-list")
      .locator("li")
      .allInnerTexts();
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.toLowerCase()).not.toContain("ats");
    }
  });

  test("sample analysis works end to end", async ({ page }) => {
    await runSampleAnalysis(page);
    await expect(page.getByTestId("score-value")).toBeVisible();
    await expect(page.getByTestId("suggestions-list")).toBeVisible();
  });

  for (const viewport of VIEWPORT_MATRIX) {
    test(`core controls visible without overflow at ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByTestId("resume-input")).toBeVisible();
      await expect(page.getByTestId("analyze-button")).toBeVisible();
      const noOverflow = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return el.scrollWidth <= el.clientWidth;
      });
      expect(noOverflow).toBe(true);
    });
  }
});
