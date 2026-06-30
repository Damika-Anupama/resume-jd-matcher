from prometheus_client import Counter, Histogram
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

REQUEST_COUNT = Counter(
    "resume_jd_matcher_requests_total",
    "Total count of requests by method and path",
    ["method", "path"],
)
REQUEST_LATENCY = Histogram(
    "resume_jd_matcher_request_duration_seconds",
    "Histogram of request latency by path (seconds)",
    ["path"],
)
LLM_TOKEN_USAGE = Counter(
    "resume_jd_matcher_llm_tokens_total",
    "Total tokens used by the LLM provider",
    ["provider", "model"],
)

class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        method = request.method
        path = request.url.path
        REQUEST_COUNT.labels(method=method, path=path).inc()
        with REQUEST_LATENCY.labels(path=path).time():
            response = await call_next(request)
        return response
