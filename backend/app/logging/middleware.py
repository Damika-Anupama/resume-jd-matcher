import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = structlog.get_logger(__name__)

class StructuredLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = Response(status_code=500)
        try:
            response = await call_next(request)
            logger.info(
                "request",
                path=request.url.path,
                method=request.method,
                status_code=response.status_code,
                client_ip=request.client.host if request.client else None,
            )
        except Exception as e:
            logger.error(
                "request_error",
                path=request.url.path,
                method=request.method,
                error=str(e),
                exc_info=True,
            )
            raise
        return response
