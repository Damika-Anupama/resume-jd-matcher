"use client";

import { useState, type ReactNode, type RefObject } from "react";
import type { MatchResult } from "@/lib/matching";
import {
  CheckIcon,
  CircleDashIcon,
  CopyIcon,
  CrossIcon,
  DownloadIcon,
  InfoIcon,
  ShieldIcon,
} from "./icons";

interface AnalysisResultsProps {
  result: MatchResult;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onStartOver: () => void;
}

function band(fit: number): { label: string; tone: "strong" | "partial" | "low" } {
  if (fit >= 80) return { label: "Strong coverage", tone: "strong" };
  if (fit >= 50) return { label: "Partial coverage", tone: "partial" };
  return { label: "Low coverage", tone: "low" };
}

const TONE_TEXT = {
  strong: "text-emerald-700",
  partial: "text-amber-800",
  low: "text-red-700",
} as const;

const TONE_BADGE = {
  strong: "border-emerald-200 bg-emerald-50 text-emerald-800",
  partial: "border-amber-200 bg-amber-50 text-amber-800",
  low: "border-red-200 bg-red-50 text-red-800",
} as const;

function ScoreRing({ fit }: { fit: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(fit, 100)) / 100) * c;
  const tone = band(fit).tone;
  return (
    <div
      className="relative grid h-36 w-36 shrink-0 place-items-center"
      role="img"
      aria-label={`Required keyword coverage: ${fit} percent.`}
    >
      <svg className="h-36 w-36 -rotate-90" viewBox="0 0 130 130" aria-hidden="true">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#e2e8f0" strokeWidth="11" />
        <circle
          cx="65"
          cy="65"
          r={r}
          fill="none"
          className={`stroke-current ${TONE_TEXT[tone]}`}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center" aria-hidden="true">
        <div
          data-testid="score-value"
          className={`text-4xl font-bold tabular-nums ${TONE_TEXT[tone]}`}
        >
          {fit}
          <span className="text-xl font-semibold">%</span>
        </div>
        <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          required
          <br />
          coverage
        </div>
      </div>
    </div>
  );
}

function ListSection({
  testId,
  title,
  count,
  emptyText,
  children,
}: {
  testId: string;
  title: string;
  count: number;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div data-testid={testId}>
      <h3 className="text-sm font-semibold text-slate-900">
        {title} <span className="font-normal text-slate-500">({count})</span>
      </h3>
      {count === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        children
      )}
    </div>
  );
}

/** Display-only cleanup: drop a leading bullet marker from an evidence line. */
function displayEvidence(snippet: string): string {
  return snippet.replace(/^[-•*–—]\s+/, "");
}

function buildPlanText(result: MatchResult): string {
  const lines: string[] = ["Improvement plan — resume ↔ JD keyword coverage", ""];
  lines.push(result.summary, "");
  lines.push("Required keywords not found in this resume:");
  if (result.required_missing.length === 0) {
    lines.push("- None — every recognised required keyword was found.");
  } else {
    for (const s of result.required_missing) lines.push(`- ${s}`);
  }
  lines.push("", "Nice-to-have keywords not found:");
  if (result.nice_to_have_missing.length === 0) {
    lines.push("- None");
  } else {
    for (const s of result.nice_to_have_missing) lines.push(`- ${s}`);
  }
  lines.push("", "Suggestions:");
  result.suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push(
    "",
    "Only add a skill when you can support it truthfully.",
    "Generated locally in the browser — no resume text is included."
  );
  return lines.join("\n");
}

function buildReportMarkdown(result: MatchResult): string {
  const list = (items: string[]) =>
    items.length === 0 ? "- _None_" : items.map((s) => `- ${s}`).join("\n");
  return [
    "# Keyword coverage report",
    "",
    "Generated locally in the browser by [Resume ↔ JD Matcher](https://github.com/Damika-Anupama/resume-jd-matcher).",
    "This report contains only skill keywords, the coverage score, and suggestions — never resume or job-description text.",
    "",
    `**${result.summary}**`,
    "",
    `## Required keywords matched (${result.required_matched.length})`,
    "",
    list(result.required_matched),
    "",
    `## Required keywords not found in this resume (${result.required_missing.length})`,
    "",
    list(result.required_missing),
    "",
    `## Nice-to-have keywords matched (${result.nice_to_have_matched.length})`,
    "",
    list(result.nice_to_have_matched),
    "",
    `## Nice-to-have keywords not found (${result.nice_to_have_missing.length})`,
    "",
    list(result.nice_to_have_missing),
    "",
    `## Also in the resume, not requested by this JD (${result.extra_skills.length})`,
    "",
    list(result.extra_skills),
    "",
    "## Improvement plan",
    "",
    result.suggestions.length === 0
      ? "_No suggestions — see the notes above._"
      : result.suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    "",
    "---",
    "",
    "_This is a directional keyword check, not an ATS prediction or an assessment of candidate ability._",
    "_Only add a skill when you can support it truthfully._",
    "",
  ].join("\n");
}

export function AnalysisResults({ result, headingRef, onStartOver }: AnalysisResultsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const insufficient = result.status === "insufficient_signal";
  const scoreBand = band(result.fit_score);
  const requiredTotal = result.required_matched.length + result.required_missing.length;

  async function copyPlan() {
    try {
      await navigator.clipboard.writeText(buildPlanText(result));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2500);
  }

  function downloadReport() {
    const blob = new Blob([buildReportMarkdown(result)], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keyword-coverage-report.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section
      data-testid="results-region"
      aria-labelledby="results-heading"
      className="mt-10 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
    >
      <h2
        id="results-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-bold text-slate-900"
      >
        Results
      </h2>

      {insufficient ? (
        <div
          data-testid="insufficient-state"
          className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <InfoIcon className="h-4 w-4 shrink-0 text-slate-600" />
            No coverage score for this job description
          </h3>
          <p className="mt-2 text-sm text-slate-700">{result.summary}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              Include the job ad’s requirements section — headings like
              “Requirements” or “Must have” tell the matcher which keywords are
              required.
            </li>
            <li>
              The dictionary covers common software-engineering skills, so very
              niche or non-technical roles may not be recognised.
            </li>
            <li>Try the sample above to see a job description that scores well.</li>
          </ul>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
          <ScoreRing fit={result.fit_score} />
          <div>
            <p
              data-testid="score-band"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${TONE_BADGE[scoreBand.tone]}`}
            >
              {scoreBand.tone === "strong" ? (
                <CheckIcon className="h-4 w-4 shrink-0" />
              ) : scoreBand.tone === "partial" ? (
                <CircleDashIcon className="h-4 w-4 shrink-0" />
              ) : (
                <CrossIcon className="h-4 w-4 shrink-0" />
              )}
              {scoreBand.label}
            </p>
            <p className="mt-2 text-base font-medium text-slate-900">{result.summary}</p>
            <p className="mt-1 text-sm text-slate-600">
              {result.fit_score}% = {result.required_matched.length} matched required
              keyword{result.required_matched.length === 1 ? "" : "s"} ÷ {requiredTotal}{" "}
              required in total. Nice-to-have keywords never change the score.
            </p>
          </div>
        </div>
      )}

      <div className="mt-7 grid gap-6 lg:grid-cols-2">
        {!insufficient && (
          <ListSection
            testId="required-matched-list"
            title="Required keywords matched"
            count={result.required_matched.length}
            emptyText="None of the required keywords were found."
          >
            <ul className="mt-2 space-y-2">
              {result.required_matched.map((s) => (
                <li
                  key={s}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                    <CheckIcon className="h-4 w-4 shrink-0" />
                    {s}
                  </span>
                  {result.evidence[s] && (
                    <p className="mt-1 break-words pl-[22px] text-xs text-emerald-900/80">
                      “{displayEvidence(result.evidence[s])}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </ListSection>
        )}

        {!insufficient && (
          <ListSection
            testId="required-missing-list"
            title="Required keywords not found in this resume"
            count={result.required_missing.length}
            emptyText="None — every recognised required keyword was found."
          >
            <ul className="mt-2 flex flex-wrap gap-2">
              {result.required_missing.map((s) => (
                <li
                  key={s}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800"
                >
                  <CrossIcon className="h-3.5 w-3.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </ListSection>
        )}

        {(result.nice_to_have_matched.length > 0 || !insufficient) && (
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              Nice-to-have keywords matched{" "}
              <span className="font-normal text-slate-500">
                ({result.nice_to_have_matched.length})
              </span>
            </h3>
            {result.nice_to_have_matched.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {result.nice_to_have_matched.map((s) => (
                  <li
                    key={s}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
                  >
                    <CheckIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ListSection
          testId="nice-missing-list"
          title="Nice-to-have keywords not found"
          count={result.nice_to_have_missing.length}
          emptyText="None"
        >
          <p className="mt-1 text-xs text-slate-500">
            Optional in the job ad — these don’t affect the score.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {result.nice_to_have_missing.map((s) => (
              <li
                key={s}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-600"
              >
                <CircleDashIcon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                {s}
              </li>
            ))}
          </ul>
        </ListSection>

        <ListSection
          testId="extra-skills-list"
          title="Also in the resume, not requested by this JD"
          count={result.extra_skills.length}
          emptyText="None"
        >
          <ul className="mt-2 flex flex-wrap gap-2">
            {result.extra_skills.map((s) => (
              <li
                key={s}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-600"
              >
                {s}
              </li>
            ))}
          </ul>
        </ListSection>
      </div>

      {!insufficient && (
        <div className="mt-7">
          <h3 className="text-sm font-semibold text-slate-900">Improvement plan</h3>
          <p className="mt-1 text-sm text-slate-600">
            Only add a skill when you can support it truthfully.
          </p>
          <ol data-testid="suggestions-list" className="mt-3 space-y-2">
            {result.suggestions.map((s, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
              >
                <span
                  className="select-none font-semibold text-indigo-700"
                  aria-hidden="true"
                >
                  {i + 1}.
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
        {!insufficient && (
          <>
            <button
              type="button"
              data-testid="copy-plan-button"
              aria-live="polite"
              onClick={copyPlan}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <CopyIcon className="h-4 w-4 shrink-0" />
              {copyState === "copied"
                ? "Copied"
                : copyState === "failed"
                  ? "Clipboard unavailable"
                  : "Copy improvement plan"}
            </button>
            <button
              type="button"
              data-testid="download-report-button"
              onClick={downloadReport}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            >
              <DownloadIcon className="h-4 w-4 shrink-0" />
              Download report (.md)
            </button>
          </>
        )}
        <button
          type="button"
          data-testid="start-over-button"
          onClick={onStartOver}
          className="inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium text-indigo-700 underline-offset-2 transition-colors hover:underline"
        >
          Start another comparison
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <ShieldIcon className="h-3.5 w-3.5 shrink-0" />
        Private, deterministic analysis — computed in your browser; the report
        contains only skill keywords and the score, never your resume text.
      </p>
    </section>
  );
}
