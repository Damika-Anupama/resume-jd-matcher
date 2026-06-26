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

import re
from dataclasses import dataclass, field

# A compact, extensible skill dictionary. Canonical name -> alias patterns.
# Kept intentionally small and transparent; real deployments can expand it.
SKILL_ALIASES: dict[str, list[str]] = {
    "react": ["react", "react.js", "reactjs"],
    "next.js": ["next.js", "nextjs", "next js"],
    "typescript": ["typescript", "ts"],
    "javascript": ["javascript", "js", "es6"],
    "python": ["python"],
    "fastapi": ["fastapi"],
    "django": ["django"],
    "node.js": ["node.js", "nodejs", "node js", "express"],
    "rest apis": ["rest api", "rest apis", "restful", "rest"],
    "postgresql": ["postgresql", "postgres"],
    "mysql": ["mysql"],
    "mongodb": ["mongodb", "mongo"],
    "docker": ["docker", "containerization", "containers"],
    "kubernetes": ["kubernetes", "k8s", "eks", "gke"],
    "terraform": ["terraform", "iac", "infrastructure as code"],
    "aws": ["aws", "amazon web services"],
    "gcp": ["gcp", "google cloud"],
    "ci/cd": ["ci/cd", "cicd", "continuous integration", "github actions"],
    "prometheus": ["prometheus"],
    "grafana": ["grafana"],
    "observability": ["observability", "monitoring", "logging", "tracing"],
    "kafka": ["kafka", "pub/sub", "event-driven"],
    "llm": ["llm", "large language model", "openai", "anthropic", "rag", "gpt"],
    "playwright": ["playwright", "e2e testing", "end-to-end tests"],
    "testing": ["unit test", "pytest", "jest", "testing", "test coverage"],
    "graphql": ["graphql"],
    "redis": ["redis", "caching"],
    "microservices": ["microservices", "distributed systems"],
}


def extract_skills(text: str) -> set[str]:
    """Return the canonical skills mentioned in a block of text."""
    lowered = f" {text.lower()} "
    found: set[str] = set()
    for canonical, aliases in SKILL_ALIASES.items():
        for alias in aliases:
            # word-boundary-ish match that tolerates punctuation around tokens.
            # Short aliases like "js" and "ts" need a stricter left boundary so
            # framework names such as "Next.js" do not become false positives
            # for plain JavaScript.
            if alias in {"js", "ts"}:
                pattern = r"(?<![a-z0-9.])" + re.escape(alias) + r"(?![a-z0-9.])"
            else:
                pattern = r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])"
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
