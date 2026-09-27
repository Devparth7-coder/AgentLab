"""Failure classification and replay provenance; deterministic claims are conditional."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.security import redact


def classify(status: str, results: list[dict], error: str | None = None) -> tuple[str, str, str]:
    if status == "ERROR":
        if error and "timed out" in error.lower():
            return "TIMEOUT", "HIGH", "Provider or tool exceeded the configured timeout"
        return "TASK_FAILURE", "HIGH", error or "Required evaluation was not measured"
    for result in results:
        if result["outcome"] != "FAIL":
            continue
        if result["evaluator_type"] == "tool_rules":
            ev = result["evidence"]
            if ev.get("invalid_arguments"):
                return (
                    "TOOL_ARGUMENT_FAILURE",
                    "HIGH",
                    "Tool arguments differ from the expected task fixture",
                )
            if ev.get("missing") or ev.get("forbidden_used") or ev.get("unexpected"):
                return "TOOL_SELECTION_FAILURE", "HIGH", "Incorrect or missing tool selection"
            if ev.get("tool_errors"):
                return "RECOVERY_FAILURE", "MEDIUM", "Tool failed and agent did not recover"
        if result["evaluator_type"] == "json_schema":
            return "OUTPUT_SCHEMA_FAILURE", "MEDIUM", "Output failed schema validation"
        if result["evaluator_type"] == "rule_based":
            return "INSTRUCTION_FAILURE", "MEDIUM", "Explicit instruction rule failed"
    return "TASK_FAILURE", "MEDIUM", "Agent output did not satisfy the reference"


def store_failure(
    db: Session,
    run: m.ExperimentRun,
    trace: m.Trace,
    task: m.Task,
    exp: m.Experiment,
    results: list[dict],
) -> m.Failure:
    category, severity, summary = classify(run.status, results, run.error)
    failure = m.Failure(
        run_id=run.id,
        trace_id=trace.id,
        experiment_id=exp.id,
        task_id=task.id,
        agent_version_id=exp.agent_version_id,
        failure_type=category,
        severity=severity,
        summary=summary,
        expected={
            "reference": redact(task.expected_output),
            "expected_behavior": redact(task.expected_behavior),
        },
        observed={
            "output": run.response_preview,
            "status": run.status,
            "output_hash": run.output_hash,
        },
        evidence={"evaluation_results": [redact(r) for r in results if r["outcome"] == "FAIL"]},
        reproduction_config={
            "agent_version_id": exp.agent_version_id,
            "benchmark_version_id": exp.benchmark_version_id,
            "task_id": task.id,
            "seed": exp.seed,
            "run_index": run.run_index,
            "agent_configuration_hash": db.get(
                m.AgentVersion, exp.agent_version_id
            ).configuration_hash,
            "benchmark_content_hash": db.get(
                m.BenchmarkVersion, exp.benchmark_version_id
            ).content_hash,
            "evaluation_version": exp.evaluation_version,
            "environment": exp.environment,
            "tool_responses_from_trace": trace.id,
            "limitations": "External provider behavior is not guaranteed deterministic; local mock fixtures are versioned.",
        },
    )
    db.add(failure)
    return failure


def finish_replay(db: Session, experiment: m.Experiment):
    if not experiment.replay_of_failure_id:
        return
    replay = db.scalar(
        select(m.FailureReproduction).where(m.FailureReproduction.experiment_id == experiment.id)
    )
    original = db.get(m.Failure, experiment.replay_of_failure_id)
    run = db.scalar(select(m.ExperimentRun).where(m.ExperimentRun.experiment_id == experiment.id))
    if not replay or not original or not run:
        return
    orig_run = db.get(m.ExperimentRun, original.run_id)
    version = db.get(m.AgentVersion, experiment.agent_version_id)
    agent = db.get(m.Agent, version.agent_id)
    same = (
        run.status == orig_run.status
        and run.output_hash is not None
        and run.output_hash == orig_run.output_hash
    )
    if agent.provider == "mock" and same:
        replay.outcome = "REPRODUCIBLE"
        replay.reason = "Versioned deterministic mock, same run status and exact output hash"
    elif same:
        replay.outcome = "PARTIALLY REPRODUCIBLE"
        replay.reason = "Observed output matched, but external model/tool state cannot be pinned by this platform"
    else:
        replay.outcome = (
            "NON-DETERMINISTIC" if agent.provider != "mock" else "PARTIALLY REPRODUCIBLE"
        )
        replay.reason = "Replay did not match the original status and output hash"
    replay.completed_at = m.now()
