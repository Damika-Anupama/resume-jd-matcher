"use client";

import { useRef, useState } from "react";
// integration: rewrite to "@/lib/matching" + "@/lib/parse-file" and delete components/shims/
import { computeMatch, type MatchResult } from "./shims/matching";
import { MAX_TEXT_CHARS, parseResumeFile } from "./shims/parse-file";
import { MatcherForm } from "./matcher-form";
import { AnalysisResults } from "./analysis-results";
import { SAMPLE_JD, SAMPLE_RESUME } from "./sample-data";

/**
 * Client-side workspace: form + results. Analysis is a pure, synchronous
 * function call — no network request ever carries resume or JD text.
 */
export function MatcherWorkspace() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<MatchResult | null>(null);
  const [formError, setFormError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [reading, setReading] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const resultsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const formErrorRef = useRef<HTMLParagraphElement | null>(null);
  const resumeRef = useRef<HTMLTextAreaElement | null>(null);

  /** Focus after the state update has been committed and painted. */
  function focusSoon(el: () => HTMLElement | null) {
    requestAnimationFrame(() => el()?.focus());
  }

  function runAnalysis(resumeText: string, jdText: string) {
    setUploadError("");
    setUploadNotice("");
    if (!resumeText.trim() || !jdText.trim()) {
      setResult(null);
      setFormError("Add both a resume and a job description, then run the check again.");
      setAnnouncement("");
      focusSoon(() => formErrorRef.current);
      return;
    }
    setFormError("");
    const next = computeMatch(
      resumeText.slice(0, MAX_TEXT_CHARS),
      jdText.slice(0, MAX_TEXT_CHARS)
    );
    setResult(next);
    setAnnouncement(`Analysis complete. ${next.summary}`);
    focusSoon(() => resultsHeadingRef.current);
  }

  function loadSampleAndRun() {
    setResume(SAMPLE_RESUME);
    setJd(SAMPLE_JD);
    runAnalysis(SAMPLE_RESUME, SAMPLE_JD);
  }

  function clearAll() {
    setResume("");
    setJd("");
    setResult(null);
    setFormError("");
    setUploadError("");
    setUploadNotice("");
    setAnnouncement("All data cleared.");
    focusSoon(() => resumeRef.current);
  }

  async function handleFile(file: File) {
    setUploadError("");
    setUploadNotice("");
    setReading(true);
    try {
      const parsed = await parseResumeFile(file);
      if (!parsed.ok) {
        setUploadError(parsed.message);
        return;
      }
      setResume(parsed.text);
      setUploadNotice(
        `Loaded ${parsed.text.length.toLocaleString("en-US")} characters from ${file.name}.` +
          (parsed.truncated
            ? ` Text beyond ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters was trimmed.`
            : "")
      );
    } finally {
      setReading(false);
    }
  }

  return (
    <div>
      <MatcherForm
        resume={resume}
        jd={jd}
        reading={reading}
        formError={formError}
        uploadError={uploadError}
        uploadNotice={uploadNotice}
        formErrorRef={formErrorRef}
        resumeRef={resumeRef}
        onResumeChange={setResume}
        onJdChange={setJd}
        onAnalyze={() => runAnalysis(resume, jd)}
        onSample={loadSampleAndRun}
        onClear={clearAll}
        onFile={handleFile}
      />

      {/* Polite announcement so screen readers hear the outcome without losing place. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {result && (
        <AnalysisResults
          result={result}
          headingRef={resultsHeadingRef}
          onStartOver={clearAll}
        />
      )}
    </div>
  );
}
