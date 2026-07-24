"""FastAPI service for the resume ↔ JD matcher.

Endpoints (also mounted under ``/v1`` for versioned clients):
- GET  /            health check + active provider
- POST /analyze     { resume, job_description } -> structured match + suggestions
- POST /extract     multipart file (pdf/docx/txt) -> extracted plain text
- GET  /metrics     Prometheus text exposition

The analysis endpoints are guarded by optional, env-gated API-key auth and rate
limiting (see ``app.security``); both are off by default so the service stays
deploy-safe with no configuration. ``/`` and ``/metrics`` are always open.
"""
from __future__ import annotations

import os
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import APIRouter, Depends, FastAPI, File, Request, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import extract, metrics, security
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
        from app.events import consume_forever, enabled as async_enabled

        if not async_enabled():
            raise RuntimeError(
                "RUN_INPROCESS_CONSUMER=1 requires KAFKA_BOOTSTRAP_SERVERS."
            )
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


app = FastAPI(title="Resume ↔ JD Matcher API", version="2.0.0", lifespan=lifespan)

# Analysis endpoints live on a router guarded by the optional auth + rate-limit
# dependencies, then mounted twice: at the root (back-compat) and under /v1.
api = APIRouter(
    dependencies=[
        Depends(security.require_api_key),
        Depends(security.enforce_rate_limit),
    ]
)


def _cors_origins() -> list[str]:
    """CORS allowlist from CORS_ALLOW_ORIGINS (comma-separated).

    There is deliberately no wildcard: unset means local-dev origins only. A
    production deployment MUST set CORS_ALLOW_ORIGINS to its real frontend
    origin(s), e.g. ``CORS_ALLOW_ORIGINS=https://app.example.com``.
    """
    raw = os.environ.get("CORS_ALLOW_ORIGINS", "")
    origins = [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]
    return origins or ["http://localhost:3000", "http://127.0.0.1:3000"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-API-Key", "Authorization", "X-Request-ID"],
)


# Upper bound on accepted text length. Long enough for very detailed resumes /
# JDs, but small enough that the O(text x aliases) skill scan can't be abused as
# a CPU-DoS vector via a multi-megabyte body. Over-limit input returns 422.
MAX_TEXT_CHARS = 20_000

# Client-supplied request ids are propagated only when they are boring and
# short; anything else (log-injection payloads, oversize values) is replaced.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

# Fallback error codes per status for errors raised without an explicit code.
_STATUS_TO_CODE = {
    400: "bad_request",
    401: "unauthorized",
    404: "not_found",
    405: "method_not_allowed",
    413: "payload_too_large",
    415: "unsupported_media_type",
    422: "invalid_request",
    429: "rate_limited",
    500: "internal_error",
    503: "service_unavailable",
}


def api_error(status_code: int, code: str, message: str) -> HTTPException:
    """Build an HTTPException carrying the typed {error, code} schema."""
    return HTTPException(
        status_code=status_code, detail={"error": message, "code": code}
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_to_error_schema(request: Request, exc: StarletteHTTPException):
    """Render every HTTP error as the typed ``{error, code}`` schema."""
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail and "code" in detail:
        payload = {"error": str(detail["error"]), "code": str(detail["code"])}
    else:
        payload = {
            "error": str(detail),
            "code": _STATUS_TO_CODE.get(exc.status_code, "error"),
        }
    return JSONResponse(
        payload, status_code=exc.status_code, headers=getattr(exc, "headers", None)
    )


@app.exception_handler(RequestValidationError)
async def validation_to_error_schema(request: Request, exc: RequestValidationError):
    """Render validation failures as ``{error, code}`` without echoing input.

    The default FastAPI 422 payload includes the submitted input values; for a
    resume service that would leak document content into error responses and
    any logging of them, so we emit only field locations and messages.
    """
    errors = exc.errors()
    if any(e.get("type") == "string_too_long" for e in errors):
        return JSONResponse(
            {
                "error": f"Input text exceeds the {MAX_TEXT_CHARS}-character limit.",
                "code": "text_too_long",
            },
            status_code=422,
        )
    first = errors[0] if errors else {}
    loc = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
    msg = first.get("msg", "Invalid request.")
    return JSONResponse(
        {"error": f"{loc}: {msg}" if loc else msg, "code": "invalid_request"},
        status_code=422,
    )


class AnalyzeRequest(BaseModel):
    resume: str = Field(
        ..., min_length=1, max_length=MAX_TEXT_CHARS, description="Candidate resume text"
    )
    job_description: str = Field(
        ..., min_length=1, max_length=MAX_TEXT_CHARS, description="Target JD text"
    )
    llm_consent: bool = Field(
        default=False,
        description=(
            "Explicit opt-in to send resume/JD text to the configured external "
            "LLM provider. Off by default: without it the analysis is fully "
            "deterministic and no text leaves the service."
        ),
    )


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    incoming_id = request.headers.get("X-Request-ID", "")
    request_id = (
        incoming_id if _REQUEST_ID_RE.fullmatch(incoming_id) else uuid.uuid4().hex
    )
    start = time.perf_counter()
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    elapsed_ms = round(elapsed * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-ms"] = str(elapsed_ms)
    # Responses can contain resume-derived content; forbid any caching.
    response.headers["Cache-Control"] = "no-store"
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


@api.post("/analyze")
def analyze_endpoint(req: AnalyzeRequest):
    result = analyze(req.resume, req.job_description, allow_llm=req.llm_consent)
    metrics.record_analysis(result["fit_score"], result["provider"])
    logger.info(
        "analysis_completed",
        status=result["status"],
        fit_score=result["fit_score"],
        provider=result["provider"],
        matched_count=len(result["matched_skills"]),
        missing_count=len(result["missing_skills"]),
    )
    return result


_FILE_TOO_LARGE = (
    f"File too large (max {extract.MAX_UPLOAD_BYTES // (1024 * 1024)} MB)."
)
# Generous allowance for multipart framing overhead when pre-checking the
# declared Content-Length of the whole request body.
_MULTIPART_OVERHEAD_BYTES = 16 * 1024


@api.post("/extract")
async def extract_endpoint(request: Request, file: UploadFile = File(...)):
    """Extract plain text from an uploaded resume file (PDF / DOCX / TXT).

    Returns ``{filename, chars, text}`` so the client can populate the resume
    field for review before analysing. The upload is size-guarded twice —
    a declared Content-Length pre-check, then a chunked read that aborts the
    moment the 5 MB cap is crossed — so an oversized body is never fully
    buffered. Filenames and document content are never logged.
    """
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > (
        extract.MAX_UPLOAD_BYTES + _MULTIPART_OVERHEAD_BYTES
    ):
        raise api_error(413, "payload_too_large", _FILE_TOO_LARGE)

    chunks: list[bytes] = []
    size = 0
    while chunk := await file.read(64 * 1024):
        size += len(chunk)
        if size > extract.MAX_UPLOAD_BYTES:
            raise api_error(413, "payload_too_large", _FILE_TOO_LARGE)
        chunks.append(chunk)
    data = b"".join(chunks)

    try:
        text = extract.extract_text(file.filename or "", data)
    except extract.UnsupportedFileType as exc:
        raise api_error(415, "unsupported_media_type", str(exc)) from exc
    except extract.ExtractionError as exc:
        raise api_error(422, "extraction_failed", str(exc)) from exc

    # Privacy: log only sizes — never the filename or any document content.
    logger.info("file_extracted", bytes=size, chars=len(text))
    return {"filename": file.filename, "chars": len(text), "text": text}


_ASYNC_DISABLED_ERROR = (
    "Async analysis is not configured on this deployment "
    "(KAFKA_BOOTSTRAP_SERVERS is unset)."
)


@api.post("/analyze/async", status_code=202)
def analyze_async_endpoint(req: AnalyzeRequest):
    """Enqueue an analysis job on Kafka and return its id immediately.

    The job is processed asynchronously by a consumer worker; poll
    /analyze/status/{job_id} for the result. When the event-driven path is not
    configured the endpoint fails deliberately (503) instead of accepting jobs
    that nothing will process.
    """
    from app import events

    if not events.enabled():
        raise api_error(503, "async_disabled", _ASYNC_DISABLED_ERROR)
    job_id = events.publish_job(req.resume, req.job_description)
    return {"job_id": job_id, "status": "queued"}


@api.get("/analyze/status/{job_id}")
def analyze_status_endpoint(job_id: str):
    from app import events

    if not events.enabled():
        raise api_error(503, "async_disabled", _ASYNC_DISABLED_ERROR)
    job = events.store.get(job_id)
    if job is None:
        raise api_error(404, "not_found", "Unknown job_id.")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "result": job.result,
        "error": job.error,
    }


# Mount the guarded API router at the root (back-compat) and under /v1.
app.include_router(api)
app.include_router(api, prefix="/v1")
