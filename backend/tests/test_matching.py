"""Tests for the deterministic matching engine."""
from app.matching import compute_match, extract_skills


def test_extract_skills_basic():
    skills = extract_skills("Experienced in React, TypeScript and FastAPI.")
    assert {"react", "typescript", "fastapi"} <= skills


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


def test_evidence_points_to_matching_resume_line():
    result = compute_match(
        "Summary\nBuilt data pipelines in Python at scale.\nAlso used Docker.",
        "Need Python and Docker.",
    )
    # Each matched skill maps to the resume line that mentions it.
    assert "Python" in result.evidence["python"]
    assert "Docker" in result.evidence["docker"]
    # Missing skills have no evidence entry.
    assert set(result.evidence) == set(result.matched_skills)


def test_nice_to_have_cue_downgrades_skill_without_changing_score():
    jd = (
        "Requirements:\n"
        "- Strong Python and FastAPI\n"
        "Nice to have:\n"
        "- Kubernetes and Terraform are a plus\n"
    )
    resume = "Python and FastAPI developer."
    result = compute_match(resume, jd)

    # Tiering: the required section stays required, the bonus section is nice.
    assert set(result.required_skills) == {"python", "fastapi"}
    assert set(result.nice_to_have_skills) == {"kubernetes", "terraform"}
    # Every JD skill lands in exactly one tier.
    assert set(result.required_skills) | set(result.nice_to_have_skills) == {
        "python",
        "fastapi",
        "kubernetes",
        "terraform",
    }

    # fit_score is UNCHANGED by tiering: still coverage over all 4 JD skills.
    assert result.fit_score == 50


def test_inline_plus_clause_is_sentence_scoped():
    # A single line mixing required skills and a trailing "is a plus" sentence:
    # only the bonus sentence's skill is downgraded, not the whole line.
    jd = (
        "Required: React, TypeScript and Docker. "
        "Experience with Kubernetes is a plus."
    )
    result = compute_match("React developer.", jd)
    assert {"react", "typescript", "docker"} <= set(result.required_skills)
    assert result.nice_to_have_skills == ["kubernetes"]


def test_tiering_defaults_to_required_without_cues():
    result = compute_match(
        "Python developer.",
        "Need Python, FastAPI and Docker.",
    )
    assert set(result.required_skills) == {"python", "fastapi", "docker"}
    assert result.nice_to_have_skills == []
