"""Gunicorn config shared by both backend services (production ASGI).

Run e.g.:
    gunicorn ingestion_detection.main:app  -c deploy/gunicorn_conf.py
    gunicorn correlation_response.main:app -c deploy/gunicorn_conf.py

Everything is env-driven so the same file/image serves both services:
    PORT             bind port           (default 8000)
    HOST             bind host           (default 0.0.0.0)
    WEB_CONCURRENCY  number of workers   (default 2)
    GUNICORN_TIMEOUT worker timeout secs (default 60)
"""

import os

# Bind $PORT (PaaS/orchestrator convention) or the service default.
bind = f"{os.getenv('HOST', '0.0.0.0')}:{os.getenv('PORT', '8000')}"

# ASGI: uvicorn workers under gunicorn's process manager (graceful restarts,
# multiple workers) instead of a single-process uvicorn.run().
worker_class = "uvicorn.workers.UvicornWorker"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))

timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
graceful_timeout = int(os.getenv("GUNICORN_GRACEFUL_TIMEOUT", "30"))
keepalive = int(os.getenv("GUNICORN_KEEPALIVE", "5"))

# Log to stdout/stderr; the app installs JSON formatting via configure_logging().
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
