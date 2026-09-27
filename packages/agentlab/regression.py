"""Paired comparisons only. No regression claim when benchmark/harness are incomparable."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab import models as m

COMPARATOR_VERSION = "paired-1.0.0"


def compare(db: Session, baseline: m.Experiment, candidate: m.Experiment) -> m.Regression:
    if baseline.id == candidate.id:
        raise ValueError("Choose two distinct experiments")
    existing = db.scalar(
        select(m.Regression).where(
            m.Regression.baseline_experiment_id == baseline.id,
            m.Regression.candidate_experiment_id == candidate.id,
            m.Regression.comparator_version == COMPARATOR_VERSION,
        )
    )
    if existing:
        return existing
    reasons = []
    if baseline.status != "COMPLETED" or candidate.status != "COMPLETED":
        reasons.append("Both experiments must be completed (not partial or cancelled)")
    if baseline.benchmark_version_id != candidate.benchmark_version_id:
        reasons.append("Different benchmark versions: task references may differ")
    if baseline.evaluation_version != candidate.evaluation_version:
        reasons.append("Different evaluation harness versions")
    if (
        baseline.selected_task_ids != candidate.selected_task_ids
        or baseline.runs_per_task != candidate.runs_per_task
    ):
        reasons.append("Different task selection or runs per task")
    if baseline.seed != candidate.seed:
        reasons.append("Different random seeds")
    if baseline.environment != candidate.environment:
        reasons.append("Different environment metadata")
    if baseline.configuration != candidate.configuration:
        reasons.append("Different experiment-level evaluation configuration")
    if baseline.is_demo != candidate.is_demo:
        reasons.append("Cannot compare demo results with real-provider results")
    if reasons:
        result = m.Regression(
            baseline_experiment_id=baseline.id,
            candidate_experiment_id=candidate.id,
            comparator_version=COMPARATOR_VERSION,
            comparable=False,
            verdict="INCOMPARABLE",
            reasons=reasons,
        )
        db.add(result)
        db.flush()
        return result
    left = {
        (r.task_id, r.run_index): r
        for r in db.scalars(
            select(m.ExperimentRun).where(m.ExperimentRun.experiment_id == baseline.id)
        ).all()
    }
    right = {
        (r.task_id, r.run_index): r
        for r in db.scalars(
            select(m.ExperimentRun).where(m.ExperimentRun.experiment_id == candidate.id)
        ).all()
    }
    if not left or set(left) != set(right):
        raise ValueError("Completed experiments have mismatched run keys; cannot compare")
    new_failures, resolved, persistent = [], [], []
    for (task_id, index), a in left.items():
        b = right[(task_id, index)]
        entry = {
            "task_key": db.get(m.Task, task_id).task_key,
            "run_index": index,
            "baseline_run_id": a.id,
            "candidate_run_id": b.id,
        }
        if a.status == "PASSED" and b.status in {"FAILED", "ERROR"}:
            new_failures.append(entry)
        elif a.status in {"FAILED", "ERROR"} and b.status == "PASSED":
            resolved.append(entry)
        elif a.status in {"FAILED", "ERROR"} and b.status in {"FAILED", "ERROR"}:
            persistent.append(entry)
    left_metrics = {
        r.key: r.value
        for r in db.scalars(select(m.Metric).where(m.Metric.experiment_id == baseline.id)).all()
    }
    right_metrics = {
        r.key: r.value
        for r in db.scalars(select(m.Metric).where(m.Metric.experiment_id == candidate.id)).all()
    }
    deltas = {
        key: {
            "baseline": left_metrics.get(key),
            "candidate": right_metrics.get(key),
            "delta": round(right_metrics[key] - left_metrics[key], 6)
            if left_metrics.get(key) is not None and right_metrics.get(key) is not None
            else None,
        }
        for key in set(left_metrics) | set(right_metrics)
    }
    # Operational regression policy, not a statistical-significance claim.
    performance = []
    for key, min_baseline, min_absolute in (
        ("latency_p95_ms", 100.0, 50.0),
        ("cost_per_success_usd", 0.001, 0.001),
    ):
        values = deltas.get(key, {})
        a, b = values.get("baseline"), values.get("candidate")
        if (
            a is not None
            and b is not None
            and a >= min_baseline
            and b - a >= min_absolute
            and b > a * 1.10
        ):
            performance.append(
                f"{key} increased by >10% and >= {min_absolute:g} (operational threshold, not significance)"
            )
    if new_failures or performance:
        verdict = "REGRESSION"
        reasons = (
            [f"{len(new_failures)} previously passing paired runs now fail"] if new_failures else []
        )
        reasons += performance
    elif resolved:
        verdict = "IMPROVEMENT"
        reasons = [
            f"{len(resolved)} previously failing paired runs now pass; no new failures detected"
        ]
    else:
        verdict = "NO_REGRESSION_DETECTED"
        reasons = [
            "No new failing paired runs or measured cost/P95 latency increase above the configured operational thresholds"
        ]
    result = m.Regression(
        baseline_experiment_id=baseline.id,
        candidate_experiment_id=candidate.id,
        comparator_version=COMPARATOR_VERSION,
        comparable=True,
        verdict=verdict,
        reasons=reasons,
        new_failures=new_failures,
        resolved_failures=resolved,
        persistent_failures=persistent,
        deltas=deltas,
    )
    db.add(result)
    db.flush()
    return result
