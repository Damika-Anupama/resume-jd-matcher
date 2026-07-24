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
    # With no key configured in the test env, provider must be deterministic.
    assert body["llm_provider"] == "deterministic"


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
    assert body["schema_version"] == 2
    assert body["status"] == "ok"
    assert 0 <= body["fit_score"] <= 100
    assert "react" in body["matched_skills"]
    assert "react" in body["required_matched"]
    assert body["required_missing"] == []
    assert body["nice_to_have_matched"] == []
    assert body["nice_to_have_missing"] == []
    assert isinstance(body["suggestions"], list)
    assert 0 < len(body["suggestions"]) <= 5
    assert body["provider"] == "deterministic"


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
    # before it reaches the O(text x aliases) skill scan, with the typed error
    # schema and WITHOUT echoing the submitted text back.
    from app.main import MAX_TEXT_CHARS

    huge = "x" * (MAX_TEXT_CHARS + 1)
    resp = client.post(
        "/analyze", json={"resume": huge, "job_description": "Python and FastAPI"}
    )
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "text_too_long"
    assert "xxxx" not in resp.text


def test_validation_error_uses_typed_schema_without_echoing_input():
    resp = client.post("/analyze", json={"resume": "some private text"})
    assert resp.status_code == 422
    body = resp.json()
    assert set(body) == {"error", "code"}
    assert body["code"] == "invalid_request"
    assert "some private text" not in resp.text


def test_responses_are_never_cached():
    assert client.get("/").headers["Cache-Control"] == "no-store"
    resp = client.post(
        "/analyze", json={"resume": "Python", "job_description": "Python"}
    )
    assert resp.headers["Cache-Control"] == "no-store"


def test_malicious_request_id_is_replaced():
    evil = "abc\ndef; rm -rf /"
    resp = client.get("/", headers={"X-Request-ID": evil})
    assert resp.status_code == 200
    echoed = resp.headers["X-Request-ID"]
    assert echoed != evil
    import re as _re

    assert _re.fullmatch(r"[A-Za-z0-9._-]{1,64}", echoed)


def test_oversized_request_id_is_replaced():
    long_id = "a" * 65
    resp = client.get("/", headers={"X-Request-ID": long_id})
    assert resp.headers["X-Request-ID"] != long_id


def test_async_endpoints_fail_deliberately_without_kafka(monkeypatch):
    monkeypatch.delenv("KAFKA_BOOTSTRAP_SERVERS", raising=False)
    resp = client.post(
        "/analyze/async",
        json={"resume": "Python", "job_description": "Python"},
    )
    assert resp.status_code == 503
    assert resp.json()["code"] == "async_disabled"

    status = client.get("/analyze/status/some-job-id")
    assert status.status_code == 503
    assert status.json()["code"] == "async_disabled"


def test_analyze_at_size_limit_is_accepted():
    from app.main import MAX_TEXT_CHARS

    at_limit = "a" * MAX_TEXT_CHARS
    resp = client.post(
        "/analyze", json={"resume": at_limit, "job_description": "Python"}
    )
    assert resp.status_code == 200


def test_openrouter_malformed_response_falls_back_to_deterministic(monkeypatch):
    # The LLM is an enhancement, never a dependency: a malformed provider
    # response (e.g. empty "choices" -> IndexError, not in the old except tuple)
    # must fall back to deterministic suggestions with HTTP 200, never a 500,
    # and the provider field must report the fallback honestly.
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    import app.llm_client as llm

    def boom(*_args, **_kwargs):
        raise IndexError("empty choices")

    monkeypatch.setattr(llm, "_openrouter_suggestions", boom)

    resp = client.post(
        "/analyze",
        json={
            "resume": "Python and FastAPI",
            "job_description": "Need Python",
            "llm_consent": True,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "deterministic (openrouter fallback)"
    assert isinstance(body["suggestions"], list) and body["suggestions"]


def test_llm_requires_explicit_consent(monkeypatch):
    # Even with the provider fully configured, no consent flag means the LLM
    # must never be called and the provider stays deterministic.
    monkeypatch.setenv("LLM_PROVIDER", "openrouter")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    import app.llm_client as llm

    def must_not_be_called(*_args, **_kwargs):
        raise AssertionError("LLM called without consent")

    monkeypatch.setattr(llm, "_openrouter_suggestions", must_not_be_called)

    resp = client.post(
        "/analyze",
        json={"resume": "Python and FastAPI", "job_description": "Need Python"},
    )
    assert resp.status_code == 200
    assert resp.json()["provider"] == "deterministic"


def test_eval_harness_accuracy():
    report = evaluate()
    # The golden set must pass fully for the deterministic core to be trusted.
    assert report["accuracy"] == 1.0, report["failures"]
    assert report["passed"] == report["total"]
