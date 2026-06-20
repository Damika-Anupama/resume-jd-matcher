import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage for the Resume ↔ JD Matcher.
 *
 * Exercises the full client flow against the in-process /api/analyze route:
 * sample loading, analysis, score + matched/missing skills + suggestions, and
 * input validation. No API key required (deploy-safe).
 */

test.describe("Resume ↔ JD Matcher", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the header and tech tags", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Resume ↔ JD Matcher" })
    ).toBeVisible();
    for (const tag of ["Next.js", "TypeScript", "FastAPI", "LLM", "Playwright"]) {
      await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
    }
  });

  test("sample analysis renders score, skills and suggestions", async ({ page }) => {
    await page.getByRole("button", { name: "Load a sample" }).click();
    await page.getByRole("button", { name: "Analyze fit" }).click();

    // Summary appears with a match band.
    await expect(page.getByText(/match: the resume covers/i)).toBeVisible();

    // Matched skills include react/typescript from the sample.
    await expect(
      page.getByRole("heading", { name: /Matched skills/i })
    ).toBeVisible();
    await expect(page.getByText("react", { exact: true }).first()).toBeVisible();

    // Missing skills include kubernetes/terraform from the sample JD.
    await expect(page.getByText("kubernetes", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("terraform", { exact: true }).first()).toBeVisible();

    // At least one suggestion renders.
    await expect(page.getByText(/Add concrete evidence of/i).first()).toBeVisible();

    // Provider label is shown (mock in the deploy-safe default).
    await expect(page.getByText(/Analysis provider:/i)).toBeVisible();
  });

  test("validates empty input", async ({ page }) => {
    await page.getByRole("button", { name: "Analyze fit" }).click();
    await expect(
      page.getByText("Please provide both a resume and a job description.")
    ).toBeVisible();
  });
});
