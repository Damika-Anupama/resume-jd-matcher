"""Deterministic resume ↔ JD matching engine (contract v2).

This module contains the pure, testable core of the matcher: skill extraction,
tier classification, negation filtering, overlap scoring, and deterministic
suggestions. It has **no** external dependencies and is fully deterministic,
which makes it ideal for:

- the `deterministic` provider (so the app and its tests run with no API key),
- the browser-local TypeScript port (mirrored byte-for-byte from the same ADR),
- and the evaluation harness (golden-set scoring).

The normative contract lives in docs/adr/0001-privacy-first-demo-contract.md.
Highlights (schema_version 2):

- ``fit_score`` is **required-keyword coverage**:
  ``round(100 * |required ∩ resume| / |required|)`` with Python banker's
  rounding. Nice-to-have skills never enter the denominator.
- ``status`` is ``"insufficient_signal"`` when the recognised required list is
  empty (no JD skills at all, or all recognised skills are nice-to-have);
  the UI must not render ``fit_score`` as a score in that case.
- Resume segments matching the negation / non-experience patterns ("No X
  experience", "eager to learn X", …) contribute neither skill presence nor
  evidence. This applies to the resume only; JD-side negation is a documented
  limitation, as are years-of-experience, proficiency, and recency.
- ``suggestions`` are deterministic templates composed here (the canonical
  source); an optional LLM provider may replace them, never the score.

Legacy v1 fields (``matched_skills``/``missing_skills`` unions, tier lists,
``extra_skills``, ``summary``, ``evidence``) are retained for compatibility.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

# A compact, extensible skill dictionary. Canonical name -> alias patterns.
#
# This JSON file is the SINGLE SOURCE OF TRUTH for both the Python matcher and
# the TypeScript port (frontend/lib/matching.ts). The frontend copy
# (frontend/lib/skills.json) is generated from this file by
# `scripts/sync-skills.mjs`, and CI fails on drift, so the two matchers can
# never disagree on which skills exist.
_SKILLS_PATH = Path(__file__).with_name("skills.json")
SKILL_ALIASES: dict[str, list[str]] = json.loads(_SKILLS_PATH.read_text(encoding="utf-8"))

SCHEMA_VERSION = 2

# Longest evidence snippet returned per matched skill. Long enough to carry a
# full bullet point, short enough that the response stays compact and the UI can
# render it on one or two lines.
_MAX_EVIDENCE_CHARS = 200

# Shared segmenter: line breaks AND sentence terminators. Used identically for
# JD tier classification and resume negation filtering (mirrored in the TS
# port), so an inline "...is a plus." clause or a "No X experience." sentence is
# scoped to its own segment rather than tainting a whole line.
_SEGMENT_SPLITTER = re.compile(r"(?:\r\n|\r|\n|(?<=[.;!])\s+)")

# Negation / non-experience patterns (normative list from ADR 0001, identical
# in the TS port). A resume segment whose lowercased text matches ANY of these
# contributes neither skill presence nor evidence.
NON_EVIDENCE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(p)
    for p in (
        r"\bno\s+(?:[a-z0-9.+#/-]+\s+){0,3}(?:experience|exposure|knowledge|background)\b",
        r"\bwithout\s+(?:[a-z0-9.+#/-]+\s+){0,3}(?:experience|exposure|knowledge)\b",
        r"\bnever\s+(?:used|worked|written|deployed|touched)\b",
        r"\bnot\s+(?:familiar|experienced|proficient|comfortable|skilled)\b",
        r"\bunfamiliar\s+with\b",
        r"\black(?:s|ing)?\s+(?:of\s+)?(?:experience|knowledge|exposure)\b",
        r"\b(?:want|wants|hope|hopes|hoping|plan|plans|planning|aspire|aspires"
        r"|aspiring|eager|keen|willing)\s+to\s+learn\b",
        r"\b(?:currently|still)\s+learning\b",
        r"\binterested\s+in\s+learning\b",
    )
]

# Summary strings (byte-identical in the TS port — do not edit casually).
SUMMARY_NO_JD_SKILLS = (
    "No recognised skill keywords were found in the job description, "
    "so a coverage score was not computed."
)
SUMMARY_ONLY_NICE_TO_HAVE = (
    "The job description lists only nice-to-have keywords, "
    "so a required-coverage score was not computed."
)

# Cue phrases that mark a job-description line (or the section it heads) as
# describing *nice-to-have* rather than *required* skills. Deliberately
# multi-word / unambiguous to avoid false positives (e.g. a bare "plus" would
# wrongly fire on "C++ plus microservices"); the classification only ever
# *downgrades* a skill, and the default is the safe "required".
_NICE_TO_HAVE_CUES = (
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
)

# Section headers that explicitly re-open a *required* context, so a bulleted
# "Requirements:" list after a "Nice to have:" block is scored as required.
_REQUIRED_SECTION_CUES = (
    "requirement",
    "responsibilit",
    "must have",
    "must-have",
    "required",
    "qualification",
    "what you",
    "you will",
    "you'll",
)


def _alias_pattern(alias: str) -> re.Pattern[str]:
    """Compile the token-aware boundary matcher for a single alias.

    The leading guard excludes a preceding "." as well as alphanumerics, so a
    short alias like "js"/"ts" does NOT match the file-extension suffix of a
    larger token ("next.js", "node.ts"). The trailing guard intentionally allows
    a following "." so that a skill at the end of a sentence ("...uses Python.")
    still matches.
    """
    return re.compile(r"(?<![a-z0-9.])" + re.escape(alias) + r"(?![a-z0-9])")


def split_segments(text: str) -> list[str]:
    """Split text into the segments used for tiering and negation filtering."""
    return _SEGMENT_SPLITTER.split(text)


def is_non_evidence_segment(segment: str) -> bool:
    """True when a resume segment is negated/aspirational (per ADR 0001)."""
    lowered = segment.lower()
    return any(p.search(lowered) for p in NON_EVIDENCE_PATTERNS)


def extract_skills(text: str) -> set[str]:
    """Return the canonical skills mentioned in a block of text (no negation)."""
    lowered = f" {text.lower()} "
    found: set[str] = set()
    for canonical, aliases in SKILL_ALIASES.items():
        for alias in aliases:
            if _alias_pattern(alias).search(lowered):
                found.add(canonical)
                break
    return found


def extract_resume_skills(text: str) -> set[str]:
    """Extract skills from a resume, ignoring negated/aspirational segments.

    A skill counts as present iff at least one mention occurs in a segment that
    is NOT non-evidence ("5 years of Python. No Kubernetes experience." yields
    python but not kubernetes).
    """
    found: set[str] = set()
    for segment in split_segments(text):
        if not segment or is_non_evidence_segment(segment):
            continue
        found |= extract_skills(segment)
    return found


def _line_mentions_skill(line_lower: str, canonical: str) -> bool:
    """True if any alias of ``canonical`` appears in an already-lowercased line."""
    padded = f" {line_lower} "
    for alias in SKILL_ALIASES[canonical]:
        if _alias_pattern(alias).search(padded):
            return True
    return False


def classify_jd_skills(jd_text: str, jd_skills: set[str]) -> dict[str, str]:
    """Classify each JD skill as ``"required"`` or ``"nice_to_have"``.

    Deterministic and conservative: a skill is only downgraded to
    ``nice_to_have`` when *every* line that mentions it sits in a nice-to-have
    context. Any mention in a required (or neutral) line keeps it ``required``,
    and a skill with no locatable line defaults to ``required``.
    """
    segments = split_segments(jd_text)
    section_is_nice = False
    line_is_nice: list[bool] = []
    for raw in segments:
        lower = raw.lower()
        stripped = raw.strip()
        has_nice_cue = any(cue in lower for cue in _NICE_TO_HAVE_CUES)
        has_required_cue = any(cue in lower for cue in _REQUIRED_SECTION_CUES)
        is_headerish = stripped.endswith(":") or len(stripped.split()) <= 6

        if has_nice_cue and is_headerish:
            # e.g. "Nice to have:" — opens a nice-to-have section.
            section_is_nice = True
            line_is_nice.append(True)
        elif has_nice_cue:
            # Inline cue ("Kubernetes is a plus") — this line only.
            line_is_nice.append(True)
        elif has_required_cue and is_headerish:
            # e.g. "Requirements:" — re-opens a required section.
            section_is_nice = False
            line_is_nice.append(False)
        else:
            line_is_nice.append(section_is_nice)

    classification: dict[str, str] = {}
    for skill in jd_skills:
        mentions = [
            line_is_nice[i]
            for i, raw in enumerate(segments)
            if _line_mentions_skill(raw.lower(), skill)
        ]
        # Only nice if it was located AND every mention is in a nice context.
        classification[skill] = (
            "nice_to_have" if mentions and all(mentions) else "required"
        )
    return classification


def _collapse(text: str) -> str:
    """Collapse runs of whitespace to single spaces and strip the ends."""
    return re.sub(r"\s+", " ", text).strip()


def gather_evidence(resume_text: str, matched_skills: list[str]) -> dict[str, str]:
    """Map each matched skill to the first non-negated segment mentioning it.

    Returns a whitespace-collapsed snippet capped at ``_MAX_EVIDENCE_CHARS`` so
    the UI can show *where* a skill was found. Negated/aspirational segments
    never supply evidence (ADR 0001). Deterministic (first match wins, scanning
    segments top-to-bottom) and mirrored byte-for-byte by the TS port.
    """
    segments = [s for s in split_segments(resume_text) if s.strip()]
    if not segments:
        segments = [resume_text]
    evidence: dict[str, str] = {}
    for skill in matched_skills:
        for raw in segments:
            if is_non_evidence_segment(raw):
                continue
            if _line_mentions_skill(raw.lower(), skill):
                snippet = _collapse(raw)
                if len(snippet) > _MAX_EVIDENCE_CHARS:
                    snippet = snippet[: _MAX_EVIDENCE_CHARS - 1].rstrip() + "…"
                evidence[skill] = snippet
                break
    return evidence


def build_suggestions(
    required_missing: list[str],
    nice_to_have_missing: list[str],
    matched_skills: list[str],
) -> list[str]:
    """Deterministic suggestion composition (normative order from ADR 0001).

    1. Up to 3 required-missing items — phrased so we never encourage
       fabricating experience.
    2. One aggregated nice-to-have item.
    3. The all-required-covered item (only when nothing required is missing).
    4. The lead-with-strengths item.
    Capped at 5. Callers must pass [] lists for insufficient_signal (which
    yields no suggestions at the compute_match level).
    """
    suggestions: list[str] = []
    for skill in required_missing[:3]:
        suggestions.append(
            f"If you genuinely have {skill} experience, add a concrete example "
            f"— a project, metric, or responsibility that shows hands-on use."
        )
    if nice_to_have_missing:
        listed = ", ".join(nice_to_have_missing)
        suggestions.append(
            f"Optional keywords not found: {listed}. "
            f"Only add one if you can support it truthfully."
        )
    if not required_missing:
        suggestions.append(
            "All recognised required keywords are covered — emphasise depth "
            "and impact (metrics, scale, ownership) for your matched skills."
        )
    if matched_skills:
        top = ", ".join(matched_skills[:3])
        suggestions.append(
            f"Lead with your strongest matched skills ({top}) near the top of "
            f"the resume so they are seen first."
        )
    return suggestions[:5]


@dataclass
class MatchResult:
    fit_score: int  # 0..100 — REQUIRED-keyword coverage (v2)
    status: str = "ok"  # "ok" | "insufficient_signal"
    required_matched: list[str] = field(default_factory=list)
    required_missing: list[str] = field(default_factory=list)
    nice_to_have_matched: list[str] = field(default_factory=list)
    nice_to_have_missing: list[str] = field(default_factory=list)
    # Legacy v1 fields (unions / tier lists), kept for compatibility:
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    extra_skills: list[str] = field(default_factory=list)
    summary: str = ""
    required_skills: list[str] = field(default_factory=list)
    nice_to_have_skills: list[str] = field(default_factory=list)
    evidence: dict[str, str] = field(default_factory=dict)
    suggestions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "schema_version": SCHEMA_VERSION,
            "status": self.status,
            "fit_score": self.fit_score,
            "required_matched": self.required_matched,
            "required_missing": self.required_missing,
            "nice_to_have_matched": self.nice_to_have_matched,
            "nice_to_have_missing": self.nice_to_have_missing,
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "extra_skills": self.extra_skills,
            "summary": self.summary,
            "required_skills": self.required_skills,
            "nice_to_have_skills": self.nice_to_have_skills,
            "evidence": self.evidence,
            "suggestions": self.suggestions,
        }


def compute_match(resume_text: str, jd_text: str) -> MatchResult:
    """Score how well a resume covers a job description's REQUIRED keywords.

    v2 contract (ADR 0001): tier classification runs first, then
    ``fit_score = round(100 * |required ∩ resume| / |required|)`` (banker's
    rounding, matching the TS port). When the required list is empty the result
    is ``insufficient_signal`` with fit_score 0 and no suggestions; nice-to-have
    coverage is still reported when present.
    """
    jd_skills = extract_skills(jd_text)
    tiers = classify_jd_skills(jd_text, jd_skills)
    required = sorted(s for s in jd_skills if tiers[s] == "required")
    nice_to_have = sorted(s for s in jd_skills if tiers[s] == "nice_to_have")

    resume_skills = extract_resume_skills(resume_text)

    required_matched = sorted(set(required) & resume_skills)
    required_missing = sorted(set(required) - resume_skills)
    nice_matched = sorted(set(nice_to_have) & resume_skills)
    nice_missing = sorted(set(nice_to_have) - resume_skills)

    matched = sorted(set(required_matched) | set(nice_matched))
    missing = sorted(set(required_missing) | set(nice_missing))
    extra = sorted(resume_skills - jd_skills)
    evidence = gather_evidence(resume_text, matched)

    if not required:
        summary = SUMMARY_NO_JD_SKILLS if not jd_skills else SUMMARY_ONLY_NICE_TO_HAVE
        return MatchResult(
            fit_score=0,
            status="insufficient_signal",
            required_matched=[],
            required_missing=[],
            nice_to_have_matched=nice_matched,
            nice_to_have_missing=nice_missing,
            matched_skills=matched,
            missing_skills=missing,
            extra_skills=extra,
            summary=summary,
            required_skills=[],
            nice_to_have_skills=nice_to_have,
            evidence=evidence,
            suggestions=[],
        )

    fit = round(100 * len(required_matched) / len(required))

    if fit >= 80:
        band = "Strong coverage"
    elif fit >= 50:
        band = "Partial coverage"
    else:
        band = "Low coverage"

    summary = (
        f"{band}: the resume covers {len(required_matched)} of {len(required)} "
        f"required keywords ({fit}%)."
    )

    return MatchResult(
        fit_score=fit,
        status="ok",
        required_matched=required_matched,
        required_missing=required_missing,
        nice_to_have_matched=nice_matched,
        nice_to_have_missing=nice_missing,
        matched_skills=matched,
        missing_skills=missing,
        extra_skills=extra,
        summary=summary,
        required_skills=required,
        nice_to_have_skills=nice_to_have,
        evidence=evidence,
        suggestions=build_suggestions(required_missing, nice_missing, matched),
    )
