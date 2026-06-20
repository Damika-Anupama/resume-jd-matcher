import { NextRequest, NextResponse } from "next/server";
import { computeMatch } from "@/lib/matching";

/**
 * POST /api/analyze
 * Body: { resume: string, job_description: string }
 *
 * Runs the deterministic matcher in-process so the deployment is fully
 * self-contained (deploy-safe, no API key required). The Python backend in
 * /backend offers the same contract plus a real-LLM provider when configured.
 */
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

  const result = computeMatch(resume, jd);
  return NextResponse.json(result);
}
