import { test, expect, type Request } from "@playwright/test";

/**
 * Privacy guarantee for the local analysis path (ADR 0001 "Privacy modes"):
 * when the demo analyses a resume/JD in the browser, not a single byte of that
 * content may reach any network endpoint, storage API, cookie, or console.
 *
 * Strategy: type unique sentinel strings into the inputs, run an analysis,
 * and prove the sentinels never appear in (a) any network request's URL,
 * headers or body — captured via BOTH page.route interception and
 * context request events — (b) localStorage/sessionStorage/cookies, or
 * (c) any console message.
 *
 * Relies on Agent 2's stable test ids: resume-input, jd-input,
 * analyze-button, results-region. Pending that UI integration these tests
 * fail (deliberately not skipped) — they are the enforcement gate.
 */

const SENTINEL_RESUME = "XZY9-SENTINEL-RESUME";
const SENTINEL_JD = "XZY9-SENTINEL-JD";
const SENTINELS = [SENTINEL_RESUME, SENTINEL_JD];

function containsSentinel(text: string | null | undefined): boolean {
  if (!text) return false;
  return SENTINELS.some((s) => text.includes(s));
}

async function requestLeaks(request: Request): Promise<string | null> {
  const url = request.url();
  const post = request.postData();
  let headerBlob = "";
  try {
    headerBlob = JSON.stringify(await request.allHeaders());
  } catch {
    // Request may already be disposed; fall back to sync headers.
    headerBlob = JSON.stringify(request.headers());
  }
  if (containsSentinel(url) || containsSentinel(post) || containsSentinel(headerBlob)) {
    return `${request.method()} ${url}`;
  }
  return null;
}

test("local analysis leaks no resume/JD bytes to network, storage, cookies or console", async ({
  page,
  context,
}) => {
  const networkLeaks: string[] = [];
  const consoleLeaks: string[] = [];

  // Net 1: intercept EVERY request (fetch/XHR/beacon/navigation/asset) so a
  // leak is caught even if it is fired right before unload.
  await page.route("**/*", async (route) => {
    const leak = await requestLeaks(route.request());
    if (leak) networkLeaks.push(`route: ${leak}`);
    await route.continue();
  });

  // Net 2: context-level request events (covers anything interception misses,
  // e.g. requests from workers).
  context.on("request", (request) => {
    void requestLeaks(request).then((leak) => {
      if (leak) networkLeaks.push(`event: ${leak}`);
    });
  });

  page.on("console", (message) => {
    if (containsSentinel(message.text())) {
      consoleLeaks.push(`${message.type()}: ${message.text().slice(0, 200)}`);
    }
  });
  page.on("pageerror", (error) => {
    if (containsSentinel(error.message)) {
      consoleLeaks.push(`pageerror: ${error.message.slice(0, 200)}`);
    }
  });

  await page.goto("/");

  await page
    .getByTestId("resume-input")
    .fill(`Senior Python developer using Docker daily. ${SENTINEL_RESUME}`);
  await page
    .getByTestId("jd-input")
    .fill(`Required: Python and Docker. ${SENTINEL_JD}`);
  await page.getByTestId("analyze-button").click();

  // The analysis must complete and render locally.
  await expect(page.getByTestId("results-region")).toBeVisible();

  // Grace period for any late/async beacon, storage write or logging.
  await page.waitForTimeout(1000);

  expect(networkLeaks, "no request URL/headers/body may contain the sentinels").toEqual([]);
  expect(consoleLeaks, "no console message may contain the sentinels").toEqual([]);

  // Web storage must not contain the sentinels — and for this app should be
  // entirely empty (the local path never writes any storage).
  const storage = await page.evaluate(() => ({
    localEntries: Object.entries({ ...localStorage }),
    sessionEntries: Object.entries({ ...sessionStorage }),
  }));
  const storageBlob = JSON.stringify(storage);
  for (const sentinel of SENTINELS) {
    expect(storageBlob, "web storage must not contain resume/JD content").not.toContain(sentinel);
  }
  expect(storage.localEntries, "localStorage should stay empty in the local path").toEqual([]);
  expect(storage.sessionEntries, "sessionStorage should stay empty in the local path").toEqual([]);

  // Cookies must not contain the sentinels.
  const cookieBlob = JSON.stringify(await context.cookies());
  for (const sentinel of SENTINELS) {
    expect(cookieBlob, "cookies must not contain resume/JD content").not.toContain(sentinel);
  }

  // No IndexedDB database may have been created by the local path.
  const idbNames = await page.evaluate(async () =>
    typeof indexedDB.databases === "function"
      ? (await indexedDB.databases()).map((db) => db.name ?? "")
      : []
  );
  expect(idbNames, "the local path must not create IndexedDB databases").toEqual([]);
});

test("sentinels do not survive a reload in any persisted state", async ({ page, context }) => {
  await page.goto("/");
  await page.getByTestId("resume-input").fill(`Python developer. ${SENTINEL_RESUME}`);
  await page.getByTestId("jd-input").fill(`Required: Python. ${SENTINEL_JD}`);
  await page.getByTestId("analyze-button").click();
  await expect(page.getByTestId("results-region")).toBeVisible();

  await page.reload();

  const persisted = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage })
  );
  const cookieBlob = JSON.stringify(await context.cookies());
  for (const sentinel of SENTINELS) {
    expect(persisted).not.toContain(sentinel);
    expect(cookieBlob).not.toContain(sentinel);
  }
  // Ephemeral by design: the inputs reset after reload instead of restoring
  // user content from any persistence.
  await expect(page.getByTestId("resume-input")).toHaveValue("");
  await expect(page.getByTestId("jd-input")).toHaveValue("");
});
