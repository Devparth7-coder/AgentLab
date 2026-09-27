"""Explicit API projections; private prompt text and provider secrets are never returned."""

from datetime import date, datetime

from sqlalchemy import func, inspect, select
from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.security import redact


def row(obj, exclude: tuple[str, ...] = ()) -> dict:
    result = {}
    for col in inspect(obj).mapper.column_attrs:
        key = col.key
        if key in exclude or key == "prompt_template":
            continue
        v = getattr(obj, key)
        result[key] = v.isoformat() if isinstance(v, (datetime, date)) else redact(v)
    return result


def agent(db: Session, a: m.Agent) -> dict:
    versions = db.scalars(
        select(m.AgentVersion)
        .where(m.AgentVersion.agent_id == a.id)
        .order_by(m.AgentVersion.created_at.desc())
    ).all()
    return {
        **row(a),
        "versions": [row(v) for v in versions],
        "latest_version": versions[0].version if versions else None,
    }


def benchmark(db: Session, b: m.Benchmark, *, include_tasks: bool = False) -> dict:
    versions = db.scalars(
        select(m.BenchmarkVersion)
        .where(m.BenchmarkVersion.benchmark_id == b.id)
        .order_by(m.BenchmarkVersion.created_at.desc())
    ).all()
    entries = []
    for v in versions:
        count = (
            db.scalar(
                select(func.count()).select_from(m.Task).where(m.Task.benchmark_version_id == v.id)
            )
            or 0
        )
        item = {**row(v), "task_count": count}
        if include_tasks:
            item["tasks"] = [
                row(t)
                for t in db.scalars(
                    select(m.Task)
                    .where(m.Task.benchmark_version_id == v.id)
                    .order_by(m.Task.task_key)
                ).all()
            ]
        entries.append(item)
    return {
        **row(b),
        "versions": entries,
        "latest_version": entries[0]["version"] if entries else None,
    }


def experiment(db: Session, ex: m.Experiment, *, details: bool = False) -> dict:
    ver = db.get(m.AgentVersion, ex.agent_version_id)
    agent_row = db.get(m.Agent, ver.agent_id) if ver else None
    bver = db.get(m.BenchmarkVersion, ex.benchmark_version_id)
    bench = db.get(m.Benchmark, bver.benchmark_id) if bver else None
    counts = dict(
        db.execute(
            select(m.ExperimentRun.status, func.count())
            .where(m.ExperimentRun.experiment_id == ex.id)
            .group_by(m.ExperimentRun.status)
        ).all()
    )
    data = {
        **row(ex),
        "agent_name": agent_row.name if agent_row else None,
        "agent_version": ver.version if ver else None,
        "provider": agent_row.provider if agent_row else None,
        "model": ver.model if ver else None,
        "benchmark_name": bench.name if bench else None,
        "benchmark_version": bver.version if bver else None,
        "progress": {
            "total": sum(counts.values()),
            "completed": sum(counts.get(s, 0) for s in ("PASSED", "FAILED", "ERROR", "CANCELLED")),
            "counts": counts,
        },
    }
    if details:
        data["metrics"] = [
            row(x)
            for x in db.scalars(
                select(m.Metric).where(m.Metric.experiment_id == ex.id).order_by(m.Metric.key)
            ).all()
        ]
        runs = db.scalars(
            select(m.ExperimentRun)
            .where(m.ExperimentRun.experiment_id == ex.id)
            .order_by(m.ExperimentRun.task_id, m.ExperimentRun.run_index)
            .limit(1000)
        ).all()
        data["runs"] = [
            {
                **row(r),
                "task_key": db.get(m.Task, r.task_id).task_key,
                "trace_id": db.scalar(select(m.Trace.id).where(m.Trace.run_id == r.id)),
                "failure_id": db.scalar(select(m.Failure.id).where(m.Failure.run_id == r.id)),
            }
            for r in runs
        ]
    return data


def trace(db: Session, t: m.Trace, *, details: bool = False) -> dict:
    run = db.get(m.ExperimentRun, t.run_id)
    task = db.get(m.Task, t.task_id)
    data = {
        **row(t),
        "run_index": run.run_index,
        "run_status": run.status,
        "task_key": task.task_key,
        "task_input": redact(task.input) if details else None,
    }
    if details:
        data["events"] = [
            row(e)
            for e in db.scalars(
                select(m.TraceEvent)
                .where(m.TraceEvent.trace_id == t.id)
                .order_by(m.TraceEvent.sequence)
            ).all()
        ]
        data["tool_calls"] = [
            {
                **row(c),
                "result": row(
                    db.scalar(select(m.ToolResult).where(m.ToolResult.tool_call_id == c.id))
                )
                if db.scalar(select(m.ToolResult).where(m.ToolResult.tool_call_id == c.id))
                else None,
            }
            for c in db.scalars(
                select(m.ToolCall)
                .where(m.ToolCall.trace_id == t.id)
                .order_by(m.ToolCall.event_sequence)
            ).all()
        ]
    return data


def failure(db: Session, f: m.Failure, *, details: bool = False) -> dict:
    task = db.get(m.Task, f.task_id)
    v = db.get(m.AgentVersion, f.agent_version_id)
    a = db.get(m.Agent, v.agent_id)
    data = {
        **row(f),
        "task_key": task.task_key,
        "task_input": redact(task.input) if details else None,
        "agent_name": a.name,
        "agent_version": v.version,
        "is_demo": a.is_demo,
    }
    if details:
        sibling_failures = db.scalars(
            select(m.Failure).where(
                m.Failure.experiment_id == f.experiment_id,
                m.Failure.task_id == f.task_id,
                m.Failure.failure_type == f.failure_type,
            )
        ).all()
        attempts = (
            db.scalar(
                select(func.count())
                .select_from(m.ExperimentRun)
                .where(
                    m.ExperimentRun.experiment_id == f.experiment_id,
                    m.ExperimentRun.task_id == f.task_id,
                )
            )
            or 0
        )
        data["frequency"] = {
            "failures": len(sibling_failures),
            "runs": attempts,
            "first_seen": min(x.detected_at for x in sibling_failures).isoformat(),
            "last_seen": max(x.detected_at for x in sibling_failures).isoformat(),
        }
        data["reproductions"] = [
            {**row(r), "experiment_status": db.get(m.Experiment, r.experiment_id).status}
            for r in db.scalars(
                select(m.FailureReproduction)
                .where(m.FailureReproduction.failure_id == f.id)
                .order_by(m.FailureReproduction.created_at.desc())
            ).all()
        ]
    return data
