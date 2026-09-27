"""AGENTLAB REST API. No user-controlled code or untrusted external tool execution."""

import hashlib
import hmac
import json
import logging
import threading
import time
from contextlib import asynccontextmanager
from uuid import uuid4

import redis
from agentlab.config import settings
from agentlab.db import SessionLocal
from agentlab.demo import seed
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from agentlab_api.routers import (
    agents,
    analytics,
    benchmarks,
    demo,
    experiments,
    failures,
    monitoring,
    reports,
    traces,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("agentlab.api")
_limit_lock = threading.Lock()
_local_counts: dict[str, tuple[int, int]] = {}
redis_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = settings()
    cfg.validate_deployment()
    global redis_client
    if cfg.queue_mode == "celery":
        redis_client = redis.Redis.from_url(
            cfg.redis_url, socket_connect_timeout=1, socket_timeout=1
        )
    if cfg.demo_seed:
        with SessionLocal.begin() as db:
            seed(db)  # idempotent fixture definitions only; never writes scores
    logger.info(
        json.dumps({"event": "api_started", "environment": cfg.env, "queue": cfg.queue_mode})
    )
    yield


app = FastAPI(
    title="AGENTLAB · Agent Reliability API",
    version="0.1.0",
    lifespan=lifespan,
    description="Evidence-first agent benchmarking. All demo data is labeled. Historical results are append-only. Auth: X-API-Key. /docs and /openapi.json document every route.",
    openapi_tags=[
        {
            "name": "Agents & immutable versions",
            "description": "Registry, secret references, configuration fingerprints.",
        },
        {
            "name": "Experiments & evaluations",
            "description": "Durable per-task jobs; reruns create new experiments.",
        },
        {
            "name": "Traces & observable tool calls",
            "description": "Redacted observable events; never private reasoning.",
        },
    ],
)


def _rate_ok(identity: str) -> bool:
    cfg = settings()
    window = int(time.time() // 60)
    key = "agentlab:rate:" + hashlib.sha256(identity.encode()).hexdigest() + f":{window}"
    if redis_client is not None:
        try:
            pipe = redis_client.pipeline()
            pipe.incr(key)
            pipe.expire(key, 65)
            count, _ = pipe.execute()
            return count <= cfg.rate_limit_per_minute
        except redis.RedisError:
            if cfg.env == "production":
                raise  # fail closed, don't bypass distributed rate limits
    with _limit_lock:
        if len(_local_counts) > 20000:
            _local_counts.clear()
        count, period = _local_counts.get(key, (0, window))
        count = count + 1 if period == window else 1
        _local_counts[key] = (count, window)
        return count <= cfg.rate_limit_per_minute


@app.middleware("http")
async def security_and_observability(request: Request, call_next):
    start = time.perf_counter()
    request_id = uuid4().hex[:16]
    request.state.request_id = request_id
    status = 500
    cfg = settings()
    try:
        if request.method in {"POST", "PUT", "PATCH"}:
            header = request.headers.get("content-length")
            if header:
                try:
                    declared_size = int(header)
                except ValueError:
                    status = 400
                    return JSONResponse({"detail": "Invalid Content-Length"}, status_code=status)
                if declared_size > cfg.max_request_bytes:
                    status = 413
                    return JSONResponse(
                        {"detail": "Request exceeds size limit"}, status_code=status
                    )
            # Bound chunked requests too; request._body is consumed by the downstream FastAPI parser.
            chunks = []
            length = 0
            async for chunk in request.stream():
                length += len(chunk)
                if length > cfg.max_request_bytes:
                    status = 413
                    return JSONResponse(
                        {"detail": "Request exceeds size limit"}, status_code=status
                    )
                chunks.append(chunk)
            request._body = b"".join(chunks)
        public = request.url.path in {"/health", "/docs", "/openapi.json", "/redoc"}
        if cfg.auth_mode == "required" and not public:
            key = request.headers.get("x-api-key", "")
            admin = bool(key) and hmac.compare_digest(key, cfg.api_key)
            viewer = bool(key and cfg.readonly_api_key) and hmac.compare_digest(
                key, cfg.readonly_api_key
            )
            if not admin and not viewer:
                status = 401
                return JSONResponse({"detail": "Valid X-API-Key required"}, status_code=status)
            if viewer and request.method not in {"GET", "HEAD", "OPTIONS"}:
                status = 403
                return JSONResponse({"detail": "Viewer key is read-only"}, status_code=status)
            request.state.actor = "api-key-admin" if admin else "api-key-viewer"
        else:
            request.state.actor = "local-developer" if cfg.auth_mode == "disabled" else "anonymous"
        if not public:
            identity = (
                request.headers.get("x-api-key", "") or request.client.host
                if request.client
                else "unknown"
            )
            try:
                allowed = _rate_ok(identity)
            except redis.RedisError:
                status = 503
                return JSONResponse({"detail": "Rate limiter unavailable"}, status_code=status)
            if not allowed:
                status = 429
                return JSONResponse(
                    {"detail": "Rate limit exceeded"},
                    status_code=status,
                    headers={"Retry-After": "60"},
                )
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response
    except Exception:
        status = 500
        raise
    finally:
        logger.info(
            json.dumps(
                {
                    "event": "http_request",
                    "request_id": request_id,
                    "timestamp": time.time(),
                    "user_id": getattr(request.state, "actor", "unknown"),
                    "agent_id": request.path_params.get("agent_id"),
                    "experiment_id": request.path_params.get("experiment_id"),
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 3),
                    "status": status,
                }
            )
        )


@app.get("/health", tags=["Health"], summary="Liveness and database readiness")
def health():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "service": "agentlab-api",
            "queue_mode": settings().queue_mode,
            "demo_mode": settings().demo_seed,
            "auth_required": settings().auth_mode == "required",
        }
    except Exception:
        return JSONResponse({"status": "degraded", "database": "unavailable"}, status_code=503)


for router in (
    agents.router,
    benchmarks.router,
    experiments.router,
    traces.router,
    failures.router,
    analytics.router,
    reports.router,
    demo.router,
    monitoring.router,
):
    app.include_router(router)


@app.exception_handler(IntegrityError)
def integrity_conflict(request: Request, exc: IntegrityError):
    # Avoid disclosing raw SQL/parameters; DB uniqueness is the final concurrency guard.
    return JSONResponse(
        {"detail": "Unique constraint conflict; names and version IDs are immutable"},
        status_code=409,
    )
