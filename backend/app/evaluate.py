"""Evaluation harness for the deterministic matching core.

Recruiters for applied-LLM roles expect evidence of *evaluation*, not just a
model call. This harness scores the deterministic engine against a small golden
set of (resume, jd, expected) cases and reports accuracy metrics. It runs with
no API key because it evaluates the reproducible core.

Run directly:  `python -m app.evaluate`
"""
from __future__ import annotations

from dataclasses import dataclass

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


def evaluate() -> dict:
    passed = 0
    failures: list[str] = []
    for case in GOLDEN_SET:
        result = compute_match(case.resume, case.jd)
        ok = True
        reasons = []
        if not (case.expect_min_fit <= result.fit_score <= case.expect_max_fit):
            ok = False
            reasons.append(
                f"fit {result.fit_score} not in "
                f"[{case.expect_min_fit},{case.expect_max_fit}]"
            )
        for skill in case.must_match:
            if skill not in result.matched_skills:
                ok = False
                reasons.append(f"expected matched skill missing: {skill}")
        for skill in case.must_miss:
            if skill not in result.missing_skills:
                ok = False
                reasons.append(f"expected missing skill not flagged: {skill}")
        if ok:
            passed += 1
        else:
            failures.append(f"{case.name}: {'; '.join(reasons)}")

    total = len(GOLDEN_SET)
    return {
        "total": total,
        "passed": passed,
        "accuracy": round(passed / total, 3) if total else 0.0,
        "failures": failures,
    }


if __name__ == "__main__":
    report = evaluate()
    print(f"Eval accuracy: {report['accuracy']} ({report['passed']}/{report['total']})")
    for failure in report["failures"]:
        print("FAIL:", failure)
