import { test, expect, type Page } from "@playwright/test";

/**
 * Keyboard-only operation of the full flow:
 *  - Tab reaches the skip link first,
 *  - Tab order reaches both textareas and the action buttons,
 *  - buttons activate with Enter and Space,
 *  - focus moves into the results after analysis,
 *  - focused controls show a visible focus indicator.
 */

/** Description of the currently focused element, evaluated in the page. */
async function focusedInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const style = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid"),
      text: (el.textContent ?? "").trim().slice(0, 80),
      href: el.getAttribute("href"),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
    };
  });
}

/** True when the computed style amounts to a visible focus ring. */
function hasVisibleFocusIndicator(info: {
  outlineStyle: string;
  outlineWidth: string;
  outlineColor: string;
  boxShadow: string;
}): boolean {
  const outlineVisible =
    info.outlineStyle !== "none" &&
    parseFloat(info.outlineWidth) > 0 &&
    !info.outlineColor.includes("rgba(0, 0, 0, 0)") &&
    info.outlineColor !== "transparent";
  const shadowVisible = info.boxShadow !== "none" && info.boxShadow !== "";
  return outlineVisible || shadowVisible;
}

/** Tab until an element matching the predicate is focused (bounded). */
async function tabTo(
  page: Page,
  predicate: (info: NonNullable<Awaited<ReturnType<typeof focusedInfo>>>) => boolean,
  maxTabs = 25
) {
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const info = await focusedInfo(page);
    if (info && predicate(info)) return info;
  }
  return null;
}

test.describe("keyboard-only flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Ensure focus starts from the top of the document.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  });

  test("first Tab reaches a skip link", async ({ page }) => {
    await page.keyboard.press("Tab");
    const info = await focusedInfo(page);
    expect(info, "something should receive focus on first Tab").not.toBeNull();
    expect(
      /skip/i.test(info!.text) && info!.tag === "a",
      `first focused element should be a skip link, got: ${JSON.stringify(info)}`
    ).toBe(true);
  });

  test("Tab order reaches both textareas and the primary buttons", async ({
    page,
  }) => {
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const info = await focusedInfo(page);
      if (info?.testid) seen.add(info.testid);
      if (seen.has("resume-input") && seen.has("jd-input") && seen.has("analyze-button"))
        break;
    }
    expect(seen).toContain("resume-input");
    expect(seen).toContain("jd-input");
    expect(seen).toContain("analyze-button");
  });

  test("sample analysis runs with Enter and focus moves to results", async ({
    page,
  }) => {
    const reached = await tabTo(page, (i) => i.testid === "sample-button");
    expect(reached, "sample-button must be reachable by keyboard").not.toBeNull();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("results-region")).toBeVisible();
    // Focus must move to (or into) the results region so screen-reader and
    // keyboard users land on the outcome.
    const focusInResults = await page.evaluate(() => {
      const region = document.querySelector('[data-testid="results-region"]');
      return !!region && (region === document.activeElement || region.contains(document.activeElement));
    });
    expect(focusInResults).toBe(true);
  });

  test("sample analysis also runs with Space", async ({ page }) => {
    const reached = await tabTo(page, (i) => i.testid === "sample-button");
    expect(reached).not.toBeNull();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("results-region")).toBeVisible();
  });

  test("focused controls show a visible focus indicator", async ({ page }) => {
    // Tab through the page (keyboard focus ⇒ :focus-visible applies) and
    // record the focus styling of each contract control encountered.
    const targets = new Set([
      "resume-input",
      "jd-input",
      "sample-button",
      "analyze-button",
    ]);
    const missing: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < 30 && seen.size < targets.size; i++) {
      await page.keyboard.press("Tab");
      const info = await focusedInfo(page);
      if (info?.testid && targets.has(info.testid) && !seen.has(info.testid)) {
        seen.add(info.testid);
        if (!hasVisibleFocusIndicator(info)) {
          missing.push(`${info.testid}: ${JSON.stringify(info)}`);
        }
      }
    }
    expect(Array.from(seen).sort()).toEqual(Array.from(targets).sort());
    expect(missing, "controls without a visible focus indicator").toEqual([]);
  });
});
