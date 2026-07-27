import type { Page } from "@playwright/test";

/**
 * Shared helpers for the e2e suite.
 *
 * All selectors follow the UI contract data-testids. All text content is fully
 * synthetic — fictional personas only, no real PII.
 */

/** Viewport widths swept by the responsive matrix (heights are sensible pairs). */
export const VIEWPORT_MATRIX: ReadonlyArray<{ width: number; height: number }> = [
  { width: 320, height: 640 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 720 },
];

/** Synthetic resume that matches part of SYNTH_JD (skills from the taxonomy). */
export const SYNTH_RESUME = [
  "Alex Morgan — Software Engineer (fictional persona for testing)",
  "Built web applications with Python and React.",
  "Deployed services with Docker in a team environment.",
].join("\n");

/** Synthetic JD with recognisable required skills (python, react) and a gap. */
export const SYNTH_JD = [
  "Role: Software Engineer (synthetic test posting)",
  "Required: Python, React and Kubernetes experience.",
  "Nice to have: Terraform.",
].join("\n");

/** A JD with no recognisable skill keywords → insufficient_signal state. */
export const NO_SIGNAL_JD = [
  "We are seeking a motivated, collaborative individual who enjoys",
  "teamwork, clear communication and a positive attitude. Flexible",
  "hours, friendly colleagues and a great snack cupboard await.",
].join("\n");

/** Fill both inputs and run an analysis via the analyze button. */
export async function runAnalysis(page: Page, resume: string, jd: string) {
  await page.getByTestId("resume-input").fill(resume);
  await page.getByTestId("jd-input").fill(jd);
  await page.getByTestId("analyze-button").click();
}

/** Load the built-in sample (fills synthetic data and auto-runs analysis). */
export async function runSampleAnalysis(page: Page) {
  await page.getByTestId("sample-button").click();
  await page.getByTestId("results-region").waitFor({ state: "visible" });
}

/** True when the page has no horizontal overflow (no horizontal scrollbar). */
export async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth <= el.clientWidth;
  });
}
