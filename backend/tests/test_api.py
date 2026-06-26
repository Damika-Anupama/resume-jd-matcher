"""Integration tests for the FastAPI app + eval harness."""
from fastapi.testclient import TestClient

from app.main import app
from app.evaluate import evaluate

client = TestClient(app)


def test_health_reports_provider():
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "running"
    # With no key configured in the test env, provider must be the safe mock.
    assert body["llm_provider"] in {"mock", "openrouter"}


def test_analyze_returns_structured_match():
    resp = client.post(
        "/analyze",
        json={
            "resume": "Built React and Next.js apps in TypeScript with REST APIs.",
            "job_description": "Need React, Next.js, TypeScript and REST APIs.",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert 0 <= body["fit_score"] <= 100
    assert "react" in body["matched_skills"]
    assert isinstance(body["suggestions"], list)
    assert "provider" in body


def test_analyze_validates_empty_input():
    resp = client.post("/analyze", json={"resume": "", "job_description": "x"})
    assert resp.status_code == 422


def test_metrics_endpoint():
    # Generate one analysis so counters move.
    client.post(
        "/analyze",
        json={"resume": "Python FastAPI", "job_description": "Python and FastAPI"},
    )
    resp = client.get("/metrics")
    assert resp.status_code == 200
    assert "analyses_total" in resp.text
    assert "fit_score" in resp.text


def test_eval_harness_accuracy():
    report = evaluate()
    # The golden set must pass fully for the deterministic core to be trusted.
    assert report["accuracy"] == 1.0, report["failures"]
    assert report["passed"] == report["total"]
    assert len(report["cases"]) == report["total"]
    assert report["methodology"]["scope"] == "deterministic skill extraction and fit scoring only"


def test_eval_harness_reports_case_level_evidence():
    report = evaluate()
    case = next(item for item in report["cases"] if item["name"] == "partial_backend")

    assert case["passed"] is True
    assert case["actual"]["fit_score"] == 40
    assert case["actual"]["matched_skills"] == ["fastapi", "python"]
    assert case["actual"]["missing_skills"] == [
        "kubernetes",
        "observability",
        "terraform",
    ]
    assert case["metrics"]["expectation_recall"] == 1.0
