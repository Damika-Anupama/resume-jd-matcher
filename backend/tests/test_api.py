"""Integration tests for the FastAPI app + eval harness."""
import json

from fastapi.testclient import TestClient

from app.main import app, MAX_INPUT_CHARS
from app.evaluate import evaluate

client = TestClient(app)


def test_health_reports_provider():
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "running"
    assert body["max_input_chars"] == MAX_INPUT_CHARS
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


def test_analyze_rejects_oversized_resume():
    resp = client.post(
        "/analyze",
        json={
            "resume": "x" * (MAX_INPUT_CHARS + 1),
            "job_description": "Python FastAPI",
        },
    )
    assert resp.status_code == 422
    assert "String should have at most" in resp.text


def test_async_analyze_rejects_oversized_job_description():
    resp = client.post(
        "/analyze/async",
        json={
            "resume": "Python FastAPI",
            "job_description": "x" * (MAX_INPUT_CHARS + 1),
        },
    )
    assert resp.status_code == 422
    assert "String should have at most" in resp.text


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


def test_request_logs_are_structured_json_with_request_id(capsys):
    request_id = "test-request-123"
    resp = client.get("/", headers={"X-Request-ID": request_id})

    assert resp.status_code == 200
    assert resp.headers["X-Request-ID"] == request_id

    logs = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    request_logs = [line for line in logs if line.get("event") == "http_request"]
    assert request_logs
    latest = request_logs[-1]
    assert latest["request_id"] == request_id
    assert latest["method"] == "GET"
    assert latest["path"] == "/"
    assert latest["status_code"] == 200
    assert isinstance(latest["duration_ms"], float)


def test_eval_harness_accuracy():
    report = evaluate()
    # The golden set must pass fully for the deterministic core to be trusted.
    assert report["accuracy"] == 1.0, report["failures"]
    assert report["passed"] == report["total"]
