"""CyberShield NIC standard API response envelope."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Generic, TypeVar
from uuid import uuid4

from pydantic import BaseModel, Field

from shared.logging_config import get_request_id

T = TypeVar("T")


def _resolve_request_id(request_id: str | None) -> str:
    """Prefer an explicit id, else the current request's correlation id."""
    return request_id or get_request_id() or str(uuid4())


class ApiMeta(BaseModel):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    request_id: str = Field(default_factory=lambda: str(uuid4()))


class ApiErrorBody(BaseModel):
    code: str
    message: str


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    error: ApiErrorBody | None = None
    meta: ApiMeta = Field(default_factory=ApiMeta)


def success_response(data: Any, request_id: str | None = None) -> dict[str, Any]:
    meta = ApiMeta(request_id=_resolve_request_id(request_id))
    return ApiResponse(success=True, data=data, error=None, meta=meta).model_dump(mode="json")


def error_response(code: str, message: str, request_id: str | None = None) -> dict[str, Any]:
    meta = ApiMeta(request_id=_resolve_request_id(request_id))
    return ApiResponse(
        success=False,
        data=None,
        error=ApiErrorBody(code=code, message=message),
        meta=meta,
    ).model_dump(mode="json")
