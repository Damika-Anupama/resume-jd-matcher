"use client";

import { useState } from "react";
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
    <div className="relative grid h-40 w-40 place-items-center">
      <svg className="h-40 w-40 -rotate-90" viewBox="0 0 130 130">
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

function SkillPills({
  title,
  skills,
  tone,
}: {
  title: string;
  skills: string[];
  tone: "green" | "red" | "slate";
}) {
  const toneClass = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-700 border-red-200",
    slate: "bg-slate-50 text-slate-600 border-slate-200",
  }[tone];
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} ({skills.length})
      </h3>
      <div className="mt-2 flex flex-wrap gap-2">
        {skills.length === 0 ? (
          <span className="text-sm text-slate-400">—</span>
        ) : (
          skills.map((s) => (
            <span
              key={s}
              className={`rounded-full border px-3 py-1 text-sm font-medium ${toneClass}`}
            >
              {s}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setError("");
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

  function loadSample() {
    setResume(SAMPLE_RESUME);
    setJd(SAMPLE_JD);
    setError("");
    setResult(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <h1 className="text-2xl font-bold tracking-tight">Resume ↔ JD Matcher</h1>
          <p className="mt-1 text-sm text-slate-500">
            Score how well a resume fits a job description, see matched & missing
            skills, and get tailored suggestions.
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
            <label className="text-sm font-semibold text-slate-700" htmlFor="resume">
              Resume
            </label>
            <textarea
              id="resume"
              className="mt-2 h-56 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              placeholder="Paste the candidate resume text…"
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

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {result && (
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-6">
              <ScoreRing score={result.fit_score} />
              <div className="flex-1">
                <p className="text-lg font-semibold">{result.summary}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Analysis provider: {result.provider}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <SkillPills title="Matched skills" skills={result.matched_skills} tone="green" />
              <SkillPills title="Missing skills" skills={result.missing_skills} tone="red" />
            </div>

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
