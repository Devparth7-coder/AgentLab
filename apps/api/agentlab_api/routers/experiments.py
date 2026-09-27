from agentlab import models as m
from agentlab.db import get_db
from agentlab.executions import (
    create_experiment,
    dispatch_experiment,
    queue_experiment,
    resume_experiment,
)
from agentlab.schemas import ExperimentIn, ListFilter
from agentlab.serializers import experiment as serialize_experiment
from agentlab.serializers import row
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab_api.common import audit, bad, found

router = APIRouter(tags=["Experiments & evaluations"])


@router.get("/experiments", summary="List experiments, including measured progress")
def list_experiments(
    agent_id: str | None = None,
    benchmark_id: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    f = ListFilter(limit=limit, offset=offset)
    q = select(m.Experiment)
    if agent_id:
        q = q.join(m.AgentVersion, m.Experiment.agent_version_id == m.AgentVersion.id).where(
            m.AgentVersion.agent_id == agent_id
        )
    if benchmark_id:
        q = q.join(
            m.BenchmarkVersion, m.Experiment.benchmark_version_id == m.BenchmarkVersion.id
        ).where(m.BenchmarkVersion.benchmark_id == benchmark_id)
    if status:
        q = q.where(m.Experiment.status == status)
    return [
        serialize_experiment(db, ex)
        for ex in db.scalars(
            q.order_by(m.Experiment.created_at.desc()).offset(f.offset).limit(f.limit)
        ).all()
    ]


@router.post(
    "/experiments",
    status_code=201,
    summary="Create a reproducible, immutable experiment definition",
)
def create(body: ExperimentIn, request: Request, db: Session = Depends(get_db)):
    try:
        ex = create_experiment(db, body)
        audit(db, request, "experiment.create", "experiment", ex.id)
        db.commit()
        return serialize_experiment(db, ex)
    except ValueError as exc:
        db.rollback()
        bad(exc)


@router.get(
    "/experiments/{experiment_id}", summary="Progress, runs, metric definitions and provenance"
)
def detail(experiment_id: str, db: Session = Depends(get_db)):
    return serialize_experiment(db, found(db, m.Experiment, experiment_id), details=True)


@router.post(
    "/experiments/{experiment_id}/run", summary="Enqueue per-task jobs without blocking the API"
)
def run(experiment_id: str, request: Request, db: Session = Depends(get_db)):
    ex = found(db, m.Experiment, experiment_id)
    try:
        fresh = ex.status == "CREATED"
        queue_experiment(db, ex)
        audit(db, request, "experiment.enqueue", "experiment", ex.id, {"fresh": fresh})
        db.commit()
        dispatched = dispatch_experiment(ex.id) if fresh else 0
        return {"experiment": serialize_experiment(db, ex), "jobs_dispatched": dispatched}
    except Exception as exc:
        db.rollback()
        bad(exc, status_code=503 if "broker" in str(exc).lower() else 400)


@router.post(
    "/experiments/{experiment_id}/resume",
    summary="Re-enqueue only QUEUED runs; never re-executes historical results",
)
def resume(
    experiment_id: str,
    request: Request,
    recover_stale: bool = False,
    stale_after_seconds: int = 600,
    db: Session = Depends(get_db),
):
    ex = found(db, m.Experiment, experiment_id)
    try:
        ids = resume_experiment(
            db, ex, recover_stale=recover_stale, stale_after_seconds=stale_after_seconds
        )
    except ValueError as exc:
        bad(exc)
    audit(
        db,
        request,
        "experiment.resume_queued",
        "experiment",
        ex.id,
        {"queued": len(ids), "operator_opted_into_stale_recovery": recover_stale},
    )
    db.commit()
    try:
        count = dispatch_experiment(ex.id) if ids else 0
    except Exception as exc:
        bad(exc, 503)
    return {
        "experiment_id": ex.id,
        "jobs_dispatched": count,
        "note": "RUNNING jobs require explicit recover_stale=true after >=300 seconds; external calls may duplicate.",
    }


@router.post(
    "/experiments/{experiment_id}/cancel",
    summary="Cancel pending runs; in-flight runs are marked cancelled when they finish",
)
def cancel(experiment_id: str, request: Request, db: Session = Depends(get_db)):
    ex = found(db, m.Experiment, experiment_id)
    if ex.completed_at:
        raise HTTPException(409, "Completed experiments are immutable")
    ex.status = "CANCELLED"
    for r in db.scalars(
        select(m.ExperimentRun).where(
            m.ExperimentRun.experiment_id == ex.id, m.ExperimentRun.status == "QUEUED"
        )
    ).all():
        r.status = "CANCELLED"
        r.completed_at = m.now()
    audit(db, request, "experiment.cancel", "experiment", ex.id)
    db.commit()
    # Finalize immediately when nothing is in flight; otherwise last worker finalizes.
    from agentlab.executions import _finalize_if_complete

    with db.begin():
        _finalize_if_complete(db, ex.id)
    return serialize_experiment(db, ex)


@router.get("/evaluations", summary="List immutable per-run evaluation records")
def evaluations(
    experiment_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    f = ListFilter(limit=limit, offset=offset)
    q = select(m.Evaluation)
    if experiment_id:
        q = q.where(m.Evaluation.experiment_id == experiment_id)
    return [
        row(e)
        for e in db.scalars(
            q.order_by(m.Evaluation.evaluated_at.desc()).offset(f.offset).limit(f.limit)
        ).all()
    ]


@router.get(
    "/evaluations/{evaluation_id}", summary="Evaluator type, version, score, reason and evidence"
)
def evaluation(evaluation_id: str, db: Session = Depends(get_db)):
    e = found(db, m.Evaluation, evaluation_id)
    results = db.scalars(
        select(m.EvaluationResult).where(m.EvaluationResult.evaluation_id == e.id)
    ).all()
    return {**row(e), "results": [row(r) for r in results]}
