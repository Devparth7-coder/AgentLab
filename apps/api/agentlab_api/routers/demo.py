from agentlab.db import get_db
from agentlab.demo import seed
from agentlab.executions import create_experiment, queue_experiment
from agentlab.schemas import DemoRunIn, ExperimentIn
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from agentlab_api.common import audit, dispatch_or_unavailable

router = APIRouter(prefix="/demo", tags=["Clearly labeled DEMO fixtures"])


@router.post(
    "/seed",
    summary="Register synthetic agent/benchmark fixture definitions; does not create scores",
)
def seed_demo(request: Request, db: Session = Depends(get_db)):
    ids = seed(db)
    audit(db, request, "demo.seed", "demo", ids["agent_id"])
    db.commit()
    return {"label": "DEMO · deterministic mock, NOT a real agent benchmark", **ids}


@router.post(
    "/run",
    status_code=202,
    summary="Run 50 cases for each demo version through the actual evaluation workers",
)
def run_demo(body: DemoRunIn, request: Request, db: Session = Depends(get_db)):
    ids = seed(db)
    exps = []
    for label, version in (
        ("v1 · baseline", ids["v1_id"]),
        ("v2 · controlled regression", ids["v2_id"]),
    ):
        exp = create_experiment(
            db,
            ExperimentIn(
                name=f"DEMO · Revenue analysis · {label}",
                agent_version_id=version,
                benchmark_version_id=ids["benchmark_version_id"],
                seed=body.seed,
                runs_per_task=1,
                environment={"fixture": "demo-revenue-1.0.0"},
            ),
        )
        queue_experiment(db, exp)
        exps.append(exp.id)
    audit(db, request, "demo.run", "demo", ids["agent_id"], {"experiment_ids": exps})
    db.commit()
    for experiment_id in exps:
        dispatch_or_unavailable(experiment_id)
    return {
        "label": "DEMO · scores will be MEASURED from 100 executed mock runs",
        "baseline_experiment_id": exps[0],
        "candidate_experiment_id": exps[1],
    }
