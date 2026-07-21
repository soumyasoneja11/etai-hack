"""Structured JSON logging + request-id correlation.

- ``JsonFormatter`` emits one JSON object per log line (stdout), so a log
  aggregator can parse fields instead of scraping free-text.
- ``request_id_var`` (a ContextVar) carries a correlation id for the lifetime of
  a request. It is stamped onto every log line and flows across the A->B call
  (see ``correlation_forward.py``) and into every response envelope, so a single
  logical request can be traced end-to-end.

This module intentionally imports nothing from the rest of the app (and no web
framework) so it is safe to import from anywhere, including ``envelope``.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# Header used to carry the correlation id between clients and services.
REQUEST_ID_HEADER = "X-Request-ID"

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)


def get_request_id() -> str | None:
    """Return the correlation id for the current request, if any."""
    return request_id_var.get()


def set_request_id(value: str | None) -> None:
    request_id_var.set(value)


# Standard LogRecord attributes we don't want to duplicate when copying "extra".
_RESERVED = frozenset(
    vars(logging.makeLogRecord({})).keys()
) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    """Render a LogRecord as a single-line JSON object."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(
                record.created, tz=timezone.utc
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        rid = request_id_var.get()
        if rid:
            payload["request_id"] = rid

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack_info"] = self.formatStack(record.stack_info)

        # Merge any structured `extra=` fields passed by the caller.
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload.setdefault(key, value)

        return json.dumps(payload, default=str)


def configure_logging(level: str | None = None) -> None:
    """Install the JSON formatter on the root logger (replaces basicConfig).

    Idempotent: safe to call at every process/worker start. Log level is read
    from the ``LOG_LEVEL`` env var (default INFO) unless overridden.
    """
    lvl = (level or os.getenv("LOG_LEVEL", "INFO")).upper()

    root = logging.getLogger()
    root.setLevel(lvl)

    # Drop any pre-existing handlers (e.g. a previous basicConfig) so we don't
    # emit each line twice or in a non-JSON format.
    for handler in list(root.handlers):
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)

    # Route uvicorn's own loggers through the root handler for consistent JSON.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "gunicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers.clear()
        lg.propagate = True
