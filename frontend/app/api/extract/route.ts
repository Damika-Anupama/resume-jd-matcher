import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/extract  (multipart/form-data, field "file")
 *
 * This route serves the private full product: it proxies the upload to the
 * Python backend's /extract endpoint, propagating statuses and bodies
 * verbatim. The public demo parses files entirely in the browser via
 * lib/parse-file.ts and never calls this route; without BACKEND_URL it
 * returns 501 pointing at local parsing.
 *
 * Every response carries Cache-Control: no-store and errors use the typed
 * { error, code } schema. The declared request size is checked BEFORE the
 * body is buffered. File contents are never logged.
 */
const BACKEND_URL = process.env.BACKEND_URL?.replace(/\/$/, "");
const BACKEND_API_KEY = process.env.BACKEND_API_KEY;
const BACKEND_TIMEOUT_MS = 15000;

/** 5 MB file cap, mirroring lib/parse-file.ts MAX_FILE_BYTES and the backend. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Allowance for multipart framing/other fields on top of the file bytes. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function errorResponse(status: number, code: string, error: string): NextResponse {
  return NextResponse.json({ error, code }, { status, headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  if (!BACKEND_URL) {
    return errorResponse(
      501,
      "backend_not_configured",
      "Server-side extraction is not configured. File parsing runs locally in your browser (lib/parse-file.ts) — or paste the resume text."
    );
  }

  // Reject oversized uploads from the declared size BEFORE buffering the body.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_FILE_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return errorResponse(413, "file_too_large", "File exceeds the 5 MB limit.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorResponse(400, "invalid_form_data", "Invalid form data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return errorResponse(422, "missing_file", "No file provided.");
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(413, "file_too_large", "File exceeds the 5 MB limit.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    const upstream = new FormData();
    upstream.append("file", file, file.name);
    const headers: Record<string, string> = {};
    if (BACKEND_API_KEY) headers["X-API-Key"] = BACKEND_API_KEY;
    const resp = await fetch(`${BACKEND_URL}/extract`, {
      method: "POST",
      headers,
      body: upstream,
      signal: controller.signal,
    });
    // Propagate backend status and body verbatim (success and errors alike).
    const raw = await resp.text();
    return new NextResponse(raw, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("content-type") ?? "application/json",
        ...NO_STORE,
      },
    });
  } catch {
    return errorResponse(
      502,
      "backend_unreachable",
      "Could not reach the extraction backend."
    );
  } finally {
    clearTimeout(timer);
  }
}
