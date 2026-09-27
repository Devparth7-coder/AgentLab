"""Operational observability counters. Process-local API timings are explicitly labeled."""

from datetime import timedelta

from agentlab import models as m
from agentlab.db import get_db
from agentlab.metrics import percentile
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

router = APIRouter(prefix="/system", tags=["Operational monitoring"])


@router.get(
    "/metrics", summary="Measured queue depth, failed runs and one-hour evaluation throughput"
)
def operational_metrics(db: Session = Depends(get_db)):
    """Counts are database-derived. API request latency is in structured logs (per process)."""
    completed_since = m.now() - timedelta(hours=1)
    queued = (
        db.scalar(
            select(func.count())
            .select_from(m.ExperimentRun)
            .where(m.ExperimentRun.status == "QUEUED")
        )
        or 0
    )
    running = (
        db.scalar(
            select(func.count())
            .select_from(m.ExperimentRun)
            .where(m.ExperimentRun.status == "RUNNING")
        )
        or 0
    )
    failed_jobs = (
        db.scalar(
            select(func.count())
            .select_from(m.ExperimentRun)
            .where(m.ExperimentRun.status == "ERROR")
        )
        or 0
    )
    recent_count = (
        db.scalar(
            select(func.count())
            .select_from(m.ExperimentRun)
            .where(
                m.ExperimentRun.completed_at >= completed_since,
                m.ExperimentRun.status.in_(["PASSED", "FAILED", "ERROR"]),
            )
        )
        or 0
    )
    # Explicit null when there are no observations; a quiet system is not a zero-latency system.
    recent_ms = db.scalars(
        select(m.LatencyRecord.total_ms)
        .where(m.LatencyRecord.measured_at >= completed_since)
        .limit(5000)
    ).all()
    return {
        "measured_at": m.now().isoformat(),
        "source": "experiment_runs + latency_records",
        "queued_runs": queued,
        "running_runs": running,
        "error_runs_total": failed_jobs,
        "evaluated_runs_last_hour": recent_count,
        "throughput_runs_per_hour": recent_count,
        "worker_run_latency_p95_ms": percentile(recent_ms, 0.95),
        "worker_latency_samples": len(recent_ms),
        "api_latency_source": "structured http_request logs; aggregate across API replicas in your log collector",
        "limitations": "Counts cover this database; throughput is a trailing-hour count, not instantaneous rate. Celery broker depth is not inferred from DB queued state.",
    }
