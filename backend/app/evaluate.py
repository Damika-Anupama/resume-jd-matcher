"""Evaluation harness for the deterministic matching core.

Recruiters for applied-LLM roles expect evidence of *evaluation*, not just a
model call. This harness scores the deterministic engine against a small golden
set of (resume, jd, expected) cases and reports accuracy metrics. It runs with
no API key because it evaluates the reproducible core.

Run directly:  `python -m app.evaluate`
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from typing import Any

from app.matching import compute_match


@dataclass
class Case:
    name: str
    resume: str
    jd: str
    expect_min_fit: int
    expect_max_fit: int
    must_match: list[str]
    must_miss: list[str]


GOLDEN_SET: list[Case] = [
    Case(
        name="strong_frontend",
        resume="Built React and Next.js apps in TypeScript with REST APIs and Jest testing.",
        jd="We need React, Next.js, TypeScript and REST API experience.",
        expect_min_fit=90,
        expect_max_fit=100,
        must_match=["react", "next.js", "typescript", "rest apis"],
        must_miss=[],
    ),
    Case(
        name="partial_backend",
        resume="Python and FastAPI services with PostgreSQL. Some Docker.",
        jd="Python, FastAPI, Kubernetes, Terraform and observability required.",
        expect_min_fit=30,
        expect_max_fit=60,
        must_match=["python", "fastapi"],
        must_miss=["kubernetes", "terraform", "observability"],
    ),
    Case(
        name="weak_devops",
        resume="Frontend developer focused on React and CSS.",
        jd="AWS, Kubernetes, Terraform, CI/CD and Prometheus needed.",
        expect_min_fit=0,
        expect_max_fit=20,
        must_match=[],
        must_miss=["aws", "kubernetes", "terraform", "ci/cd", "prometheus"],
    ),
    Case(
        name="llm_role",
        resume="Built RAG pipelines with OpenAI and FastAPI, plus Playwright e2e tests.",
        jd="LLM integration, FastAPI backend and end-to-end tests expected.",
        expect_min_fit=90,
        expect_max_fit=100,
        must_match=["llm", "fastapi", "playwright"],
        must_miss=[],
    ),
]


def _case_report(case: Case) -> dict[str, Any]:
    """Evaluate one golden case and return auditable evidence.

    The report intentionally includes the input expectations and actual matcher
    output so CI logs are useful when the deterministic core regresses.
    """
    result = compute_match(case.resume, case.jd)
    reasons: list[str] = []

    if not (case.expect_min_fit <= result.fit_score <= case.expect_max_fit):
        reasons.append(
            f"fit {result.fit_score} not in "
            f"[{case.expect_min_fit},{case.expect_max_fit}]"
        )
    for skill in case.must_match:
        if skill not in result.matched_skills:
            reasons.append(f"expected matched skill missing: {skill}")
    for skill in case.must_miss:
        if skill not in result.missing_skills:
            reasons.append(f"expected missing skill not flagged: {skill}")

    expected_skills = set(case.must_match) | set(case.must_miss)
    actual_expected_hits = set(result.matched_skills) | set(result.missing_skills)
    covered_expectations = expected_skills & actual_expected_hits
    expectation_recall = (
        round(len(covered_expectations) / len(expected_skills), 3)
        if expected_skills
        else 1.0
    )

    return {
        "name": case.name,
        "passed": not reasons,
        "failures": reasons,
        "expectations": asdict(case),
        "actual": result.to_dict(),
        "metrics": {
            "expectation_recall": expectation_recall,
            "matched_required_count": len(result.matched_skills),
            "missing_required_count": len(result.missing_skills),
        },
    }


def evaluate() -> dict[str, Any]:
    cases = [_case_report(case) for case in GOLDEN_SET]
    passed = sum(1 for case in cases if case["passed"])
    total = len(cases)
    failures = [
        f"{case['name']}: {'; '.join(case['failures'])}"
        for case in cases
        if not case["passed"]
    ]
    return {
        "total": total,
        "passed": passed,
        "accuracy": round(passed / total, 3) if total else 0.0,
        "failures": failures,
        "cases": cases,
        "methodology": {
            "scope": "deterministic skill extraction and fit scoring only",
            "pass_criteria": [
                "fit_score must land inside the case-specific expected range",
                "must_match skills must be present in matched_skills",
                "must_miss skills must be present in missing_skills",
            ],
            "excluded": [
                "LLM suggestion quality",
                "provider latency",
                "resume writing quality beyond recognised skill coverage",
            ],
        },
    }


def _print_text_report(report: dict[str, Any]) -> None:
    print(f"Eval accuracy: {report['accuracy']} ({report['passed']}/{report['total']})")
    for case in report["cases"]:
        status = "PASS" if case["passed"] else "FAIL"
        actual = case["actual"]
        print(
            f"{status} {case['name']}: fit={actual['fit_score']} "
            f"matched={actual['matched_skills']} missing={actual['missing_skills']}"
        )
    for failure in report["failures"]:
        print("FAIL:", failure)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the golden-set eval harness.")
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit machine-readable JSON for CI artifacts and portfolio evidence",
    )
    args = parser.parse_args()

    report = evaluate()
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        _print_text_report(report)


if __name__ == "__main__":
    main()
