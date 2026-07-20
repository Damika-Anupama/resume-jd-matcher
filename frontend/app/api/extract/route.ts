import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/extract  (multipart/form-data, field "file")
 *
 * PDF/DOCX text extraction is backend-powered: this route proxies the upload to
 * the Python backend's /extract endpoint. When no BACKEND_URL is configured
 * (the fully self-contained demo deploy), it returns 501 so the UI can tell the
 * user to connect a backend or paste the text instead.
 */
const BACKEND_URL = process.env.BACKEND_URL?.replace(/\/$/, "");
const BACKEND_TIMEOUT_MS = 15000;

export async function POST(req: NextRequest) {
  if (!BACKEND_URL) {
    return NextResponse.json(
      {
        error:
          "File upload needs a backend. Set BACKEND_URL to enable PDF/DOCX parsing, or paste the resume text.",
      },
      { status: 501 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 422 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    const upstream = new FormData();
    upstream.append("file", file, file.name);
    const resp = await fetch(`${BACKEND_URL}/extract`, {
      method: "POST",
      body: upstream,
      signal: controller.signal,
    });
    const data = await resp.json().catch(() => ({ error: "Extraction failed." }));
    return NextResponse.json(data, { status: resp.status });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the extraction backend." },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
