from datetime import datetime

from agentlab import models as m
from agentlab.db import get_db
from agentlab.executions import create_experiment, queue_experiment
from agentlab.schemas import ExperimentIn, ListFilter
from agentlab.serializers import failure as serialize_failure
from agentlab.serializers import row
from fastapi import APIRouter, Depends, Request
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from agentlab_api.common import audit, bad, dispatch_or_unavailable, found

router = APIRouter(prefix="/failures", tags=["Failure explorer & replay"])


@router.get("", summary="Search failures by agent, version, severity, type, benchmark, date")
def list_failures(
    experiment_id: str | None = None,
    agent_id: str | None = None,
    version_id: str | None = None,
    severity: str | None = None,
    failure_type: str | None = None,
    benchmark_version_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    f = ListFilter(limit=limit, offset=offset)
    q = select(m.Failure)
    if experiment_id:
        q = q.where(m.Failure.experiment_id == experiment_id)
    if agent_id:
        q = q.where(
            m.Failure.agent_version_id.in_(
                select(m.AgentVersion.id).where(m.AgentVersion.agent_id == agent_id)
            )
        )
    if version_id:
        q = q.where(m.Failure.agent_version_id == version_id)
    if severity:
        q = q.where(m.Failure.severity == severity)
    if failure_type:
        q = q.where(m.Failure.failure_type == failure_type)
    if benchmark_version_id:
        q = q.where(
            m.Failure.experiment_id.in_(
                select(m.Experiment.id).where(
                    m.Experiment.benchmark_version_id == benchmark_version_id
                )
            )
        )
    if date_from:
        q = q.where(m.Failure.detected_at >= date_from)
    if date_to:
        q = q.where(m.Failure.detected_at <= date_to)
    if search:
        term = "%" + search[:100] + "%"
        q = q.where(
            or_(
                m.Failure.summary.ilike(term),
                m.Failure.failure_type.ilike(term),
                m.Failure.task_id.in_(select(m.Task.id).where(m.Task.task_key.ilike(term))),
            )
        )
    return [
        serialize_failure(db, x)
        for x in db.scalars(
            q.order_by(m.Failure.detected_at.desc()).offset(f.offset).limit(f.limit)
        ).all()
    ]


@router.get("/{failure_id}", summary="Expected vs observed, evidence, trace and replay history")
def detail(failure_id: str, db: Session = Depends(get_db)):
    return serialize_failure(db, found(db, m.Failure, failure_id), details=True)


@router.post(
    "/{failure_id}/replay",
    status_code=202,
    summary="Create a NEW experiment for one failure; preserve original evidence",
)
def replay(failure_id: str, request: Request, db: Session = Depends(get_db)):
    f = found(db, m.Failure, failure_id)
    original = found(db, m.Experiment, f.experiment_id)
    original_run = found(db, m.ExperimentRun, f.run_id)
    try:
        ex = create_experiment(
            db,
            ExperimentIn(
                name=f"Replay · {f.id[:10]}",
                agent_version_id=original.agent_version_id,
                benchmark_version_id=original.benchmark_version_id,
                task_ids=[f.task_id],
                seed=original.seed,
                runs_per_task=1,
                configuration={
                    **original.configuration,
                    "replay_run_index": original_run.run_index,
                },
                environment=original.environment,
            ),
            replay_of_failure_id=f.id,
        )
        repro = m.FailureReproduction(failure_id=f.id, experiment_id=ex.id)
        db.add(repro)
        queue_experiment(db, ex)
        audit(db, request, "failure.replay", "failure", f.id, {"new_experiment_id": ex.id})
        db.commit()
        dispatch_or_unavailable(ex.id)
        return {
            "reproduction": row(repro),
            "experiment_id": ex.id,
            "note": "Pending verification. External provider replays are never claimed deterministic.",
        }
    except ValueError as exc:
        db.rollback()
        bad(exc)
