import { NextRequest, NextResponse } from "next/server";
import { computeMatch } from "@/lib/matching";

/**
 * POST /api/analyze
 * Body: { resume: string, job_description: string }
 *
 * This route serves the private full product; the public demo runs the
 * matcher entirely in the browser and never calls it.
 *
 * Behaviour (ADR 0001 "Error schema"):
 *  - Input limits (20,000 chars/field) are enforced BEFORE any matching.
 *  - With BACKEND_URL set, backend 4xx statuses/bodies (400/401/413/422/429,
 *    and any other 4xx) are propagated verbatim — NEVER masked by a local
 *    success. The local deterministic matcher is a fallback ONLY for network
 *    failure/timeout or backend 5xx.
 *  - Every response carries Cache-Control: no-store and the typed error schema
 *    { error, code }. Request bodies are never logged.
 */
const BACKEND_URL = process.env.BACKEND_URL?.replace(/\/$/, "");
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;
const BACKEND_TIMEOUT_MS = 8000;

/** Max characters per field, mirrored by the backend. Checked before matching. */
const MAX_TEXT_CHARS = 20000;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function jsonResponse(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function errorResponse(status: number, code: string, error: string): NextResponse {
  return jsonResponse({ error, code }, status);
}

export async function POST(req: NextRequest) {
  let body: { resume?: unknown; job_description?: unknown };
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body must be valid JSON.");
  }

  const resume = typeof body.resume === "string" ? body.resume.trim() : "";
  const jd = typeof body.job_description === "string" ? body.job_description.trim() : "";

  if (!resume || !jd) {
    return errorResponse(
      422,
      "missing_fields",
      "Both 'resume' and 'job_description' are required."
    );
  }

  // Enforce size limits BEFORE matching or proxying (no unbounded work).
  if (resume.length > MAX_TEXT_CHARS) {
    return errorResponse(
      413,
      "payload_too_large",
      `'resume' exceeds the ${MAX_TEXT_CHARS.toLocaleString("en-US")}-character limit.`
    );
  }
  if (jd.length > MAX_TEXT_CHARS) {
    return errorResponse(
      413,
      "payload_too_large",
      `'job_description' exceeds the ${MAX_TEXT_CHARS.toLocaleString("en-US")}-character limit.`
    );
  }

  if (BACKEND_URL) {
    const proxied = await tryBackend(resume, jd);
    // null ONLY on network failure/timeout or backend 5xx — the deliberate
    // local-fallback cases. Backend 4xx responses were returned verbatim above.
    if (proxied) return proxied;
  }

  const result = computeMatch(resume, jd);
  return jsonResponse(result);
}

async function tryBackend(resume: string, jd: string): Promise<NextResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (BACKEND_API_KEY) headers["X-API-Key"] = BACKEND_API_KEY;
    const resp = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      headers,
      body: JSON.stringify({ resume, job_description: jd }),
      signal: controller.signal,
    });

    // Backend 5xx: treat like an outage and fall back to the local matcher.
    if (resp.status >= 500) return null;

    // Success and every 4xx (400/401/413/422/429/...): propagate status and
    // body verbatim so backend errors are never masked by a local success.
    const raw = await resp.text();
    return new NextResponse(raw, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("content-type") ?? "application/json",
        ...NO_STORE,
      },
    });
  } catch {
    // Network failure or timeout — the other deliberate fallback case.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
