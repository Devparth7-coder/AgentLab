"""Durable run rows, at-least-once worker dispatch, idempotent finalization."""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timezone
from time import perf_counter

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.config import settings
from agentlab.db import SessionLocal
from agentlab.evaluation import EVALUATION_VERSION, evaluate
from agentlab.failures import finish_replay, store_failure
from agentlab.metrics import calculate
from agentlab.providers import provider_for
from agentlab.providers.base import AgentContext, ProviderError
from agentlab.schemas import ExperimentIn
from agentlab.security import redact, stable_hash
from agentlab.tracing import TraceRecorder

log = logging.getLogger("agentlab.worker")
# Local preview only. Production uses a durable Redis/Celery queue, never this executor.
local_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agentlab-local-worker")


def create_experiment(
    db: Session, data: ExperimentIn, *, replay_of_failure_id: str | None = None
) -> m.Experiment:
    version = db.get(m.AgentVersion, data.agent_version_id)
    benchmark = db.get(m.BenchmarkVersion, data.benchmark_version_id)
    if not version or not benchmark:
        raise ValueError("Agent version or benchmark version not found")
    all_tasks = db.scalars(
        select(m.Task.id).where(m.Task.benchmark_version_id == benchmark.id)
    ).all()
    selected = data.task_ids or all_tasks
    if (
        not selected
        or not set(selected).issubset(set(all_tasks))
        or len(selected) != len(set(selected))
    ):
        raise ValueError("Selected task IDs must belong to this benchmark and be unique")
    if len(selected) * data.runs_per_task > 2000:
        raise ValueError("Maximum 2,000 runs per experiment; split larger workloads")
    a = db.get(m.Agent, version.agent_id)
    b = db.get(m.Benchmark, benchmark.benchmark_id)
    config = data.model_dump()
    env = {
        "runtime": os.getenv("AGENTLAB_ENV", "development"),
        "queue_mode": settings().queue_mode,
        **data.environment,
    }
    exp = m.Experiment(
        name=data.name,
        agent_version_id=version.id,
        benchmark_version_id=benchmark.id,
        seed=data.seed,
        runs_per_task=data.runs_per_task,
        selected_task_ids=sorted(selected),
        configuration=data.configuration,
        configuration_hash=stable_hash(
            {
                **config,
                "agent_hash": version.configuration_hash,
                "benchmark_hash": benchmark.content_hash,
                "evaluation_version": EVALUATION_VERSION,
            }
        ),
        evaluation_version=EVALUATION_VERSION,
        environment=env,
        git_commit=os.getenv("GIT_COMMIT", "unknown"),
        is_demo=bool(a.is_demo or b.is_demo),
        replay_of_failure_id=replay_of_failure_id,
    )
    db.add(exp)
    db.flush()
    return exp


def queue_experiment(db: Session, exp: m.Experiment) -> None:
    if exp.status != "CREATED":
        return  # repeat POST /run is idempotent, never changes old results
    for task_id in exp.selected_task_ids:
        for index in range(exp.runs_per_task):
            run_index = (
                exp.configuration.get("replay_run_index", index)
                if exp.replay_of_failure_id
                else index
            )
            db.add(m.ExperimentRun(experiment_id=exp.id, task_id=task_id, run_index=run_index))
    exp.status = "QUEUED"
    db.flush()


def dispatch_experiment(experiment_id: str):
    """Called after transaction commit. Lost broker dispatch is recoverable via /resume."""
    with SessionLocal() as db:
        ids = db.scalars(
            select(m.ExperimentRun.id).where(
                m.ExperimentRun.experiment_id == experiment_id, m.ExperimentRun.status == "QUEUED"
            )
        ).all()
    for run_id in ids:
        if settings().queue_mode == "celery":
            from agentlab.worker import run_job

            run_job.delay(run_id)
        else:
            if settings().env not in {"test", "development"}:
                raise RuntimeError("In-process queue disabled in production")
            local_executor.submit(process_run, run_id)
    return len(ids)


def _finalize_if_complete(db: Session, experiment_id: str):
    exp = db.scalar(select(m.Experiment).where(m.Experiment.id == experiment_id).with_for_update())
    runs = db.scalars(
        select(m.ExperimentRun).where(m.ExperimentRun.experiment_id == experiment_id)
    ).all()
    if not runs or any(r.status in {"RUNNING", "QUEUED"} for r in runs) or exp.completed_at:
        return
    exp.status = "CANCELLED" if exp.status == "CANCELLED" else "COMPLETED"
    exp.completed_at = m.now()
    calculate(db, exp)
    finish_replay(db, exp)


def _pricing(version: m.AgentVersion, usage: dict) -> tuple[float | None, dict]:
    pricing = version.configuration.get("pricing", {})
    inp = usage["input_tokens"]
    out = usage["output_tokens"]
    a = pricing.get("input_per_million_usd") if isinstance(pricing, dict) else None
    b = pricing.get("output_per_million_usd") if isinstance(pricing, dict) else None
    if any(type(x) not in {float, int} or x < 0 or x > 100000 for x in (a, b)):
        return None, {}
    if inp is None or out is None:
        return None, {"input_per_million_usd": a, "output_per_million_usd": b}
    return round((inp * a + out * b) / 1_000_000, 10), {
        "input_per_million_usd": a,
        "output_per_million_usd": b,
    }


def process_run(run_id: str) -> None:
    # Compare-and-swap claim means a broker retry never re-executes a completed run.
    with SessionLocal.begin() as db:
        run = db.get(m.ExperimentRun, run_id)
        if not run or run.status != "QUEUED":
            return
        exp = db.get(m.Experiment, run.experiment_id)
        if exp.status == "CANCELLED":
            run.status = "CANCELLED"
            return
        claimed = db.execute(
            update(m.ExperimentRun)
            .where(m.ExperimentRun.id == run_id, m.ExperimentRun.status == "QUEUED")
            .values(status="RUNNING", started_at=m.now())
        )
        if not claimed.rowcount:
            return
        if exp.status == "QUEUED":
            exp.status = "RUNNING"
            exp.started_at = m.now()
    with SessionLocal() as db:
        run = db.get(m.ExperimentRun, run_id)
        exp = db.get(m.Experiment, run.experiment_id)
        task = db.get(m.Task, run.task_id)
        version = db.get(m.AgentVersion, exp.agent_version_id)
        agent = db.get(m.Agent, version.agent_id)
        allowed = sorted(set(task.available_tools) & set(version.tool_configuration))
        recorder = TraceRecorder(
            allowed,
            capture=settings().trace_capture,
            fail_first_tool=allowed[0]
            if task.task_metadata.get("perturbation") == "tool_failure" and allowed
            else None,
        )
        recorder.event(
            "TASK_STARTED",
            input_metadata={
                "task_key": task.task_key,
                "input_hash": stable_hash(task.input),
                "seed": exp.seed,
                "run_index": run.run_index,
            },
        )
        recorder.event(
            "AGENT_STARTED",
            output_metadata={
                "provider": agent.provider,
                "model": version.model,
                "agent_configuration_hash": version.configuration_hash,
            },
        )
        result = None
        error = None
        started = perf_counter()
        try:
            provider = provider_for(agent.provider)
            ctx = AgentContext(
                agent=agent,
                version=version,
                task=task,
                recorder=recorder,
                seed=exp.seed + run.run_index,
            )
            result = asyncio.run(provider.run_task(ctx))
            recorder.event(
                "FINAL_RESPONSE",
                status="SUCCESS",
                output_metadata={
                    "output": result.output,
                    "output_hash": stable_hash(result.output),
                    "api_calls": result.api_calls,
                    "usage": provider.get_usage(result),
                },
            )
        except (ProviderError, ValueError, RuntimeError) as exc:
            error = str(exc)
            recorder.event("AGENT_ERROR", status="ERROR", error=error)
        except Exception as exc:
            # Never expose internal stack traces or provider response bodies in the trace.
            error = "Unhandled agent execution error"
            log.exception(
                "agent_execution_failed run_id=%s error_type=%s", run_id, type(exc).__name__
            )
            recorder.event("AGENT_ERROR", status="ERROR", error=error)
        total_ms = round((perf_counter() - started) * 1000, 3)
        try:
            with SessionLocal.begin() as db2:
                run2 = db2.get(m.ExperimentRun, run_id)
                exp2 = db2.get(m.Experiment, run2.experiment_id)
                task2 = db2.get(m.Task, run2.task_id)
                if run2.status != "RUNNING":
                    return
                if exp2.status == "CANCELLED":
                    run2.status = "CANCELLED"
                    run2.completed_at = m.now()
                    recorder.event("TASK_CANCELLED")
                    recorder.persist(db2, run_id, exp2.id, task2)
                else:
                    output = result.output if result else ""
                    run2.response_preview = redact(output[:10000]) if result else None
                    run2.output_hash = stable_hash(output) if result else None
                    run2.error = redact(error) if error else None
                    status, eval_results = (
                        evaluate(task2, output, recorder) if result else ("ERROR", [])
                    )
                    run2.status = status
                    if status == "ERROR" and not error:
                        run2.error = "Required evaluation was not measured"
                    run2.completed_at = m.now()
                    trace = recorder.persist(db2, run_id, exp2.id, task2)
                    evaluation = m.Evaluation(
                        run_id=run_id,
                        experiment_id=exp2.id,
                        status=status,
                        evaluation_version=exp2.evaluation_version,
                    )
                    db2.add(evaluation)
                    db2.flush()
                    for e in eval_results:
                        db2.add(m.EvaluationResult(evaluation_id=evaluation.id, **e))
                    if status != "PASSED":
                        store_failure(db2, run2, trace, task2, exp2, eval_results)
                    usage = (
                        provider.get_usage(result)
                        if result
                        else {"input_tokens": None, "output_tokens": None, "total_tokens": None}
                    )
                    cost, pricing = _pricing(version, usage)
                    db2.add(
                        m.CostRecord(
                            run_id=run_id,
                            api_calls=result.api_calls if result else 0,
                            input_tokens=usage["input_tokens"],
                            output_tokens=usage["output_tokens"],
                            total_tokens=usage["total_tokens"],
                            estimated_cost_usd=cost,
                            pricing_snapshot=pricing,
                        )
                    )
                    db2.add(
                        m.LatencyRecord(
                            run_id=run_id,
                            total_ms=total_ms,
                            tool_ms=sum(c["duration_ms"] for c in recorder.calls),
                            ttft_ms=result.ttft_ms if result else None,
                        )
                    )
                db2.flush()
                _finalize_if_complete(db2, exp2.id)
        except Exception:
            log.exception("run_finalization_failed run_id=%s; resumable with /resume", run_id)
            raise
        log.info(
            "run_finished run_id=%s experiment_id=%s status=%s duration_ms=%s",
            run_id,
            exp.id,
            result is not None and "evaluated" or "error",
            total_ms,
        )


def resume_experiment(
    db: Session, exp: m.Experiment, *, recover_stale: bool = False, stale_after_seconds: int = 600
) -> list[str]:
    """Queued jobs are safe to re-dispatch. Reset a stale in-flight call ONLY by explicit opt-in."""
    if exp.completed_at or exp.status == "CANCELLED":
        return []
    if recover_stale:
        if stale_after_seconds < 300:
            raise ValueError("Stale recovery requires at least 300 seconds of inactivity")
        for run in db.scalars(
            select(m.ExperimentRun).where(
                m.ExperimentRun.experiment_id == exp.id, m.ExperimentRun.status == "RUNNING"
            )
        ).all():
            begun = (
                run.started_at.replace(tzinfo=timezone.utc)
                if run.started_at and run.started_at.tzinfo is None
                else run.started_at
            )
            stale = begun and (m.now() - begun).total_seconds() >= stale_after_seconds
            has_trace = db.scalar(select(m.Trace.id).where(m.Trace.run_id == run.id))
            if stale and not has_trace:
                # Provider calls may be duplicated: operator must explicitly choose this risk.
                run.status = "QUEUED"
                run.started_at = None
        db.flush()
    return db.scalars(
        select(m.ExperimentRun.id).where(
            m.ExperimentRun.experiment_id == exp.id, m.ExperimentRun.status == "QUEUED"
        )
    ).all()
