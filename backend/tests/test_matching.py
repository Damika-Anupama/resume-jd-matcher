"""Tests for the deterministic matching engine."""
from app.matching import compute_match, extract_skills


def test_extract_skills_basic():
    skills = extract_skills("Experienced in React, TypeScript and FastAPI.")
    assert {"react", "typescript", "fastapi"} <= skills


def test_extract_skills_does_not_treat_nextjs_as_plain_javascript():
    skills = extract_skills("Built Next.js apps with React.")
    assert {"next.js", "react"} <= skills
    assert "javascript" not in skills


def test_strong_match_scores_high():
    result = compute_match(
        "Built React and Next.js apps in TypeScript with REST APIs.",
        "Need React, Next.js, TypeScript and REST API experience.",
    )
    assert result.fit_score >= 90
    assert "react" in result.matched_skills
    assert result.missing_skills == []


def test_partial_match_flags_missing():
    result = compute_match(
        "Python and FastAPI with PostgreSQL.",
        "Python, FastAPI, Kubernetes and Terraform required.",
    )
    assert 0 < result.fit_score < 100
    assert "kubernetes" in result.missing_skills
    assert "terraform" in result.missing_skills


def test_no_recognised_jd_skills_is_neutral():
    result = compute_match("Python developer.", "We value curiosity and teamwork.")
    assert result.fit_score == 0
    assert result.missing_skills == []


def test_extra_skills_reported():
    result = compute_match(
        "React, GraphQL and Redis experience.",
        "We need React.",
    )
    assert "react" in result.matched_skills
    assert "graphql" in result.extra_skills
    assert "redis" in result.extra_skills
