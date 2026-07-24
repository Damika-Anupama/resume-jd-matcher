"""Tests for the deterministic matching engine (contract v2, ADR 0001)."""
from app.matching import (
    build_suggestions,
    compute_match,
    extract_resume_skills,
    extract_skills,
    SUMMARY_NO_JD_SKILLS,
    SUMMARY_ONLY_NICE_TO_HAVE,
)


def test_extract_skills_basic():
    skills = extract_skills("Experienced in React, TypeScript and FastAPI.")
    assert {"react", "typescript", "fastapi"} <= skills


def test_strong_match_scores_high():
    result = compute_match(
        "Built React and Next.js apps in TypeScript with REST APIs.",
        "Need React, Next.js, TypeScript and REST API experience.",
    )
    assert result.status == "ok"
    assert result.fit_score >= 90
    assert "react" in result.matched_skills
    assert result.missing_skills == []


def test_partial_match_flags_missing():
    result = compute_match(
        "Python and FastAPI with PostgreSQL.",
        "Python, FastAPI, Kubernetes and Terraform required.",
    )
    assert 0 < result.fit_score < 100
    assert "kubernetes" in result.required_missing
    assert "terraform" in result.required_missing
    assert "kubernetes" in result.missing_skills


def test_no_recognised_jd_skills_is_insufficient_signal():
    result = compute_match("Python developer.", "We value curiosity and teamwork.")
    assert result.status == "insufficient_signal"
    assert result.fit_score == 0
    assert result.missing_skills == []
    assert result.suggestions == []
    assert result.summary == SUMMARY_NO_JD_SKILLS
    # Only suggestions are forced empty: resume-derived fields stay populated.
    assert result.extra_skills == ["python"]


def test_only_nice_to_have_jd_is_insufficient_but_reports_coverage():
    result = compute_match(
        "Kubernetes admin with Helm charts.",
        "Nice to have: Kubernetes, Terraform.",
    )
    assert result.status == "insufficient_signal"
    assert result.fit_score == 0
    assert result.summary == SUMMARY_ONLY_NICE_TO_HAVE
    assert result.suggestions == []
    # Nice-to-have coverage still reported.
    assert result.nice_to_have_matched == ["kubernetes"]
    assert result.nice_to_have_missing == ["terraform"]
    assert result.required_matched == []
    assert result.required_missing == []


def test_fit_score_is_required_coverage_only():
    # The canonical ADR regression: nice-to-haves never enter the denominator.
    result = compute_match(
        "Python developer.",
        "Required: Python. Nice to have: Kubernetes, Terraform.",
    )
    assert result.status == "ok"
    assert result.fit_score == 100
    assert result.required_matched == ["python"]
    assert result.required_missing == []
    assert result.nice_to_have_missing == ["kubernetes", "terraform"]
    assert result.summary == (
        "Strong coverage: the resume covers 1 of 1 required keywords (100%)."
    )


def test_extra_skills_reported():
    result = compute_match(
        "React, GraphQL and Redis experience.",
        "We need React.",
    )
    assert "react" in result.matched_skills
    assert "graphql" in result.extra_skills
    assert "redis" in result.extra_skills


def test_schema_v2_dict_shape():
    result = compute_match("Python developer.", "Python required.")
    payload = result.to_dict()
    assert payload["schema_version"] == 2
    assert payload["status"] == "ok"
    for key in (
        "fit_score", "required_matched", "required_missing",
        "nice_to_have_matched", "nice_to_have_missing", "matched_skills",
        "missing_skills", "extra_skills", "summary", "required_skills",
        "nice_to_have_skills", "evidence", "suggestions",
    ):
        assert key in payload


def test_evidence_points_to_matching_resume_line():
    result = compute_match(
        "Summary\nBuilt data pipelines in Python at scale.\nAlso used Docker.",
        "Need Python and Docker.",
    )
    # Each matched skill maps to the resume segment that mentions it.
    assert "Python" in result.evidence["python"]
    assert "Docker" in result.evidence["docker"]
    # Missing skills have no evidence entry.
    assert set(result.evidence) == set(result.matched_skills)


# --------------------------------------------------------------------------- #
# Negation / non-experience filter (ADR 0001)
# --------------------------------------------------------------------------- #
def test_negated_skill_not_extracted():
    assert "python" not in extract_resume_skills("No Python experience.")


def test_negation_is_segment_scoped():
    skills = extract_resume_skills(
        "5 years of Python. No Kubernetes experience."
    )
    assert "python" in skills
    assert "kubernetes" not in skills


def test_aspiration_is_not_experience():
    assert "rust" not in extract_resume_skills("Eager to learn Rust.")
    assert "go" not in extract_resume_skills("I plan to learn Golang next year.")
    assert "kafka" not in extract_resume_skills("Currently learning Kafka.")


def test_negated_segment_supplies_no_evidence():
    result = compute_match(
        "Python services in production.\nNo Kubernetes experience yet.",
        "Python and Kubernetes required.",
    )
    assert result.required_matched == ["python"]
    assert result.required_missing == ["kubernetes"]
    assert "kubernetes" not in result.evidence
    assert "Python" in result.evidence["python"]


def test_skill_reasserted_elsewhere_still_counts():
    # One negated mention does not erase a genuine mention elsewhere.
    skills = extract_resume_skills(
        "Built Terraform modules for AWS.\nNot familiar with Azure Terraform quirks."
    )
    assert "terraform" in skills


def test_keyword_stuffing_counts_once():
    stuffed = " ".join(["Python"] * 10)
    result = compute_match(stuffed, "Python and Docker required.")
    assert result.required_matched == ["python"]
    assert result.fit_score == 50  # 1 of 2, not inflated by repetition


# --------------------------------------------------------------------------- #
# Tiering
# --------------------------------------------------------------------------- #
def test_nice_to_have_cue_downgrades_skill_and_changes_denominator():
    jd = (
        "Requirements:\n"
        "- Strong Python and FastAPI\n"
        "Nice to have:\n"
        "- Kubernetes and Terraform are a plus\n"
    )
    resume = "Python and FastAPI developer."
    result = compute_match(resume, jd)

    assert set(result.required_skills) == {"python", "fastapi"}
    assert set(result.nice_to_have_skills) == {"kubernetes", "terraform"}
    # v2: fit_score is REQUIRED coverage only -> 2/2 = 100.
    assert result.fit_score == 100
    assert result.nice_to_have_missing == ["kubernetes", "terraform"]


def test_inline_plus_clause_is_sentence_scoped():
    jd = (
        "Required: React, TypeScript and Docker. "
        "Experience with Kubernetes is a plus."
    )
    result = compute_match("React developer.", jd)
    assert {"react", "typescript", "docker"} <= set(result.required_skills)
    assert result.nice_to_have_skills == ["kubernetes"]
    # 1 of 3 required -> 33.
    assert result.fit_score == 33


def test_tiering_defaults_to_required_without_cues():
    result = compute_match(
        "Python developer.",
        "Need Python, FastAPI and Docker.",
    )
    assert set(result.required_skills) == {"python", "fastapi", "docker"}
    assert result.nice_to_have_skills == []
    assert result.fit_score == 33


# --------------------------------------------------------------------------- #
# Suggestions (deterministic composition, ADR 0001)
# --------------------------------------------------------------------------- #
def test_suggestions_for_missing_required_skills():
    result = compute_match(
        "Python developer.",
        "Python, Docker, Kubernetes and Terraform required. Grafana is a plus.",
    )
    # 3 required-missing items + 1 aggregated optional + lead-with-strengths.
    assert len(result.suggestions) == 5
    assert result.suggestions[0] == (
        "If you genuinely have docker experience, add a concrete example — a "
        "project, metric, or responsibility that shows hands-on use."
    )
    assert result.suggestions[3] == (
        "Optional keywords not found: grafana. Only add one if you can "
        "support it truthfully."
    )
    assert result.suggestions[4] == (
        "Lead with your strongest matched skills (python) near the top of the "
        "resume so they are seen first."
    )


def test_suggestions_when_all_required_covered():
    result = compute_match("Python developer.", "Python required.")
    assert result.suggestions == [
        "All recognised required keywords are covered — emphasise depth and "
        "impact (metrics, scale, ownership) for your matched skills.",
        "Lead with your strongest matched skills (python) near the top of the "
        "resume so they are seen first.",
    ]


def test_suggestions_capped_at_five_nonempty():
    many_missing = ["python", "docker", "kubernetes", "terraform", "aws", "gcp"]
    suggestions = build_suggestions(many_missing, ["grafana", "redis"], ["react"])
    assert len(suggestions) <= 5
    assert all(isinstance(s, str) and s.strip() for s in suggestions)


def test_insufficient_signal_has_no_positive_language():
    result = compute_match("Python developer.", "Friendly team, hybrid work.")
    assert result.suggestions == []
    assert "Strong" not in result.summary
    assert "covers" not in result.summary
