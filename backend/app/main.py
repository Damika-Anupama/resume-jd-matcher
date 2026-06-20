"""FastAPI service for the resume ↔ JD matcher.

Endpoints:
- GET  /            health check + active provider
- POST /analyze     { resume, job_description } -> structured match + suggestions
- GET  /metrics     Prometheus text exposition
"""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app import metrics
from app.llm_client import analyze, active_provider

logger = logging.getLogger("resume_jd_matcher")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Resume ↔ JD Matcher API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    resume: str = Field(..., min_length=1, description="Candidate resume text")
    job_description: str = Field(..., min_length=1, description="Target JD text")


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = time.perf_counter() - start
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time-ms"] = str(round(elapsed * 1000, 2))
    metrics.record_request(
        request.method, request.url.path, response.status_code, elapsed
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
        "analyzed",
        extra={
            "fit_score": result["fit_score"],
            "provider": result["provider"],
            "matched": len(result["matched_skills"]),
            "missing": len(result["missing_skills"]),
        },
    )
    return result
