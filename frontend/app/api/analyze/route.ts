import { NextRequest, NextResponse } from "next/server";
import { computeMatch } from "@/lib/matching";

/**
 * POST /api/analyze
 * Body: { resume: string, job_description: string }
 *
 * Two-tier by design:
 *  - If BACKEND_URL is set, proxy to the Python backend so the response carries
 *    real-LLM tailoring suggestions (provider: "openrouter") when that backend
 *    has a key configured.
 *  - Otherwise (or if the backend is unreachable), run the deterministic matcher
 *    in-process so the deployment stays fully self-contained and never fails —
 *    the structured score is identical either way.
 */
const BACKEND_URL = process.env.BACKEND_URL?.replace(/\/$/, "");
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;
const BACKEND_TIMEOUT_MS = 8000;

export async function POST(req: NextRequest) {
  let body: { resume?: string; job_description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const resume = (body.resume ?? "").trim();
  const jd = (body.job_description ?? "").trim();

  if (!resume || !jd) {
    return NextResponse.json(
      { error: "Both 'resume' and 'job_description' are required." },
      { status: 422 }
    );
  }

  if (BACKEND_URL) {
    const proxied = await tryBackend(resume, jd);
    if (proxied) return proxied;
    // Backend down/unexpected: fall through to the local matcher rather than 5xx.
  }

  const result = computeMatch(resume, jd);
  return NextResponse.json(result);
}

async function tryBackend(
  resume: string,
  jd: string
): Promise<NextResponse | null> {
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
    if (!resp.ok) return null;
    const data = await resp.json();
    return NextResponse.json(data);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
