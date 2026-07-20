"""FastAPI service for the resume ↔ JD matcher.

Endpoints:
- GET  /            health check + active provider
- POST /analyze     { resume, job_description } -> structured match + suggestions
- GET  /metrics     Prometheus text exposition
"""
from __future__ import annotations

import os
import threading
import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app import metrics
from app.llm_client import analyze, active_provider
from app.logging.config import configure_logging

configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
logger = structlog.get_logger("resume_jd_matcher")

# Optionally run a consumer in-process (handy for single-process demos/dev so the
# API and worker share one job store). In production, run app.worker separately
# and use a shared store (Redis/DB).
_consumer_stop = threading.Event()


@asynccontextmanager
async def lifespan(app: FastAPI):
    consumer_thread = None
    if os.environ.get("RUN_INPROCESS_CONSUMER") == "1":
        from app.events import consume_forever

        _consumer_stop.clear()
        consumer_thread = threading.Thread(
            target=consume_forever, args=(_consumer_stop,), daemon=True
        )
        consumer_thread.start()
        logger.info("in-process analysis consumer started")
    try:
        yield
    finally:
        if consumer_thread is not None:
            _consumer_stop.set()
            consumer_thread.join(timeout=5)


app = FastAPI(title="Resume ↔ JD Matcher API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# Upper bound on accepted text length. Long enough for very detailed resumes /
# JDs, but small enough that the O(text x aliases) skill scan can't be abused as
# a CPU-DoS vector via a multi-megabyte body. Over-limit input returns 422.
MAX_TEXT_CHARS = 20_000


class AnalyzeRequest(BaseModel):
    resume: str = Field(
        ..., min_length=1, max_length=MAX_TEXT_CHARS, description="Candidate resume text"
    )
    job_description: str = Field(
        ..., min_length=1, max_length=MAX_TEXT_CHARS, description="Target JD text"
    )


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    start = time.perf_counter()
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    elapsed_ms = round(elapsed * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-ms"] = str(elapsed_ms)
    metrics.record_request(
        request.method, request.url.path, response.status_code, elapsed
    )
    logger.info(
        "http_request",
        method=request.method,
        path=metrics.normalize_path(request.url.path),
        raw_path=request.url.path,
        status_code=response.status_code,
        duration_ms=elapsed_ms,
    )
    return response


@app.get("/")
def health():
    return {
        "status": "running",
        "service": "resume-jd-matcher",
        "llm_provider": active_provider(),
    }


@app.get("/metrics")
def metrics_endpoint():
    payload, content_type = metrics.render_latest()
    return Response(content=payload, media_type=content_type)


@app.post("/analyze")
def analyze_endpoint(req: AnalyzeRequest):
    result = analyze(req.resume, req.job_description)
    metrics.record_analysis(result["fit_score"], result["provider"])
    logger.info(
        "analysis_completed",
        fit_score=result["fit_score"],
        provider=result["provider"],
        matched_count=len(result["matched_skills"]),
        missing_count=len(result["missing_skills"]),
    )
    return result


@app.post("/analyze/async", status_code=202)
def analyze_async_endpoint(req: AnalyzeRequest):
    """Enqueue an analysis job on Kafka and return its id immediately.

    The job is processed asynchronously by a consumer worker; poll
    /analyze/status/{job_id} for the result.
    """
    from app import events

    job_id = events.publish_job(req.resume, req.job_description)
    return {"job_id": job_id, "status": "queued"}


@app.get("/analyze/status/{job_id}")
def analyze_status_endpoint(job_id: str):
    from app import events

    job = events.store.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id.")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "result": job.result,
        "error": job.error,
    }
