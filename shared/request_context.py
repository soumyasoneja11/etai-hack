"""Request-scoped correlation-id middleware.

Generates (or reuses an inbound) ``X-Request-ID`` at the edge, binds it to the
logging ContextVar for the duration of the request, and echoes it back on the
response. Kept separate from ``logging_config`` so that module stays free of any
web-framework import.
"""

from __future__ import annotations

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

from shared.logging_config import REQUEST_ID_HEADER, request_id_var


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get(REQUEST_ID_HEADER) or str(uuid4())
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
            response.headers[REQUEST_ID_HEADER] = rid
            return response
        finally:
            request_id_var.reset(token)


def install_request_context(app: ASGIApp) -> None:
    """Register the correlation-id middleware on a FastAPI/Starlette app."""
    app.add_middleware(RequestContextMiddleware)
