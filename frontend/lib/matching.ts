/**
 * Deterministic resume <-> JD matching engine (TypeScript port).
 *
 * Implements the v2 match-result contract defined in
 * docs/adr/0001-privacy-first-demo-contract.md. The Python engine
 * (backend/app/matching.py) implements the identical algorithm; the two are
 * held in parity by shared fixtures (backend/tests/fixtures/contract_cases.json)
 * exercised from frontend/e2e/matching-parity.spec.ts. Strings, rounding and
 * ordering here are normative — do not change them without versioning the ADR.
 */

import SKILL_ALIASES_JSON from "./skills.json";

/**
 * Canonical skill dictionary. Generated from backend/app/skills.json (the single
 * source of truth for both matchers) by scripts/sync-skills.mjs — do NOT edit
 * lib/skills.json by hand. Edit the backend copy and run the sync script; CI
 * fails on drift so the Python and TypeScript matchers can never disagree.
 */
export const SKILL_ALIASES: Record<string, string[]> = SKILL_ALIASES_JSON;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Round a fraction (numerator/denominator) to the nearest integer using
 * round-half-to-even ("banker's rounding"), mirroring Python's built-in
 * `round()` used by backend/app/matching.py. JS `Math.round()` rounds halves
 * UP (12.5 -> 13), so it diverges from the backend on exact .5 percentages
 * (Python: 12.5 -> 12). Integer arithmetic is used so exact ties are detected
 * without any floating-point error. Keeping this in parity is a P0 invariant.
 */
function roundHalfEven(numerator: number, denominator: number): number {
  const q = Math.floor(numerator / denominator);
  const twiceRemainder = 2 * (numerator - q * denominator);
  if (twiceRemainder < denominator) return q;
  if (twiceRemainder > denominator) return q + 1;
  return q % 2 === 0 ? q : q + 1; // exact tie -> round to even
}

function aliasPattern(alias: string): RegExp {
  // Token-aware boundary: the leading guard excludes a preceding "." so a
  // short alias ("js"/"ts") does not match a file-extension suffix
  // ("next.js"); the trailing guard allows a following "." so a skill at a
  // sentence end ("...uses Python.") still matches. Mirrors matching.py.
  return new RegExp(`(?<![a-z0-9.])${escapeRegExp(alias)}(?![a-z0-9])`);
}

/**
 * Shared segmenter (ADR 0001, normative): line breaks AND sentence
 * terminators, used by JD tier classification, the resume negation filter and
 * evidence gathering so all three agree on segment boundaries.
 */
const SEGMENT_SPLITTER = /\r\n|\r|\n|(?<=[.;!])\s+/;

export function extractSkills(text: string): Set<string> {
  const lowered = ` ${text.toLowerCase()} `;
  const found = new Set<string>();
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    for (const alias of aliases) {
      if (aliasPattern(alias).test(lowered)) {
        found.add(canonical);
        break;
      }
    }
  }
  return found;
}

function lineMentionsSkill(lineLower: string, canonical: string): boolean {
  const padded = ` ${lineLower} `;
  return SKILL_ALIASES[canonical].some((alias) => aliasPattern(alias).test(padded));
}

/**
 * Negation / non-experience patterns (ADR 0001, normative — byte-identical
 * pattern list in backend/app/matching.py). A resume segment whose lowercased
 * text matches ANY of these contributes neither skill presence nor evidence.
 */
const NEGATION_PATTERNS: RegExp[] = [
  /\bno\s+(?:[a-z0-9.+#/-]+\s+){0,3}(?:experience|exposure|knowledge|background)\b/,
  /\bwithout\s+(?:[a-z0-9.+#/-]+\s+){0,3}(?:experience|exposure|knowledge)\b/,
  /\bnever\s+(?:used|worked|written|deployed|touched)\b/,
  /\bnot\s+(?:familiar|experienced|proficient|comfortable|skilled)\b/,
  /\bunfamiliar\s+with\b/,
  /\black(?:s|ing)?\s+(?:of\s+)?(?:experience|knowledge|exposure)\b/,
  /\b(?:want|wants|hope|hopes|hoping|plan|plans|planning|aspire|aspires|aspiring|eager|keen|willing)\s+to\s+learn\b/,
  /\b(?:currently|still)\s+learning\b/,
  /\binterested\s+in\s+learning\b/,
];

/** True when a resume segment is negated/non-experience (ADR 0001). */
export function isNonEvidenceSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  return NEGATION_PATTERNS.some((pattern) => pattern.test(lower));
}

/**
 * Extract resume skills with the negation filter applied: a skill counts as
 * present iff at least one mention occurs in a segment that is NOT
 * non-evidence. Mirrors extract_resume_skills() in backend/app/matching.py.
 */
export function extractResumeSkills(resumeText: string): Set<string> {
  const found = new Set<string>();
  for (const segment of resumeText.split(SEGMENT_SPLITTER)) {
    if (isNonEvidenceSegment(segment)) continue;
    const lower = segment.toLowerCase();
    for (const canonical of Object.keys(SKILL_ALIASES)) {
      if (!found.has(canonical) && lineMentionsSkill(lower, canonical)) {
        found.add(canonical);
      }
    }
  }
  return found;
}

// Cue phrases marking a JD line (or the section it heads) as nice-to-have.
// Kept byte-identical to backend/app/matching.py _NICE_TO_HAVE_CUES.
const NICE_TO_HAVE_CUES = [
  "nice to have",
  "nice-to-have",
  "nice to haves",
  "good to have",
  "would be a plus",
  "is a plus",
  "a plus",
  "bonus",
  "preferred",
  "desirable",
  "optional",
];

// Headers that re-open a required context. Mirrors _REQUIRED_SECTION_CUES.
const REQUIRED_SECTION_CUES = [
  "requirement",
  "responsibilit",
  "must have",
  "must-have",
  "required",
  "qualification",
  "what you",
  "you will",
  "you'll",
];

/**
 * Classify each JD skill as "required" or "nice_to_have". Conservative and
 * deterministic — a skill is only downgraded when every line that mentions it
 * sits in a nice-to-have context; anything unlocatable defaults to required.
 * Mirrors classify_jd_skills() in backend/app/matching.py.
 */
export function classifyJdSkills(
  jdText: string,
  jdSkills: Set<string>
): Record<string, "required" | "nice_to_have"> {
  // Segment on line breaks AND sentence terminators, so an inline "...is a
  // plus." clause is scoped to its own sentence. Mirrors classify_jd_skills().
  const segments = jdText.split(SEGMENT_SPLITTER);
  let sectionIsNice = false;
  const lineIsNice: boolean[] = [];
  for (const raw of segments) {
    const lower = raw.toLowerCase();
    const stripped = raw.trim();
    const hasNiceCue = NICE_TO_HAVE_CUES.some((cue) => lower.includes(cue));
    const hasRequiredCue = REQUIRED_SECTION_CUES.some((cue) => lower.includes(cue));
    const wordCount = stripped.split(/\s+/).filter(Boolean).length;
    const isHeaderish = stripped.endsWith(":") || wordCount <= 6;

    if (hasNiceCue && isHeaderish) {
      sectionIsNice = true;
      lineIsNice.push(true);
    } else if (hasNiceCue) {
      lineIsNice.push(true);
    } else if (hasRequiredCue && isHeaderish) {
      sectionIsNice = false;
      lineIsNice.push(false);
    } else {
      lineIsNice.push(sectionIsNice);
    }
  }

  const classification: Record<string, "required" | "nice_to_have"> = {};
  for (const skill of jdSkills) {
    const mentions: boolean[] = [];
    segments.forEach((raw, i) => {
      if (lineMentionsSkill(raw.toLowerCase(), skill)) mentions.push(lineIsNice[i]);
    });
    classification[skill] =
      mentions.length > 0 && mentions.every(Boolean) ? "nice_to_have" : "required";
  }
  return classification;
}

const MAX_EVIDENCE_CHARS = 200;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Map each matched skill to the first NON-NEGATED resume segment that mentions
 * it (collapsed, capped). Segments are the shared ADR segmenter, and segments
 * flagged by the negation filter never supply evidence (ADR 0001 rule 3).
 * Mirrors gather_evidence() in backend/app/matching.py.
 */
export function gatherEvidence(
  resumeText: string,
  matchedSkills: string[]
): Record<string, string> {
  const segments = resumeText.split(SEGMENT_SPLITTER).filter((s) => !isNonEvidenceSegment(s));
  const evidence: Record<string, string> = {};
  for (const skill of matchedSkills) {
    for (const raw of segments) {
      if (lineMentionsSkill(raw.toLowerCase(), skill)) {
        let snippet = collapse(raw);
        if (snippet.length > MAX_EVIDENCE_CHARS) {
          snippet = snippet.slice(0, MAX_EVIDENCE_CHARS - 1).replace(/\s+$/, "") + "…";
        }
        evidence[skill] = snippet;
        break;
      }
    }
  }
  return evidence;
}

/** v2 result contract — normative shape per ADR 0001. */
export interface MatchResult {
  schema_version: 2;
  status: "ok" | "insufficient_signal";
  /** Required-keyword coverage 0..100; 0 (not a score) when insufficient_signal. */
  fit_score: number;
  required_matched: string[];
  required_missing: string[];
  nice_to_have_matched: string[];
  nice_to_have_missing: string[];
  /** Legacy union fields (v1 consumers). */
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

// Summary strings — byte-identical to backend/app/matching.py (ADR 0001).
const SUMMARY_NO_JD_SKILLS =
  "No recognised skill keywords were found in the job description, so a coverage score was not computed.";
const SUMMARY_ONLY_NICE_TO_HAVE =
  "The job description lists only nice-to-have keywords, so a required-coverage score was not computed.";

/**
 * Suggestion composition (ADR 0001, normative order, cap 5, never encourages
 * fabricating experience). Insufficient signal returns [] before this runs.
 */
function composeSuggestions(
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

export function computeMatch(resumeText: string, jdText: string): MatchResult {
  const jdSkills = extractSkills(jdText);
  const resumeSkills = extractResumeSkills(resumeText);

  const tiers = classifyJdSkills(jdText, jdSkills);
  const required = [...jdSkills].filter((s) => tiers[s] === "required").sort();
  const niceToHave = [...jdSkills].filter((s) => tiers[s] === "nice_to_have").sort();

  const requiredMatched = required.filter((s) => resumeSkills.has(s));
  const requiredMissing = required.filter((s) => !resumeSkills.has(s));
  const niceToHaveMatched = niceToHave.filter((s) => resumeSkills.has(s));
  const niceToHaveMissing = niceToHave.filter((s) => !resumeSkills.has(s));

  const matched = [...requiredMatched, ...niceToHaveMatched].sort();
  const missing = [...requiredMissing, ...niceToHaveMissing].sort();
  const extra = [...resumeSkills].filter((s) => !jdSkills.has(s)).sort();
  const evidence = gatherEvidence(resumeText, matched);

  if (required.length === 0) {
    // insufficient_signal: no recognised required keywords (either no JD
    // skills at all, or every recognised JD skill is nice-to-have). fit_score
    // is 0 but MUST NOT be rendered as a score; suggestions stay empty.
    return {
      schema_version: 2,
      status: "insufficient_signal",
      fit_score: 0,
      required_matched: [],
      required_missing: [],
      nice_to_have_matched: niceToHaveMatched,
      nice_to_have_missing: niceToHaveMissing,
      matched_skills: matched,
      missing_skills: missing,
      extra_skills: extra,
      required_skills: [],
      nice_to_have_skills: niceToHave,
      summary: jdSkills.size === 0 ? SUMMARY_NO_JD_SKILLS : SUMMARY_ONLY_NICE_TO_HAVE,
      evidence,
      suggestions: [],
      provider: "deterministic",
    };
  }

  // fit_score = required-only coverage (ADR 0001 v2 semantics).
  const fit = roundHalfEven(100 * requiredMatched.length, required.length);
  const band = fit >= 80 ? "Strong coverage" : fit >= 50 ? "Partial coverage" : "Low coverage";
  const summary = `${band}: the resume covers ${requiredMatched.length} of ${required.length} required keywords (${fit}%).`;

  return {
    schema_version: 2,
    status: "ok",
    fit_score: fit,
    required_matched: requiredMatched,
    required_missing: requiredMissing,
    nice_to_have_matched: niceToHaveMatched,
    nice_to_have_missing: niceToHaveMissing,
    matched_skills: matched,
    missing_skills: missing,
    extra_skills: extra,
    required_skills: required,
    nice_to_have_skills: niceToHave,
    summary,
    evidence,
    suggestions: composeSuggestions(requiredMissing, niceToHaveMissing, matched),
    provider: "deterministic",
  };
}
