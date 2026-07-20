"""Tests for optional API-key auth, rate limiting, and /v1 versioning."""
from fastapi.testclient import TestClient

from app import security
from app.main import app

client = TestClient(app)
BODY = {"resume": "Python and FastAPI", "job_description": "Need Python"}


def test_open_by_default():
    # No API_KEYS / RATE_LIMIT env -> endpoints are open (deploy-safe default).
    assert client.post("/analyze", json=BODY).status_code == 200


def test_api_key_enforced_when_configured(monkeypatch):
    monkeypatch.setenv("API_KEYS", "secret1, secret2")

    assert client.post("/analyze", json=BODY).status_code == 401
    assert client.post("/analyze", json=BODY, headers={"X-API-Key": "nope"}).status_code == 401
    assert (
        client.post("/analyze", json=BODY, headers={"X-API-Key": "secret1"}).status_code
        == 200
    )
    # Bearer token form is also accepted.
    assert (
        client.post(
            "/analyze", json=BODY, headers={"Authorization": "Bearer secret2"}
        ).status_code
        == 200
    )


def test_extract_also_guarded(monkeypatch):
    monkeypatch.setenv("API_KEYS", "secret1")
    files = {"file": ("r.txt", b"Python", "text/plain")}
    assert client.post("/extract", files=files).status_code == 401
    assert (
        client.post("/extract", files=files, headers={"X-API-Key": "secret1"}).status_code
        == 200
    )


def test_health_and_metrics_stay_open_with_keys(monkeypatch):
    monkeypatch.setenv("API_KEYS", "secret1")
    assert client.get("/").status_code == 200
    assert client.get("/metrics").status_code == 200


def test_v1_alias_matches_legacy_path():
    resp = client.post("/v1/analyze", json=BODY)
    assert resp.status_code == 200
    assert "fit_score" in resp.json()


def test_v1_respects_api_key(monkeypatch):
    monkeypatch.setenv("API_KEYS", "secret1")
    assert client.post("/v1/analyze", json=BODY).status_code == 401
    assert (
        client.post("/v1/analyze", json=BODY, headers={"X-API-Key": "secret1"}).status_code
        == 200
    )


def test_rate_limit_returns_429_after_limit(monkeypatch):
    security.reset_rate_limiter()
    monkeypatch.setenv("RATE_LIMIT_PER_MINUTE", "2")
    try:
        assert client.post("/analyze", json=BODY).status_code == 200
        assert client.post("/analyze", json=BODY).status_code == 200
        blocked = client.post("/analyze", json=BODY)
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers
    finally:
        security.reset_rate_limiter()


def test_rate_limit_disabled_by_default():
    security.reset_rate_limiter()
    # Many calls with no RATE_LIMIT env must all succeed.
    for _ in range(5):
        assert client.post("/analyze", json=BODY).status_code == 200
