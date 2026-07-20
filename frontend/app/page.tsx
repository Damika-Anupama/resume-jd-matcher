"use client";

import { useRef, useState } from "react";
import type { MatchResult } from "@/lib/matching";

const SAMPLE_RESUME = `Full-stack engineer. Built React and Next.js apps in TypeScript backed by FastAPI and Node.js REST APIs. Containerised services with Docker and wrote Playwright end-to-end tests. Some PostgreSQL and Redis caching.`;

const SAMPLE_JD = `We are hiring a Senior Full-Stack Engineer. Required: React, Next.js, TypeScript, REST APIs, Docker, Kubernetes, Terraform, and observability with Prometheus. Experience with LLM integration is a plus.`;

function scoreColor(score: number): string {
  if (score >= 80) return "#059669";
  if (score >= 50) return "#d97706";
  return "#dc2626";
}

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(score, 100)) / 100) * c;
  return (
    <div
      className="relative grid h-40 w-40 place-items-center"
      role="img"
      aria-label={`Fit score ${score} out of 100`}
    >
      <svg className="h-40 w-40 -rotate-90" viewBox="0 0 130 130" aria-hidden="true">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-4xl font-black" style={{ color: scoreColor(score) }}>
          {score}
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          fit score
        </div>
      </div>
    </div>
  );
}

/**
 * Matched skills, each with the resume line it was found on (the "evidence"
 * that makes the score explainable). Required-tier skills are marked so a
 * missing required skill reads differently from a missing bonus.
 */
function MatchedSkills({
  skills,
  evidence,
  required,
}: {
  skills: string[];
  evidence: Record<string, string>;
  required: Set<string>;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Matched skills ({skills.length})
      </h3>
      {skills.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">—</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {skills.map((s) => (
            <li
              key={s}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-emerald-700">{s}</span>
                {!required.has(s) && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                    bonus
                  </span>
                )}
              </div>
              {evidence[s] && (
                <p className="mt-1 text-xs text-emerald-800/80">“{evidence[s]}”</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Missing skills, split so a missing *required* skill (a real gap) is visually
 * separated from a missing *nice-to-have* (a bonus you could add).
 */
function MissingSkills({
  missing,
  niceToHave,
}: {
  missing: string[];
  niceToHave: Set<string>;
}) {
  const requiredGaps = missing.filter((s) => !niceToHave.has(s));
  const bonusGaps = missing.filter((s) => niceToHave.has(s));
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Missing skills ({missing.length})
      </h3>
      {missing.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">—</p>
      ) : (
        <div className="mt-2 space-y-3">
          {requiredGaps.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-red-500">
                Required gaps
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {requiredGaps.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-medium text-red-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {bonusGaps.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">
                Nice to have
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                {bonusGaps.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function analyze() {
    setError("");
    setNotice("");
    setResult(null);
    if (!resume.trim() || !jd.trim()) {
      setError("Please provide both a resume and a job description.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume, job_description: jd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setResult(data as MatchResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Allow re-uploading the same file name later.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;

    setError("");
    setNotice("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read that file.");
      setResume(data.text ?? "");
      setNotice(`Loaded ${data.chars.toLocaleString()} characters from ${file.name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setUploading(false);
    }
  }

  function loadSample() {
    setResume(SAMPLE_RESUME);
    setJd(SAMPLE_JD);
    setError("");
    setNotice("");
    setResult(null);
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard is unavailable in this browser.");
    }
  }

  const requiredSet = new Set(result?.required_skills ?? []);
  const niceSet = new Set(result?.nice_to_have_skills ?? []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <h1 className="text-2xl font-bold tracking-tight">Resume ↔ JD Matcher</h1>
          <p className="mt-1 text-sm text-slate-500">
            Score how well a resume fits a job description, see matched & missing
            skills with the evidence behind each match, and get tailored suggestions.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Next.js", "TypeScript", "FastAPI", "LLM", "Playwright"].map((t) => (
              <span
                key={t}
                className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700" htmlFor="resume">
                Resume
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-xs font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700 disabled:text-indigo-300"
                >
                  {uploading ? "Reading…" : "Upload PDF / DOCX / TXT"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.markdown,.text"
                  className="hidden"
                  onChange={onFileChange}
                />
              </div>
            </div>
            <textarea
              id="resume"
              className="mt-2 h-56 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Paste the candidate resume text, or upload a file…"
              value={resume}
              onChange={(e) => setResume(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-700" htmlFor="jd">
              Job description
            </label>
            <textarea
              id="jd"
              className="mt-2 h-56 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Paste the target job description…"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={analyze}
            disabled={loading}
            className="inline-flex h-11 items-center rounded-md bg-indigo-600 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:bg-indigo-400"
          >
            {loading ? "Analyzing…" : "Analyze fit"}
          </button>
          <button
            onClick={loadSample}
            className="text-sm font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
          >
            Load a sample
          </button>
        </div>

        {notice && (
          <div
            aria-live="polite"
            className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700"
          >
            {notice}
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
          >
            {error}
          </div>
        )}

        {result && (
          <section
            aria-live="polite"
            className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-6">
              <ScoreRing score={result.fit_score} />
              <div className="flex-1">
                <p className="text-lg font-semibold">{result.summary}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Analysis provider: {result.provider}
                </p>
              </div>
              <button
                onClick={copyResult}
                className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {copied ? "Copied ✓" : "Copy JSON"}
              </button>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <MatchedSkills
                skills={result.matched_skills}
                evidence={result.evidence ?? {}}
                required={requiredSet}
              />
              <MissingSkills missing={result.missing_skills} niceToHave={niceSet} />
            </div>

            {result.extra_skills.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Extra skills — in the resume, not asked for ({result.extra_skills.length})
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.extra_skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-600"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Suggestions
              </h3>
              <ul className="mt-2 space-y-2">
                {result.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
