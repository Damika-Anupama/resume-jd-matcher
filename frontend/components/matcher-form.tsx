"use client";

import type { RefObject } from "react";
// integration: rewrite to "@/lib/parse-file" and delete components/shims/
import { MAX_TEXT_CHARS, SUPPORTED_EXTENSIONS } from "./shims/parse-file";
import { CheckIcon, ShieldIcon } from "./icons";

interface MatcherFormProps {
  resume: string;
  jd: string;
  reading: boolean;
  formError: string;
  uploadError: string;
  uploadNotice: string;
  formErrorRef: RefObject<HTMLParagraphElement | null>;
  resumeRef: RefObject<HTMLTextAreaElement | null>;
  onResumeChange: (value: string) => void;
  onJdChange: (value: string) => void;
  onAnalyze: () => void;
  onSample: () => void;
  onClear: () => void;
  onFile: (file: File) => void;
}

function CharCounter({ id, length }: { id: string; length: number }) {
  const limit = MAX_TEXT_CHARS.toLocaleString("en-US");
  return (
    <p id={id} className="mt-1.5 text-xs tabular-nums text-slate-500">
      {length.toLocaleString("en-US")} / {limit} characters
    </p>
  );
}

export function MatcherForm({
  resume,
  jd,
  reading,
  formError,
  uploadError,
  uploadNotice,
  formErrorRef,
  resumeRef,
  onResumeChange,
  onJdChange,
  onAnalyze,
  onSample,
  onClear,
  onFile,
}: MatcherFormProps) {
  return (
    <form
      aria-labelledby="workspace-heading"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onAnalyze();
      }}
    >
      <h2 id="workspace-heading" className="sr-only">
        Compare a resume with a job description
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Resume column */}
        <div>
          <label htmlFor="resume" className="block text-sm font-semibold text-slate-900">
            Resume
          </label>
          <p id="resume-hint" className="mt-1 text-xs text-slate-600">
            Paste the resume text, or upload a file below. Everything is
            processed on this page — nothing is sent to a server.
          </p>
          <textarea
            id="resume"
            data-testid="resume-input"
            ref={resumeRef}
            value={resume}
            onChange={(e) => onResumeChange(e.target.value)}
            maxLength={MAX_TEXT_CHARS}
            rows={11}
            aria-describedby="resume-hint resume-count"
            placeholder="Paste the resume text here…"
            className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500"
          />
          <CharCounter id="resume-count" length={resume.length} />

          <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
            <label
              htmlFor="resume-file"
              className="block text-sm font-medium text-slate-900"
            >
              Or upload a resume file
            </label>
            <input
              id="resume-file"
              data-testid="file-input"
              type="file"
              accept={SUPPORTED_EXTENSIONS.join(",")}
              disabled={reading}
              aria-describedby="file-hint file-privacy"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so re-selecting the same file fires change again.
                e.target.value = "";
                if (file) onFile(file);
              }}
              className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-slate-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
            />
            <p id="file-hint" className="mt-2 text-xs text-slate-600">
              {SUPPORTED_EXTENSIONS.join(", ")} · up to 5 MB · text beyond{" "}
              {MAX_TEXT_CHARS.toLocaleString("en-US")} characters is trimmed.
            </p>
            <p
              id="file-privacy"
              className="mt-1 flex items-center gap-1.5 text-xs text-slate-600"
            >
              <ShieldIcon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              Processed locally — this file never leaves your browser.
            </p>
            {reading && (
              <p className="mt-2 text-xs font-medium text-slate-700" aria-live="polite">
                Reading file…
              </p>
            )}
            {uploadError && (
              <p
                data-testid="upload-error"
                role="alert"
                className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
              >
                {uploadError}
              </p>
            )}
            {uploadNotice && (
              <p
                aria-live="polite"
                className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"
              >
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {uploadNotice}
              </p>
            )}
          </div>
        </div>

        {/* Job description column */}
        <div>
          <label htmlFor="jd" className="block text-sm font-semibold text-slate-900">
            Job description
          </label>
          <p id="jd-hint" className="mt-1 text-xs text-slate-600">
            Paste the full ad — keeping the “Requirements” and “Nice to have”
            sections improves how keywords are tiered.
          </p>
          <textarea
            id="jd"
            data-testid="jd-input"
            value={jd}
            onChange={(e) => onJdChange(e.target.value)}
            maxLength={MAX_TEXT_CHARS}
            rows={11}
            aria-describedby="jd-hint jd-count"
            placeholder="Paste the job description here…"
            className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500"
          />
          <CharCounter id="jd-count" length={jd.length} />
        </div>
      </div>

      {formError && (
        <p
          ref={formErrorRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
        >
          {formError}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          data-testid="analyze-button"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Check keyword coverage
        </button>
        <button
          type="button"
          data-testid="sample-button"
          onClick={onSample}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
        >
          Try a sample
        </button>
        <button
          type="button"
          data-testid="clear-button"
          onClick={onClear}
          className="inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium text-slate-600 underline-offset-2 transition-colors hover:text-slate-900 hover:underline"
        >
          Clear data
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        The sample uses fictional data and runs the check instantly.
      </p>
    </form>
  );
}
