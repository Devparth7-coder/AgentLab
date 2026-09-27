from agentlab import models as m
from agentlab.db import get_db
from agentlab.metrics import DEFINITIONS
from agentlab.regression import compare
from agentlab.robustness import generate
from agentlab.schemas import CompareIn, ListFilter, RobustnessIn
from agentlab.serializers import benchmark as serialize_benchmark
from agentlab.serializers import experiment as serialize_experiment
from agentlab.serializers import row
from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from agentlab_api.common import audit, bad, found

router = APIRouter(tags=["Overview, regression, robustness & intelligence"])


@router.get(
    "/overview",
    summary="Real counts and latest completed metric records, never fabricated statistics",
)
def overview(db: Session = Depends(get_db)):
    latest = db.scalar(
        select(m.Experiment)
        .where(m.Experiment.completed_at.is_not(None))
        .order_by(m.Experiment.completed_at.desc())
        .limit(1)
    )
    recent = db.scalars(
        select(m.Experiment).order_by(m.Experiment.created_at.desc()).limit(8)
    ).all()
    return {
        "latest_experiment": serialize_experiment(db, latest, details=True) if latest else None,
        "recent_experiments": [serialize_experiment(db, e) for e in recent],
        "counts": {
            "agents": db.scalar(select(func.count()).select_from(m.Agent)) or 0,
            "benchmarks": db.scalar(select(func.count()).select_from(m.Benchmark)) or 0,
            "experiments": db.scalar(select(func.count()).select_from(m.Experiment)) or 0,
            "failures": db.scalar(select(func.count()).select_from(m.Failure)) or 0,
            "traces": db.scalar(select(func.count()).select_from(m.Trace)) or 0,
        },
        "message": "NO EVALUATIONS YET" if not latest else None,
    }


@router.get(
    "/metrics/definitions",
    summary="Formula, data source and directionality for every platform metric",
)
def definitions():
    return [
        {
            "key": key,
            "definition": spec[0],
            "formula": spec[1],
            "unit": spec[2],
            "direction": spec[3],
            "data_source": spec[4],
        }
        for key, spec in DEFINITIONS.items()
    ]


@router.get("/regressions", summary="List immutable paired comparisons")
def regressions(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    f = ListFilter(limit=limit, offset=offset)
    return [
        row(r)
        for r in db.scalars(
            select(m.Regression)
            .order_by(m.Regression.created_at.desc())
            .offset(f.offset)
            .limit(f.limit)
        ).all()
    ]


@router.post(
    "/regressions/compare",
    status_code=201,
    summary="Compare matched task/run pairs on the same benchmark and harness",
)
def compare_runs(body: CompareIn, request: Request, db: Session = Depends(get_db)):
    baseline = found(db, m.Experiment, body.baseline_experiment_id)
    candidate = found(db, m.Experiment, body.candidate_experiment_id)
    try:
        result = compare(db, baseline, candidate)
        audit(
            db,
            request,
            "regression.compare",
            "regression",
            result.id,
            {"baseline": baseline.id, "candidate": candidate.id},
        )
        db.commit()
        return row(result)
    except ValueError as exc:
        db.rollback()
        bad(exc)


@router.post(
    "/robustness/generate",
    status_code=201,
    summary="Create an immutable suite of controlled, sandboxed variants",
)
def robustness(body: RobustnessIn, request: Request, db: Session = Depends(get_db)):
    try:
        b = generate(db, body)
        audit(
            db,
            request,
            "robustness.generate",
            "benchmark",
            b.id,
            {"transformations": body.transformations},
        )
        db.commit()
        return serialize_benchmark(db, b)
    except ValueError as exc:
        db.rollback()
        bad(exc)


@router.get(
    "/cost/summary", summary="Agent inference usage and pricing coverage for one experiment"
)
def cost_summary(experiment_id: str, db: Session = Depends(get_db)):
    ex = found(db, m.Experiment, experiment_id)
    records = db.scalars(
        select(m.CostRecord)
        .join(m.ExperimentRun, m.ExperimentRun.id == m.CostRecord.run_id)
        .where(m.ExperimentRun.experiment_id == ex.id)
    ).all()
    cost = db.scalar(
        select(m.Metric).where(
            m.Metric.experiment_id == ex.id, m.Metric.key == "estimated_cost_usd"
        )
    )
    total = db.scalar(
        select(m.Metric).where(m.Metric.experiment_id == ex.id, m.Metric.key == "total_tokens")
    )
    return {
        "experiment_id": ex.id,
        "estimated_cost_usd": row(cost) if cost else None,
        "total_tokens": row(total) if total else None,
        "records": [row(r) for r in records],
        "note": "Cost excludes LLM judge and tool fees. Null means Not measured; partial coverage is never displayed as total.",
    }


@router.get(
    "/latency/distribution",
    summary="Observed per-run wall-clock and tool latencies; no estimated times",
)
def latency_distribution(experiment_id: str, db: Session = Depends(get_db)):
    ex = found(db, m.Experiment, experiment_id)
    records = db.scalars(
        select(m.LatencyRecord)
        .join(m.ExperimentRun, m.ExperimentRun.id == m.LatencyRecord.run_id)
        .where(m.ExperimentRun.experiment_id == ex.id)
    ).all()
    return {
        "experiment_id": ex.id,
        "records": [row(r) for r in records],
        "note": "Total duration measured by monotonic clock; TTFT is provider-reported only when available.",
    }
