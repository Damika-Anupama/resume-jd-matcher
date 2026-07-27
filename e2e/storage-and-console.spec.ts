import { test, expect } from "@playwright/test";
import { runAnalysis } from "./helpers";

/**
 * Privacy: user text must never leak into console output or any browser
 * storage surface (localStorage, sessionStorage, cookies, IndexedDB).
 *
 * A unique sentinel string is typed into both inputs alongside recognisable
 * skill keywords (so an analysis actually runs), then every surface is swept
 * for the sentinel. Agent 3's privacy-local spec separately asserts that no
 * network request carries user text.
 */

const SENTINEL = "SENTINEL-7f3a91-DO-NOT-PERSIST";

const SENTINEL_RESUME = [
  `Alex Morgan (${SENTINEL})`,
  "Built web applications with Python and React.",
].join("\n");

const SENTINEL_JD = [
  `Synthetic posting ${SENTINEL}`,
  "Required: Python and React experience.",
].join("\n");

test("sentinel text never reaches console or browser storage", async ({ page }) => {
  const consoleMessages: string[] = [];
  page.on("console", (msg) => consoleMessages.push(msg.text()));
  page.on("pageerror", (err) => consoleMessages.push(String(err)));

  await page.goto("/");
  await runAnalysis(page, SENTINEL_RESUME, SENTINEL_JD);
  await expect(page.getByTestId("results-region")).toBeVisible();

  // Give any deferred persistence/logging a moment to fire.
  await page.waitForTimeout(500);

  // 1. Console: no message may contain the sentinel.
  const leakyConsole = consoleMessages.filter((m) => m.includes(SENTINEL));
  expect(leakyConsole).toEqual([]);

  // 2–4. localStorage, sessionStorage, cookies.
  const storageDump = await page.evaluate(() => {
    const dump: Record<string, string> = {};
    for (const [label, store] of [
      ["localStorage", window.localStorage],
      ["sessionStorage", window.sessionStorage],
    ] as const) {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)!;
        dump[`${label}:${key}`] = store.getItem(key) ?? "";
      }
    }
    dump["cookies"] = document.cookie;
    return dump;
  });
  const leakyStorage = Object.entries(storageDump).filter(
    ([key, value]) => key.includes(SENTINEL) || value.includes(SENTINEL)
  );
  expect(leakyStorage).toEqual([]);

  // 5. IndexedDB: walk every database, object store and record.
  const idbDump = await page.evaluate(async () => {
    const databases = await indexedDB.databases();
    const rows: string[] = [];
    for (const info of databases) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(info.name!);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      for (const storeName of Array.from(db.objectStoreNames)) {
        const records = await new Promise<unknown[]>((resolve, reject) => {
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
        rows.push(`${info.name}/${storeName}: ${JSON.stringify(records)}`);
      }
      db.close();
    }
    return rows;
  });
  const leakyIdb = idbDump.filter((row) => row.includes(SENTINEL));
  expect(leakyIdb).toEqual([]);
});

test("clear data leaves no sentinel behind anywhere", async ({ page }) => {
  await page.goto("/");
  await runAnalysis(page, SENTINEL_RESUME, SENTINEL_JD);
  await expect(page.getByTestId("results-region")).toBeVisible();
  await page.getByTestId("clear-button").click();

  await expect(page.getByTestId("resume-input")).toHaveValue("");
  await expect(page.getByTestId("jd-input")).toHaveValue("");

  // Nothing on the page (DOM included) should still carry the sentinel.
  const bodyText = await page.evaluate(() => document.body.innerHTML);
  expect(bodyText).not.toContain(SENTINEL);
});
