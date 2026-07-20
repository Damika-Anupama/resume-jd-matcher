/**
 * Deterministic resume <-> JD matching engine (TypeScript port).
 *
 * Mirrors backend/app/matching.py so the Vercel deployment is fully
 * self-contained (no Python backend needed live) while staying reproducible.
 * The structured score here is identical in spirit to the backend's.
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
  const segments = jdText.split(/\r\n|\r|\n|(?<=[.;!])\s+/);
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
 * Map each matched skill to the first resume line that mentions it (collapsed,
 * capped). Mirrors gather_evidence() in backend/app/matching.py.
 */
export function gatherEvidence(
  resumeText: string,
  matchedSkills: string[]
): Record<string, string> {
  const lines = resumeText.split(/\r\n|\r|\n/);
  const evidence: Record<string, string> = {};
  for (const skill of matchedSkills) {
    for (const raw of lines) {
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

export interface MatchResult {
  fit_score: number;
  matched_skills: string[];
  missing_skills: string[];
  extra_skills: string[];
  summary: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  evidence: Record<string, string>;
  suggestions: string[];
  provider: string;
}

function mockSuggestions(missing: string[], matched: string[]): string[] {
  const suggestions: string[] = [];
  for (const skill of missing.slice(0, 5)) {
    suggestions.push(
      `Add concrete evidence of ${skill} — a project, metric, or responsibility that demonstrates hands-on use.`
    );
  }
  if (missing.length === 0) {
    suggestions.push(
      "Strong coverage — emphasise depth and impact (metrics, scale, ownership) for the matched skills rather than adding new ones."
    );
  }
  if (matched.length > 0) {
    suggestions.push(
      `Lead with your strongest matched skills (${matched.slice(0, 3).join(", ")}) near the top of the resume so they are seen first.`
    );
  }
  return suggestions;
}

export function computeMatch(resumeText: string, jdText: string): MatchResult {
  const jdSkills = extractSkills(jdText);
  const resumeSkills = extractSkills(resumeText);

  if (jdSkills.size === 0) {
    return {
      fit_score: 0,
      matched_skills: [],
      missing_skills: [],
      extra_skills: [...resumeSkills].sort(),
      summary: "No recognised target skills were found in the job description.",
      required_skills: [],
      nice_to_have_skills: [],
      evidence: {},
      suggestions: [],
      provider: "mock",
    };
  }

  const matched = [...jdSkills].filter((s) => resumeSkills.has(s)).sort();
  const missing = [...jdSkills].filter((s) => !resumeSkills.has(s)).sort();
  const extra = [...resumeSkills].filter((s) => !jdSkills.has(s)).sort();
  const fit = roundHalfEven(100 * matched.length, jdSkills.size);

  const band = fit >= 80 ? "Strong match" : fit >= 50 ? "Partial match" : "Weak match";
  const summary = `${band}: the resume covers ${matched.length} of ${jdSkills.size} required skills (${fit}%).`;

  const tiers = classifyJdSkills(jdText, jdSkills);
  const required = [...jdSkills].filter((s) => tiers[s] === "required").sort();
  const niceToHave = [...jdSkills].filter((s) => tiers[s] === "nice_to_have").sort();
  const evidence = gatherEvidence(resumeText, matched);

  return {
    fit_score: fit,
    matched_skills: matched,
    missing_skills: missing,
    extra_skills: extra,
    summary,
    required_skills: required,
    nice_to_have_skills: niceToHave,
    evidence,
    suggestions: mockSuggestions(missing, matched),
    provider: "mock",
  };
}
