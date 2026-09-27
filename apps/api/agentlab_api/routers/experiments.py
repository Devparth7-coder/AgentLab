from agentlab import models as m
from agentlab.db import get_db
from agentlab.executions import (
    create_experiment,
    queue_experiment,
    resume_experiment,
)
from agentlab.metrics import wilson_ci
from agentlab.schemas import ExperimentIn, ListFilter
from agentlab.serializers import experiment as serialize_experiment
from agentlab.serializers import row
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab_api.common import audit, bad, dispatch_or_unavailable, found

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


@router.get(
    "/experiments/{experiment_id}/runs", summary="Paginated task/run records for large experiments"
)
def run_page(experiment_id: str, limit: int = 200, offset: int = 0, db: Session = Depends(get_db)):
    found(db, m.Experiment, experiment_id)
    f = ListFilter(limit=limit, offset=offset)
    runs = db.scalars(
        select(m.ExperimentRun)
        .where(m.ExperimentRun.experiment_id == experiment_id)
        .order_by(m.ExperimentRun.task_id, m.ExperimentRun.run_index)
        .offset(f.offset)
        .limit(f.limit)
    ).all()
    return [
        {
            **row(r),
            "task_key": db.get(m.Task, r.task_id).task_key,
            "trace_id": db.scalar(select(m.Trace.id).where(m.Trace.run_id == r.id)),
            "failure_id": db.scalar(select(m.Failure.id).where(m.Failure.run_id == r.id)),
        }
        for r in runs
    ]


@router.get(
    "/experiments/{experiment_id}/task-distribution",
    summary="Per-task N-run success, Wilson interval and observed Bernoulli variance",
)
def task_distribution(experiment_id: str, db: Session = Depends(get_db)):
    ex = found(db, m.Experiment, experiment_id)
    runs = db.scalars(select(m.ExperimentRun).where(m.ExperimentRun.experiment_id == ex.id)).all()
    by_task: dict[str, list[m.ExperimentRun]] = {}
    for run in runs:
        by_task.setdefault(run.task_id, []).append(run)
    items = []
    for task_id, trials in by_task.items():
        evaluated = [r for r in trials if r.status in {"PASSED", "FAILED", "ERROR"}]
        n = len(evaluated)
        passed = sum(r.status == "PASSED" for r in evaluated)
        rate = passed / n if n else None
        items.append(
            {
                "task_id": task_id,
                "task_key": db.get(m.Task, task_id).task_key,
                "n": n,
                "passed": passed,
                "failed": sum(r.status == "FAILED" for r in evaluated),
                "errors": sum(r.status == "ERROR" for r in evaluated),
                "cancelled": sum(r.status == "CANCELLED" for r in trials),
                "success_rate_percent": round(rate * 100, 6) if rate is not None else None,
                "wilson_95_ci_percent": wilson_ci(passed, n),
                "observed_sample_variance": round((passed * (n - passed)) / (n * (n - 1)), 6)
                if n > 1
                else None,
            }
        )
    return {
        "experiment_id": ex.id,
        "agent_version_id": ex.agent_version_id,
        "benchmark_version_id": ex.benchmark_version_id,
        "evaluation_version": ex.evaluation_version,
        "tasks": sorted(items, key=lambda x: x["task_key"]),
        "note": "Bernoulli sample variance p(1-p)*n/(n-1) for n>=2; 95% Wilson intervals describe uncertainty, not significance.",
    }


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
    except ValueError as exc:
        db.rollback()
        bad(exc)
    dispatched = dispatch_or_unavailable(ex.id) if fresh else 0
    return {"experiment": serialize_experiment(db, ex), "jobs_dispatched": dispatched}


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
    count = dispatch_or_unavailable(ex.id) if ids else 0
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
