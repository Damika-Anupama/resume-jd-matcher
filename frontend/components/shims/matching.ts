// integration: remove, provided by @/lib
//
// Thin local shim over today's v1 `@/lib/matching` so this worktree compiles
// and behaves per the v2 result contract (docs/adr/0001) while Agent 3
// upgrades the lib in parallel.
//
// At integration, Agent 1 should:
//   1. delete frontend/components/shims/ entirely, and
//   2. rewrite every `@/components/shims/matching` import to `@/lib/matching`
//      and every `@/components/shims/parse-file` import to `@/lib/parse-file`.
//
// Known shim limitation (fixed by the real v2 lib): the v1 engine has no
// negation filter, so `evidence` here may include negated resume segments.

import { computeMatch as computeMatchV1 } from "@/lib/matching";

export type MatchStatus = "ok" | "insufficient_signal";

/** v2 result schema — mirrors docs/adr/0001 exactly. */
export interface MatchResult {
  schema_version: 2;
  status: MatchStatus;
  /** Required-keyword coverage 0..100; 0 (and never rendered as a score) when insufficient_signal. */
  fit_score: number;
  required_matched: string[];
  required_missing: string[];
  nice_to_have_matched: string[];
  nice_to_have_missing: string[];
  /** Legacy union fields kept for compatibility. */
  matched_skills: string[];
  missing_skills: string[];
  extra_skills: string[];
  required_skills: string[];
  nice_to_have_skills: string[];
  summary: string;
  evidence: Record<string, string>;
  suggestions: string[];
  provider: "deterministic";
}

/** Python-style round-half-to-even, mirrored from lib/matching. */
function roundHalfEven(numerator: number, denominator: number): number {
  const q = Math.floor(numerator / denominator);
  const twiceRemainder = 2 * (numerator - q * denominator);
  if (twiceRemainder < denominator) return q;
  if (twiceRemainder > denominator) return q + 1;
  return q % 2 === 0 ? q : q + 1;
}

function buildSuggestions(
  requiredMissing: string[],
  niceToHaveMissing: string[],
  matched: string[]
): string[] {
  const suggestions: string[] = [];
  for (const skill of requiredMissing.slice(0, 3)) {
    suggestions.push(
      `If you genuinely have ${skill} experience, add a concrete example — a project, metric, or responsibility that shows hands-on use.`
    );
  }
  if (niceToHaveMissing.length > 0) {
    suggestions.push(
      `Optional keywords not found: ${niceToHaveMissing.join(", ")}. Only add one if you can support it truthfully.`
    );
  }
  if (requiredMissing.length === 0) {
    suggestions.push(
      "All recognised required keywords are covered — emphasise depth and impact (metrics, scale, ownership) for your matched skills."
    );
  }
  if (matched.length > 0) {
    suggestions.push(
      `Lead with your strongest matched skills (${matched.slice(0, 3).join(", ")}) near the top of the resume so they are seen first.`
    );
  }
  return suggestions.slice(0, 5);
}

/**
 * v2-shaped computeMatch. If the underlying lib already returns a v2 payload
 * (i.e. Agent 3's upgrade landed before this shim is deleted), it is passed
 * through untouched; otherwise the v1 payload is adapted per the ADR.
 */
export function computeMatch(resumeText: string, jdText: string): MatchResult {
  const v1 = computeMatchV1(resumeText, jdText);
  if ("schema_version" in v1) return v1 as unknown as MatchResult;

  const required = v1.required_skills;
  const niceToHave = v1.nice_to_have_skills;
  const matchedSet = new Set(v1.matched_skills);

  const requiredMatched = required.filter((s) => matchedSet.has(s));
  const requiredMissing = required.filter((s) => !matchedSet.has(s));
  const niceMatched = niceToHave.filter((s) => matchedSet.has(s));
  const niceMissing = niceToHave.filter((s) => !matchedSet.has(s));

  const status: MatchStatus = required.length === 0 ? "insufficient_signal" : "ok";
  const fit =
    status === "ok" ? roundHalfEven(100 * requiredMatched.length, required.length) : 0;

  let summary: string;
  if (status === "ok") {
    const band =
      fit >= 80 ? "Strong coverage" : fit >= 50 ? "Partial coverage" : "Low coverage";
    summary = `${band}: the resume covers ${requiredMatched.length} of ${required.length} required keywords (${fit}%).`;
  } else if (niceToHave.length === 0) {
    summary =
      "No recognised skill keywords were found in the job description, so a coverage score was not computed.";
  } else {
    summary =
      "The job description lists only nice-to-have keywords, so a required-coverage score was not computed.";
  }

  return {
    schema_version: 2,
    status,
    fit_score: fit,
    required_matched: requiredMatched,
    required_missing: requiredMissing,
    nice_to_have_matched: niceMatched,
    nice_to_have_missing: niceMissing,
    matched_skills: v1.matched_skills,
    missing_skills: v1.missing_skills,
    extra_skills: v1.extra_skills,
    required_skills: required,
    nice_to_have_skills: niceToHave,
    summary,
    evidence: v1.evidence ?? {},
    suggestions:
      status === "ok"
        ? buildSuggestions(requiredMissing, niceMissing, v1.matched_skills)
        : [],
    provider: "deterministic",
  };
}
