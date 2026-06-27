"""Prometheus metrics for the resume ↔ JD matcher API.

Kept in the package __init__ because Python resolves app.metrics to this
package when both app/metrics.py and app/metrics/ exist.
"""
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)

registry = CollectorRegistry()

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests, labelled by method, path and status.",
    ["method", "path", "status"],
    registry=registry,
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds, labelled by method and path.",
    ["method", "path"],
    registry=registry,
)

ANALYSES = Counter(
    "analyses_total",
    "Total resume/JD analyses, labelled by the provider that served them.",
    ["provider"],
    registry=registry,
)

FIT_SCORE = Histogram(
    "fit_score",
    "Distribution of computed fit scores (0-100).",
    buckets=(0, 20, 40, 50, 60, 70, 80, 90, 100),
    registry=registry,
)


def normalize_path(path: str) -> str:
    known = {"/", "/analyze", "/metrics", "/analyze/async"}
    if path.startswith("/analyze/status/"):
        return "/analyze/status/{job_id}"
    return path if path in known else "/other"


def record_request(method: str, path: str, status: int, duration_seconds: float) -> None:
    label_path = normalize_path(path)
    REQUEST_COUNT.labels(method=method, path=label_path, status=str(status)).inc()
    REQUEST_LATENCY.labels(method=method, path=label_path).observe(duration_seconds)


def record_analysis(fit_score: int, provider: str) -> None:
    # Collapse the fallback label so cardinality stays bounded.
    if provider.startswith("openrouter"):
        provider_label = "openrouter"
    elif provider.startswith("mock"):
        provider_label = "mock"
    else:
        provider_label = "other"
    ANALYSES.labels(provider=provider_label).inc()
    FIT_SCORE.observe(fit_score)


def render_latest() -> tuple[bytes, str]:
    return generate_latest(registry), CONTENT_TYPE_LATEST
