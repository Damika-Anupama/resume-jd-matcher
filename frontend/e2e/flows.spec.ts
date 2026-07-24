import { test, expect } from "@playwright/test";
import {
  NO_SIGNAL_JD,
  SYNTH_JD,
  SYNTH_RESUME,
  VIEWPORT_MATRIX,
  runAnalysis,
  runSampleAnalysis,
} from "./helpers";

/**
 * Core user flows against the browser-local analysis contract:
 * sample analysis, insufficient-signal, validation, clear-data,
 * copy improvement plan, and report download.
 */

test.describe("sample analysis", () => {
  test("sample button fills inputs and renders a full result", async ({ page }) => {
    await page.goto("/");
    await runSampleAnalysis(page);

    // Sample data landed in the inputs.
    await expect(page.getByTestId("resume-input")).not.toHaveValue("");
    await expect(page.getByTestId("jd-input")).not.toHaveValue("");

    // Score renders as a 0–100 integer with a band label.
    await expect(page.getByTestId("score-value")).toBeVisible();
    const scoreText = (await page.getByTestId("score-value").innerText()).trim();
    const score = Number(scoreText.replace(/[^\d]/g, ""));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
    await expect(page.getByTestId("score-band")).toBeVisible();

    // Required coverage lists render; the sample is designed to have at least
    // one matched required keyword and at least one gap.
    await expect(page.getByTestId("required-matched-list")).toBeVisible();
    const matchedCount = await page
      .getByTestId("required-matched-list")
      .locator("li")
      .count();
    expect(matchedCount).toBeGreaterThan(0);
    await expect(page.getByTestId("suggestions-list")).toBeVisible();

    // Insufficient state must NOT show alongside a score.
    await expect(page.getByTestId("insufficient-state")).toHaveCount(0);
  });

  test("analysis runs client-side — no /api/analyze request", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/analyze")) apiCalls.push(req.url());
    });
    await page.goto("/");
    await runSampleAnalysis(page);
    await expect(page.getByTestId("results-region")).toBeVisible();
    expect(apiCalls).toEqual([]);
  });
});

test.describe("insufficient signal", () => {
  test("JD without recognisable skills shows guidance, not a score", async ({
    page,
  }) => {
    await page.goto("/");
    await runAnalysis(page, SYNTH_RESUME, NO_SIGNAL_JD);
    await expect(page.getByTestId("insufficient-state")).toBeVisible();
    // A coverage score must not be presented for insufficient signal.
    await expect(page.getByTestId("score-value")).toHaveCount(0);
  });
});

test.describe("validation", () => {
  test("empty inputs cannot be analyzed", async ({ page }) => {
    await page.goto("/");
    const analyze = page.getByTestId("analyze-button");
    // Contract allows either a disabled button or an inline error on click.
    if (await analyze.isDisabled()) {
      await expect(analyze).toBeDisabled();
    } else {
      await analyze.click();
      await expect(page.getByTestId("results-region")).toHaveCount(0);
    }
    await expect(page.getByTestId("score-value")).toHaveCount(0);
  });

  test("resume alone is not enough", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("resume-input").fill(SYNTH_RESUME);
    const analyze = page.getByTestId("analyze-button");
    if (!(await analyze.isDisabled())) {
      await analyze.click();
      await expect(page.getByTestId("score-value")).toHaveCount(0);
    } else {
      await expect(analyze).toBeDisabled();
    }
  });
});

test.describe("clear data", () => {
  test("clear button empties inputs and results", async ({ page }) => {
    await page.goto("/");
    await runSampleAnalysis(page);
    await expect(page.getByTestId("results-region")).toBeVisible();

    await page.getByTestId("clear-button").click();
    await expect(page.getByTestId("resume-input")).toHaveValue("");
    await expect(page.getByTestId("jd-input")).toHaveValue("");
    await expect(page.getByTestId("results-region")).toHaveCount(0);
    await expect(page.getByTestId("score-value")).toHaveCount(0);
  });

  test("start over from results returns to a clean input state", async ({ page }) => {
    await page.goto("/");
    await runSampleAnalysis(page);
    await page.getByTestId("start-over-button").click();
    await expect(page.getByTestId("results-region")).toHaveCount(0);
    await expect(page.getByTestId("resume-input")).toBeVisible();
  });
});

test.describe("copy improvement plan", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("copies suggestions without leaking the full resume", async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only");
    await page.goto("/");
    await runAnalysis(page, SYNTH_RESUME, SYNTH_JD);
    await expect(page.getByTestId("results-region")).toBeVisible();

    const suggestions = await page
      .getByTestId("suggestions-list")
      .locator("li")
      .allInnerTexts();
    expect(suggestions.length).toBeGreaterThan(0);

    await page.getByTestId("copy-plan-button").click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());

    // The plan carries at least one suggestion. innerText of the list items
    // includes the visual "1." marker and a layout newline, so compare on
    // whitespace-normalised text.
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    const normalClipboard = norm(clipboard);
    const carriesSuggestion = suggestions.some((s) =>
      normalClipboard.includes(norm(s).slice(0, 40))
    );
    expect(carriesSuggestion).toBe(true);
    // ...but never the raw resume text.
    expect(clipboard).not.toContain("Alex Morgan");
    expect(clipboard).not.toContain(SYNTH_RESUME);
  });
});

test.describe("download report", () => {
  test("downloads a report that excludes the raw resume text", async ({ page }) => {
    await page.goto("/");
    await runAnalysis(page, SYNTH_RESUME, SYNTH_JD);
    await expect(page.getByTestId("results-region")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("download-report-button").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.(md|txt|json)$/i);

    const path = await download.path();
    expect(path).toBeTruthy();
    const content = await (await import("node:fs/promises")).readFile(path!, "utf-8");
    expect(content.length).toBeGreaterThan(0);
    // Report is a summary — it must not embed the raw resume.
    expect(content).not.toContain(SYNTH_RESUME);
    expect(content).not.toContain("Alex Morgan");
  });
});

test.describe("responsive matrix", () => {
  for (const viewport of VIEWPORT_MATRIX) {
    test(`sample flow works at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await runSampleAnalysis(page);
      await expect(page.getByTestId("score-value")).toBeVisible();
    });
  }
});
