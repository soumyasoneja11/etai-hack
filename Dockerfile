# ---------------------------------------------------------------------------
# Shared backend image for BOTH FastAPI services (ingestion_detection A +
# correlation_response B). The dependency sets fully overlap, so we build one
# image and select the service via the container `command` (see
# docker-compose.yml): each runs Gunicorn + uvicorn workers against its app.
# ---------------------------------------------------------------------------
FROM python:3.11-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# libgomp1 is required at runtime by LightGBM; curl is used by the healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching (requirements.txt is the pinned
# lock generated from pyproject.toml).
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Application code (only the backend packages + shared + deploy config).
COPY shared ./shared
COPY ingestion_detection ./ingestion_detection
COPY correlation_response ./correlation_response
COPY deploy ./deploy
COPY pyproject.toml ./

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# A=8000, B=8001 (documentation only; the actual bind comes from $PORT).
EXPOSE 8000 8001

# Default command runs service A; compose overrides it for service B. Both bind
# $PORT via deploy/gunicorn_conf.py.
ENV PORT=8000 WEB_CONCURRENCY=1
CMD ["gunicorn", "ingestion_detection.main:app", "-c", "deploy/gunicorn_conf.py"]
