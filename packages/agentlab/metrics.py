"""Metrics computed only from recorded runs. Null is the intentional Not measured state."""

import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab import models as m

DEFINITIONS = {
    "task_success_rate": (
        "PASSED / (PASSED + FAILED + ERROR) runs; cancelled excluded",
        "pass / completed",
        "%",
        "higher",
        "experiment_runs.status",
    ),
    "failure_rate": (
        "(FAILED + ERROR) / non-cancelled completed runs",
        "(fail + error) / completed",
        "%",
        "lower",
        "experiment_runs.status",
    ),
    "tool_accuracy": (
        "Successful, correctly selected calls with arguments satisfying explicit tool rules / calls with explicit tool rules",
        "valid calls / assessed calls",
        "%",
        "higher",
        "tool_calls.selection_valid, argument_valid, status",
    ),
    "instruction_following": (
        "PASS rule_based evaluations / measured rule_based evaluations",
        "pass / assessed",
        "%",
        "higher",
        "evaluation_results",
    ),
    "output_validity": (
        "PASS json_schema evaluations / measured json_schema evaluations",
        "pass / assessed",
        "%",
        "higher",
        "evaluation_results",
    ),
    "recovery_rate": (
        "Passed runs with a tool error and observable retry / runs with a tool error",
        "recovered / tool-error runs",
        "%",
        "higher",
        "trace_events + experiment_runs.status",
    ),
    "robustness_rate": (
        "Passed perturbed runs / non-cancelled completed perturbed runs; preserves-meaning variants only",
        "pass / perturbed completed",
        "%",
        "higher",
        "tasks.task_metadata, experiment_runs.status",
    ),
    "latency_p50_ms": (
        "Nearest-rank 50th percentile of completed run wall-clock milliseconds",
        "sorted_ms[ceil(0.50*n)-1]",
        "ms",
        "lower",
        "latency_records.total_ms",
    ),
    "latency_p95_ms": (
        "Nearest-rank 95th percentile of completed run wall-clock milliseconds",
        "sorted_ms[ceil(0.95*n)-1]",
        "ms",
        "lower",
        "latency_records.total_ms",
    ),
    "latency_p99_ms": (
        "Nearest-rank 99th percentile of completed run wall-clock milliseconds",
        "sorted_ms[ceil(0.99*n)-1]",
        "ms",
        "lower",
        "latency_records.total_ms",
    ),
    "average_latency_ms": (
        "Arithmetic mean of completed run wall-clock milliseconds",
        "sum(total_ms) / measured runs",
        "ms",
        "lower",
        "latency_records.total_ms",
    ),
    "average_tool_latency_ms": (
        "Mean of measured individual tool-call durations",
        "sum(duration_ms) / tool calls",
        "ms",
        "lower",
        "tool_calls.duration_ms",
    ),
    "total_tokens": (
        "Sum of provider-reported input and output tokens; only if all non-cancelled runs report usage",
        "sum(total_tokens) if full coverage",
        "tokens",
        "lower",
        "cost_records.total_tokens",
    ),
    "estimated_cost_usd": (
        "Sum of estimated agent inference cost; only if all non-cancelled runs have usage and pricing",
        "sum((input*in_rate + output*out_rate)/1e6)",
        "USD",
        "lower",
        "cost_records.estimated_cost_usd",
    ),
    "cost_per_success_usd": (
        "Total estimated agent inference cost / passed runs; only if cost has full coverage",
        "estimated_cost / passed runs",
        "USD",
        "lower",
        "cost_records + experiment_runs",
    ),
}


def wilson_ci(successes: int, n: int) -> list[float] | None:
    if n == 0:
        return None
    z = 1.959963984540054
    p = successes / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    margin = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return [round(max(0, center - margin) * 100, 4), round(min(1, center + margin) * 100, 4)]


def percentile(samples: list[float], q: float) -> float | None:
    if not samples:
        return None
    ordered = sorted(samples)
    return round(ordered[math.ceil(q * len(ordered)) - 1], 3)


def calculate(db: Session, exp: m.Experiment) -> list[m.Metric]:
    """Call once when all runs reach terminal state. Never overwrite archived metrics."""
    if db.scalar(select(m.Metric.id).where(m.Metric.experiment_id == exp.id)):
        raise ValueError("Historical metrics are immutable; create another experiment to rerun")
    runs = db.scalars(select(m.ExperimentRun).where(m.ExperimentRun.experiment_id == exp.id)).all()
    active = [r for r in runs if r.status in {"PASSED", "FAILED", "ERROR"}]
    if any(r.status in {"QUEUED", "RUNNING"} for r in runs):
        raise ValueError("Cannot compute final metrics while runs are active")
    n = len(active)
    passed = sum(r.status == "PASSED" for r in active)
    v = db.get(m.AgentVersion, exp.agent_version_id)
    bv = db.get(m.BenchmarkVersion, exp.benchmark_version_id)
    provenance = {
        "experiment_id": exp.id,
        "agent_version_id": v.id,
        "agent_version": v.version,
        "agent_configuration_hash": v.configuration_hash,
        "benchmark_version_id": bv.id,
        "benchmark_version": bv.version,
        "benchmark_content_hash": bv.content_hash,
        "evaluation_version": exp.evaluation_version,
        "experiment_configuration_hash": exp.configuration_hash,
        "git_commit": exp.git_commit,
        "seed": exp.seed,
        "environment": exp.environment,
        "demo": exp.is_demo,
        "cancelled_runs": sum(r.status == "CANCELLED" for r in runs),
    }
    metrics: list[m.Metric] = []

    def add(
        key: str,
        value: float | None,
        count: int,
        num: float | None = None,
        den: float | None = None,
        detail: dict | None = None,
    ):
        definition, formula, unit, direction, source = DEFINITIONS[key]
        p = {**provenance, **(detail or {})}
        if unit == "%" and num is not None and den:
            p["wilson_95_ci_percent"] = wilson_ci(int(num), int(den))
        record = m.Metric(
            experiment_id=exp.id,
            key=key,
            value=round(value, 6) if value is not None else None,
            numerator=num,
            denominator=den,
            sample_count=count,
            unit=unit,
            direction=direction,
            definition=definition,
            formula=formula,
            data_source=source,
            provenance=p,
        )
        db.add(record)
        metrics.append(record)

    add("task_success_rate", 100 * passed / n if n else None, n, passed, n)
    add("failure_rate", 100 * (n - passed) / n if n else None, n, n - passed, n)
    run_ids = [r.id for r in active]
    calls = (
        db.scalars(select(m.ToolCall).where(m.ToolCall.run_id.in_(run_ids))).all()
        if run_ids
        else []
    )
    assessed = [c for c in calls if c.selection_valid is not None and c.argument_valid is not None]
    valid = sum(
        bool(c.selection_valid and c.argument_valid and c.status == "SUCCESS") for c in assessed
    )
    add(
        "tool_accuracy",
        100 * valid / len(assessed) if assessed else None,
        len(assessed),
        valid,
        len(assessed),
        {"unassessed_tool_calls": len(calls) - len(assessed)},
    )
    evaluated = db.scalars(
        select(m.EvaluationResult)
        .join(m.Evaluation, m.Evaluation.id == m.EvaluationResult.evaluation_id)
        .where(m.Evaluation.experiment_id == exp.id)
    ).all()
    for key, kind in [("instruction_following", "rule_based"), ("output_validity", "json_schema")]:
        measured = [
            r for r in evaluated if r.evaluator_type == kind and r.outcome in {"PASS", "FAIL"}
        ]
        successes = sum(r.outcome == "PASS" for r in measured)
        add(
            key,
            100 * successes / len(measured) if measured else None,
            len(measured),
            successes,
            len(measured),
        )
    errors_by_run = {c.run_id for c in calls if c.status == "ERROR"}
    retried = set()
    if errors_by_run:
        for trace in db.scalars(select(m.Trace).where(m.Trace.run_id.in_(errors_by_run))).all():
            types = [
                event.event_type
                for event in db.scalars(
                    select(m.TraceEvent)
                    .where(m.TraceEvent.trace_id == trace.id)
                    .order_by(m.TraceEvent.sequence)
                ).all()
            ]
            if (
                "TOOL_ERROR" in types
                and "AGENT_RETRY" in types
                and types.index("AGENT_RETRY") > types.index("TOOL_ERROR")
            ):
                retried.add(trace.run_id)
    recovered = sum(r.id in retried and r.status == "PASSED" for r in active)
    add(
        "recovery_rate",
        100 * recovered / len(errors_by_run) if errors_by_run else None,
        len(errors_by_run),
        recovered,
        len(errors_by_run),
    )
    perturbed = [
        r
        for r in active
        if db.get(m.Task, r.task_id).task_metadata.get("perturbation")
        and db.get(m.Task, r.task_id).task_metadata.get("meaning_preserved", False)
    ]
    robust_pass = sum(r.status == "PASSED" for r in perturbed)
    add(
        "robustness_rate",
        100 * robust_pass / len(perturbed) if perturbed else None,
        len(perturbed),
        robust_pass,
        len(perturbed),
    )
    latency = (
        db.scalars(select(m.LatencyRecord).where(m.LatencyRecord.run_id.in_(run_ids))).all()
        if run_ids
        else []
    )
    durations = [r.total_ms for r in latency]
    for key, q in [("latency_p50_ms", 0.50), ("latency_p95_ms", 0.95), ("latency_p99_ms", 0.99)]:
        add(
            key,
            percentile(durations, q),
            len(durations),
            detail={"measurement_coverage": f"{len(durations)}/{n}"},
        )
    add(
        "average_latency_ms", sum(durations) / len(durations) if durations else None, len(durations)
    )
    add(
        "average_tool_latency_ms",
        sum(c.duration_ms for c in calls) / len(calls) if calls else None,
        len(calls),
    )
    costs = (
        db.scalars(select(m.CostRecord).where(m.CostRecord.run_id.in_(run_ids))).all()
        if run_ids
        else []
    )
    tokens = [c.total_tokens for c in costs if c.total_tokens is not None]
    money = [c.estimated_cost_usd for c in costs if c.estimated_cost_usd is not None]
    # A partial sum would be mistaken for total cost. Show coverage in provenance instead.
    token_total = sum(tokens) if len(tokens) == n and n else None
    cost_total = sum(money) if len(money) == n and n else None
    add(
        "total_tokens",
        token_total,
        len(tokens),
        detail={"measurement_coverage": f"{len(tokens)}/{n}"},
    )
    add(
        "estimated_cost_usd",
        cost_total,
        len(money),
        detail={"measurement_coverage": f"{len(money)}/{n}", "excludes_judge_and_tool_fees": True},
    )
    add(
        "cost_per_success_usd",
        cost_total / passed if cost_total is not None and passed else None,
        len(money),
        detail={"passed_runs": passed, "cost_coverage": f"{len(money)}/{n}"},
    )
    return metrics
