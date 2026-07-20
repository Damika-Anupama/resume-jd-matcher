"""Deterministic resume ↔ JD matching engine.

This module contains the pure, testable core of the matcher: skill extraction
and overlap scoring. It has **no** external dependencies and is fully
deterministic, which makes it ideal for:

- the `mock` LLM provider (so the app and its tests run with no API key), and
- the evaluation harness (golden-set scoring).

The LLM providers layer richer natural-language *explanations* on top of this
deterministic skeleton, but the structured score is always reproducible.

On top of the score, the engine also produces two *explainability* signals that
never change ``fit_score`` (they are purely additive):

- **Tiering** — each JD skill is classified ``required`` or ``nice_to_have``
  from cue words in the job description ("preferred", "a plus", "bonus", …).
  ``fit_score`` is unchanged: it is still coverage over *all* JD skills, so the
  golden-set numbers stay identical.
- **Evidence** — for every matched skill, the resume line that mentions it, so
  the UI can show *where* a skill was found instead of just asserting it was.
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

# Longest evidence snippet returned per matched skill. Long enough to carry a
# full bullet point, short enough that the response stays compact and the UI can
# render it on one or two lines.
_MAX_EVIDENCE_CHARS = 200

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


def extract_skills(text: str) -> set[str]:
    """Return the canonical skills mentioned in a block of text."""
    lowered = f" {text.lower()} "
    found: set[str] = set()
    for canonical, aliases in SKILL_ALIASES.items():
        for alias in aliases:
            if _alias_pattern(alias).search(lowered):
                found.add(canonical)
                break
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
    # Segment on line breaks AND sentence terminators, so an inline
    # "...is a plus." clause is scoped to its own sentence rather than tainting a
    # whole "Required: A, B, C. X is a plus." line. Mirrored in the TS port.
    segments = re.split(r"(?:\r\n|\r|\n|(?<=[.;!])\s+)", jd_text)
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
    """Map each matched skill to the first resume line that mentions it.

    Returns a whitespace-collapsed snippet capped at ``_MAX_EVIDENCE_CHARS`` so
    the UI can show *where* a skill was found. Deterministic (first match wins,
    scanning lines top-to-bottom) and mirrored byte-for-byte by the TS port.
    """
    lines = resume_text.splitlines() or [resume_text]
    evidence: dict[str, str] = {}
    for skill in matched_skills:
        for raw in lines:
            if _line_mentions_skill(raw.lower(), skill):
                snippet = _collapse(raw)
                if len(snippet) > _MAX_EVIDENCE_CHARS:
                    snippet = snippet[: _MAX_EVIDENCE_CHARS - 1].rstrip() + "…"
                evidence[skill] = snippet
                break
    return evidence


@dataclass
class MatchResult:
    fit_score: int  # 0..100
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    extra_skills: list[str] = field(default_factory=list)
    summary: str = ""
    # Explainability (additive — never affects fit_score):
    required_skills: list[str] = field(default_factory=list)
    nice_to_have_skills: list[str] = field(default_factory=list)
    evidence: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "fit_score": self.fit_score,
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "extra_skills": self.extra_skills,
            "summary": self.summary,
            "required_skills": self.required_skills,
            "nice_to_have_skills": self.nice_to_have_skills,
            "evidence": self.evidence,
        }


def compute_match(resume_text: str, jd_text: str) -> MatchResult:
    """Score how well a resume covers a job description's required skills.

    fit_score = (required skills present in resume) / (required skills in JD).
    If the JD lists no recognised skills, returns a neutral 0 with empty lists.

    Tiering and evidence are attached for explainability but never change the
    score: ``fit_score`` remains coverage over *all* recognised JD skills.
    """
    jd_skills = extract_skills(jd_text)
    resume_skills = extract_skills(resume_text)

    if not jd_skills:
        return MatchResult(
            fit_score=0,
            matched_skills=[],
            missing_skills=[],
            extra_skills=sorted(resume_skills),
            summary="No recognised target skills were found in the job description.",
        )

    matched = sorted(jd_skills & resume_skills)
    missing = sorted(jd_skills - resume_skills)
    extra = sorted(resume_skills - jd_skills)
    fit = round(100 * len(matched) / len(jd_skills))

    if fit >= 80:
        band = "Strong match"
    elif fit >= 50:
        band = "Partial match"
    else:
        band = "Weak match"

    summary = (
        f"{band}: the resume covers {len(matched)} of {len(jd_skills)} "
        f"required skills ({fit}%)."
    )

    tiers = classify_jd_skills(jd_text, jd_skills)
    required_skills = sorted(s for s in jd_skills if tiers[s] == "required")
    nice_to_have_skills = sorted(s for s in jd_skills if tiers[s] == "nice_to_have")
    evidence = gather_evidence(resume_text, matched)

    return MatchResult(
        fit_score=fit,
        matched_skills=matched,
        missing_skills=missing,
        extra_skills=extra,
        summary=summary,
        required_skills=required_skills,
        nice_to_have_skills=nice_to_have_skills,
        evidence=evidence,
    )
