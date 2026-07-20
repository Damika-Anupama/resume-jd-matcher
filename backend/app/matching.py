"""Deterministic resume ↔ JD matching engine.

This module contains the pure, testable core of the matcher: skill extraction
and overlap scoring. It has **no** external dependencies and is fully
deterministic, which makes it ideal for:

- the `mock` LLM provider (so the app and its tests run with no API key), and
- the evaluation harness (golden-set scoring).

The LLM providers layer richer natural-language *explanations* on top of this
deterministic skeleton, but the structured score is always reproducible.
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


def extract_skills(text: str) -> set[str]:
    """Return the canonical skills mentioned in a block of text."""
    lowered = f" {text.lower()} "
    found: set[str] = set()
    for canonical, aliases in SKILL_ALIASES.items():
        for alias in aliases:
            # Token-aware boundary match.
            #
            # The leading guard excludes a preceding "." as well as
            # alphanumerics, so a short alias like "js"/"ts" does NOT match the
            # file-extension suffix of a larger token ("next.js", "node.ts").
            # The trailing guard intentionally allows a following "." so that a
            # skill at the end of a sentence ("...uses Python.") still matches.
            pattern = r"(?<![a-z0-9.])" + re.escape(alias) + r"(?![a-z0-9])"
            if re.search(pattern, lowered):
                found.add(canonical)
                break
    return found


@dataclass
class MatchResult:
    fit_score: int  # 0..100
    matched_skills: list[str] = field(default_factory=list)
    missing_skills: list[str] = field(default_factory=list)
    extra_skills: list[str] = field(default_factory=list)
    summary: str = ""

    def to_dict(self) -> dict:
        return {
            "fit_score": self.fit_score,
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "extra_skills": self.extra_skills,
            "summary": self.summary,
        }


def compute_match(resume_text: str, jd_text: str) -> MatchResult:
    """Score how well a resume covers a job description's required skills.

    fit_score = (required skills present in resume) / (required skills in JD).
    If the JD lists no recognised skills, returns a neutral 0 with empty lists.
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
    return MatchResult(
        fit_score=fit,
        matched_skills=matched,
        missing_skills=missing,
        extra_skills=extra,
        summary=summary,
    )
