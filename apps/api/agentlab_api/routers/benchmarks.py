import json
from pathlib import Path

from agentlab import models as m
from agentlab.benchmarks import clone_with_task, new_benchmark
from agentlab.db import get_db
from agentlab.schemas import AddTaskIn, BenchmarkIn, ListFilter, TaskIn
from agentlab.serializers import benchmark as serialize_benchmark
from agentlab.serializers import row
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab_api.common import audit, bad, found

router = APIRouter(tags=["Benchmarks & tasks"])


@router.get("/benchmarks/catalog", summary="Starter suite templates, not scored results")
def catalog():
    file = Path(__file__).resolve().parents[4] / "benchmarks" / "catalog.json"
    # Docker layout is /app/apps/api/agentlab_api/routers -> /app/benchmarks.
    return json.loads(file.read_text())


@router.get("/benchmarks", summary="List benchmark definitions and versions")
def benchmarks(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    f = ListFilter(limit=limit, offset=offset)
    return [
        serialize_benchmark(db, b)
        for b in db.scalars(
            select(m.Benchmark)
            .order_by(m.Benchmark.created_at.desc())
            .offset(f.offset)
            .limit(f.limit)
        ).all()
    ]


@router.post(
    "/benchmarks",
    status_code=201,
    summary="Create a benchmark with tasks and pinned reference rules",
)
def create(body: BenchmarkIn, request: Request, db: Session = Depends(get_db)):
    try:
        b = new_benchmark(db, body)
        audit(db, request, "benchmark.create", "benchmark", b.id, {"task_count": len(body.tasks)})
        db.commit()
        return serialize_benchmark(db, b)
    except ValueError as exc:
        db.rollback()
        bad(exc)


@router.get(
    "/benchmarks/{benchmark_id}", summary="Inspect benchmark and all immutable versions/tasks"
)
def detail(benchmark_id: str, db: Session = Depends(get_db)):
    return serialize_benchmark(db, found(db, m.Benchmark, benchmark_id), include_tasks=True)


@router.get("/tasks", summary="List tasks, optionally filtered by benchmark version")
def tasks(
    benchmark_version_id: str | None = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    f = ListFilter(limit=limit, offset=offset)
    query = select(m.Task)
    if benchmark_version_id:
        query = query.where(m.Task.benchmark_version_id == benchmark_version_id)
    return [
        row(t)
        for t in db.scalars(query.order_by(m.Task.task_key).offset(f.offset).limit(f.limit)).all()
    ]


@router.post(
    "/tasks",
    status_code=201,
    summary="Add a task by cloning the source benchmark into a NEW immutable version",
)
def add_task(body: AddTaskIn, request: Request, db: Session = Depends(get_db)):
    source = found(db, m.BenchmarkVersion, body.benchmark_version_id)
    task = TaskIn(**body.model_dump(exclude={"benchmark_version_id", "new_version"}))
    try:
        version, new = clone_with_task(db, source, body.new_version, task)
        audit(
            db,
            request,
            "benchmark.task.add",
            "benchmark_version",
            version.id,
            {"source_version": source.id},
        )
        db.commit()
        return {"task": row(new), "new_benchmark_version": row(version)}
    except ValueError as exc:
        db.rollback()
        bad(exc)
