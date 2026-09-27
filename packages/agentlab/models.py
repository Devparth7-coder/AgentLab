"""Persisted, versioned evidence. Historical versions, runs and metrics are append-only."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from agentlab.db import Base


def uid() -> str:
    return uuid4().hex


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(30), default="viewer")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    provider: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(25), default="ACTIVE")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AgentVersion(Base):
    __tablename__ = "agent_versions"
    __table_args__ = (UniqueConstraint("agent_id", "version", name="uq_agent_version"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    version: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(160))
    model_revision: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Not serialized to read APIs; configuration and tool versions must remain immutable.
    prompt_template: Mapped[str] = mapped_column(Text, default="")
    system_prompt_hash: Mapped[str] = mapped_column(String(64))
    configuration_hash: Mapped[str] = mapped_column(String(64))
    tool_configuration: Mapped[list] = mapped_column(JSON, default=list)
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)
    environment_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    temperature: Mapped[float] = mapped_column(Float, default=0.0)
    max_tokens: Mapped[int] = mapped_column(Integer, default=1024)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Benchmark(Base):
    __tablename__ = "benchmarks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(140), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(60), default="General Agent")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class BenchmarkVersion(Base):
    __tablename__ = "benchmark_versions"
    __table_args__ = (UniqueConstraint("benchmark_id", "version", name="uq_benchmark_version"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    benchmark_id: Mapped[str] = mapped_column(ForeignKey("benchmarks.id"), index=True)
    version: Mapped[str] = mapped_column(String(40))
    evaluation_rules: Mapped[dict] = mapped_column(JSON, default=dict)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("benchmark_version_id", "task_key", name="uq_task_key"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    benchmark_version_id: Mapped[str] = mapped_column(
        ForeignKey("benchmark_versions.id"), index=True
    )
    task_key: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(60), default="General")
    input: Mapped[str] = mapped_column(Text)
    expected_behavior: Mapped[list] = mapped_column(JSON, default=list)
    constraints: Mapped[list] = mapped_column(JSON, default=list)
    available_tools: Mapped[list] = mapped_column(JSON, default=list)
    expected_output: Mapped[dict | list | str | float | int | None] = mapped_column(
        JSON, nullable=True
    )
    evaluation_config: Mapped[dict] = mapped_column(JSON, default=dict)
    task_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Experiment(Base):
    __tablename__ = "experiments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160))
    agent_version_id: Mapped[str] = mapped_column(ForeignKey("agent_versions.id"), index=True)
    benchmark_version_id: Mapped[str] = mapped_column(
        ForeignKey("benchmark_versions.id"), index=True
    )
    configuration: Mapped[dict] = mapped_column(JSON, default=dict)
    configuration_hash: Mapped[str] = mapped_column(String(64))
    evaluation_version: Mapped[str] = mapped_column(String(40), default="harness-1.0.0")
    seed: Mapped[int] = mapped_column(Integer, default=0)
    runs_per_task: Mapped[int] = mapped_column(Integer, default=1)
    selected_task_ids: Mapped[list] = mapped_column(JSON, default=list)
    environment: Mapped[dict] = mapped_column(JSON, default=dict)
    git_commit: Mapped[str] = mapped_column(String(120), default="unknown")
    status: Mapped[str] = mapped_column(String(20), default="CREATED", index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    replay_of_failure_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"
    __table_args__ = (
        UniqueConstraint("experiment_id", "task_id", "run_index", name="uq_run_index"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    run_index: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="QUEUED", index=True)
    response_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    output_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Trace(Base):
    __tablename__ = "traces"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("experiment_runs.id"), unique=True)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)


class TraceEvent(Base):
    __tablename__ = "trace_events"
    __table_args__ = (UniqueConstraint("trace_id", "sequence", name="uq_trace_seq"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    trace_id: Mapped[str] = mapped_column(ForeignKey("traces.id"), index=True)
    sequence: Mapped[int] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    offset_ms: Mapped[float] = mapped_column(Float)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    event_type: Mapped[str] = mapped_column(String(45), index=True)
    tool_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    input_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    output_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="INFO")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class ToolCall(Base):
    __tablename__ = "tool_calls"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    trace_id: Mapped[str] = mapped_column(ForeignKey("traces.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("experiment_runs.id"), index=True)
    event_sequence: Mapped[int] = mapped_column(Integer)
    tool_name: Mapped[str] = mapped_column(String(100))
    arguments: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24))
    duration_ms: Mapped[float] = mapped_column(Float)
    argument_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    selection_valid: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ToolResult(Base):
    __tablename__ = "tool_results"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    tool_call_id: Mapped[str] = mapped_column(ForeignKey("tool_calls.id"), unique=True)
    output: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Evaluation(Base):
    __tablename__ = "evaluations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("experiment_runs.id"), unique=True)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    status: Mapped[str] = mapped_column(String(22))
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    evaluation_version: Mapped[str] = mapped_column(String(40))


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    evaluation_id: Mapped[str] = mapped_column(ForeignKey("evaluations.id"), index=True)
    evaluator_type: Mapped[str] = mapped_column(String(45))
    evaluator_version: Mapped[str] = mapped_column(String(30))
    outcome: Mapped[str] = mapped_column(String(22))
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)


class Metric(Base):
    __tablename__ = "metrics"
    __table_args__ = (UniqueConstraint("experiment_id", "key", name="uq_experiment_metric"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    key: Mapped[str] = mapped_column(String(60))
    value: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str] = mapped_column(String(30))
    numerator: Mapped[float | None] = mapped_column(Float, nullable=True)
    denominator: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    definition: Mapped[str] = mapped_column(Text)
    formula: Mapped[str] = mapped_column(Text)
    data_source: Mapped[str] = mapped_column(String(120))
    direction: Mapped[str] = mapped_column(String(12))
    provenance: Mapped[dict] = mapped_column(JSON, default=dict)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Failure(Base):
    __tablename__ = "failures"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("experiment_runs.id"), unique=True)
    trace_id: Mapped[str] = mapped_column(ForeignKey("traces.id"))
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"))
    agent_version_id: Mapped[str] = mapped_column(ForeignKey("agent_versions.id"))
    failure_type: Mapped[str] = mapped_column(String(55), index=True)
    severity: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    summary: Mapped[str] = mapped_column(Text)
    expected: Mapped[dict] = mapped_column(JSON, default=dict)
    observed: Mapped[dict] = mapped_column(JSON, default=dict)
    evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    reproduction_config: Mapped[dict] = mapped_column(JSON, default=dict)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class FailureReproduction(Base):
    __tablename__ = "failure_reproductions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    failure_id: Mapped[str] = mapped_column(ForeignKey("failures.id"), index=True)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), unique=True)
    outcome: Mapped[str] = mapped_column(String(35), default="PENDING")
    reason: Mapped[str] = mapped_column(Text, default="Queued for replay")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Regression(Base):
    __tablename__ = "regressions"
    __table_args__ = (
        UniqueConstraint(
            "baseline_experiment_id",
            "candidate_experiment_id",
            "comparator_version",
            name="uq_regression_pair",
        ),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    baseline_experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"))
    candidate_experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"))
    comparator_version: Mapped[str] = mapped_column(String(30), default="paired-1.0.0")
    comparable: Mapped[bool] = mapped_column(Boolean)
    verdict: Mapped[str] = mapped_column(String(32))
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    new_failures: Mapped[list] = mapped_column(JSON, default=list)
    resolved_failures: Mapped[list] = mapped_column(JSON, default=list)
    persistent_failures: Mapped[list] = mapped_column(JSON, default=list)
    deltas: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CostRecord(Base):
    __tablename__ = "cost_records"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("experiment_runs.id"), unique=True)
    api_calls: Mapped[int | None] = mapped_column(Integer, nullable=True)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    pricing_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class LatencyRecord(Base):
    __tablename__ = "latency_records"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("experiment_runs.id"), unique=True)
    total_ms: Mapped[float] = mapped_column(Float)
    tool_ms: Mapped[float] = mapped_column(Float, default=0)
    ttft_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    content_markdown: Mapped[str] = mapped_column(Text)
    content_html: Mapped[str] = mapped_column(Text)
    content_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Artifact(Base):
    __tablename__ = "artifacts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    experiment_id: Mapped[str] = mapped_column(ForeignKey("experiments.id"))
    name: Mapped[str] = mapped_column(String(160))
    uri: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    actor: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(60), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


Index("ix_trace_exp_created", Trace.experiment_id, Trace.created_at)
Index("ix_failure_exp_type", Failure.experiment_id, Failure.failure_type)
