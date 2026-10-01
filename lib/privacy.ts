/**
 * Privacy helpers for the local-only demo path.
 *
 * Invariant (ADR 0001 "Privacy modes"): in local mode no resume/JD byte may
 * reach any network endpoint, storage API, cookie, or console. The lib code
 * therefore never WRITES to any persistence — this helper exists so the UI's
 * "Clear data" action can also defensively WIPE anything a previous build or
 * extension might have left behind, in addition to resetting its own React
 * state (which Agent 2's UI owns).
 */

/** Storage key prefix reserved for this app. Nothing should ever write it. */
export const APP_STORAGE_PREFIX = "rjm:";

/**
 * Best-effort wipe of ephemeral browser state associated with this app.
 * Safe to call from any environment (no-op on the server) and never throws
 * (storage access can be denied in some privacy modes/iframes).
 */
export function clearSensitiveState(): void {
  if (typeof window === "undefined") return;

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && key.startsWith(APP_STORAGE_PREFIX)) doomed.push(key);
      }
      doomed.forEach((key) => storage.removeItem(key));
    } catch {
      // Storage unavailable (privacy mode / sandboxed iframe) — nothing stored anyway.
    }
  }

  try {
    // Drop any same-origin, JS-visible cookies with our prefix (none are set by us).
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0]?.trim();
      if (name && name.startsWith(APP_STORAGE_PREFIX)) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    }
  } catch {
    // Cookies unavailable — ignore.
  }
}
