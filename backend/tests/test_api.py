"""Integration tests for the FastAPI app + eval harness."""
import json

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


def test_analyze_rejects_oversized_input():
    # Guards the CPU-DoS surface: an over-limit body must be rejected (422)
    # before it reaches the O(text x aliases) skill scan.
    from app.main import MAX_TEXT_CHARS

    huge = "x" * (MAX_TEXT_CHARS + 1)
    resp = client.post(
        "/analyze", json={"resume": huge, "job_description": "Python and FastAPI"}
    )
    assert resp.status_code == 422


def test_analyze_at_size_limit_is_accepted():
    from app.main import MAX_TEXT_CHARS

    at_limit = "a" * MAX_TEXT_CHARS
    resp = client.post(
        "/analyze", json={"resume": at_limit, "job_description": "Python"}
    )
    assert resp.status_code == 200


def test_openrouter_malformed_response_falls_back_to_mock(monkeypatch):
    # The LLM is an enhancement, never a dependency: a malformed provider
    # response (e.g. empty "choices" -> IndexError, not in the old except tuple)
    # must fall back to mock suggestions with HTTP 200, never surface as a 500.
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    import app.llm_client as llm

    def boom(*_args, **_kwargs):
        raise IndexError("empty choices")

    monkeypatch.setattr(llm, "_openrouter_suggestions", boom)

    resp = client.post(
        "/analyze",
        json={"resume": "Python and FastAPI", "job_description": "Need Python"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "mock (openrouter fallback)"
    assert isinstance(body["suggestions"], list) and body["suggestions"]


def test_eval_harness_accuracy():
    report = evaluate()
    # The golden set must pass fully for the deterministic core to be trusted.
    assert report["accuracy"] == 1.0, report["failures"]
    assert report["passed"] == report["total"]
