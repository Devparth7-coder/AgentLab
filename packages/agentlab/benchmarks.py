"""Task suites are immutable once written. Adding a task creates a new version."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.schemas import BenchmarkIn, TaskIn
from agentlab.security import stable_hash

SUPPORTED_EVALUATORS = {
    "exact_match",
    "json_schema",
    "reference_numeric",
    "tool_rules",
    "rule_based",
    "trusted_python",
    "llm_judge",
}


def check_task(task: TaskIn) -> None:
    rules = task.evaluation_config.get("evaluators", [])
    if not isinstance(rules, list) or len(rules) > 12:
        raise ValueError("evaluation_config.evaluators must be a list (max 12)")
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("type") not in SUPPORTED_EVALUATORS:
            raise ValueError(f"Unknown evaluator: {rule!r}")
        if rule["type"] == "trusted_python" and rule.get("plugin") not in {
            "nonempty_json",
            "nonnegative_total",
        }:
            raise ValueError("Only installed, trusted Python evaluator plugins can run")
    # Default evaluator when a reference exists. Explicit empty rules without reference => not measured.
    if task.expected_output is not None and not rules:
        task.evaluation_config["evaluators"] = [{"type": "exact_match"}]


def _insert_task(db: Session, version_id: str, data: TaskIn) -> m.Task:
    check_task(data)
    t = m.Task(
        benchmark_version_id=version_id,
        task_key=data.task_key,
        category=data.category,
        input=data.input,
        expected_behavior=data.expected_behavior,
        constraints=data.constraints,
        available_tools=data.available_tools,
        expected_output=data.expected_output,
        evaluation_config=data.evaluation_config,
        task_metadata=data.metadata,
    )
    db.add(t)
    return t


def new_benchmark(db: Session, data: BenchmarkIn, is_demo: bool = False) -> m.Benchmark:
    if db.scalar(select(m.Benchmark.id).where(m.Benchmark.name == data.name)):
        raise ValueError("Benchmark name already registered")
    bench = m.Benchmark(
        name=data.name, description=data.description, category=data.category, is_demo=is_demo
    )
    db.add(bench)
    db.flush()
    add_version(db, bench, data.version, data.evaluation_rules, data.tasks)
    return bench


def add_version(
    db: Session, bench: m.Benchmark, name: str, rules: dict, tasks: list[TaskIn]
) -> m.BenchmarkVersion:
    if not tasks:
        raise ValueError("A benchmark version must contain at least one task")
    if db.scalar(
        select(m.BenchmarkVersion.id).where(
            m.BenchmarkVersion.benchmark_id == bench.id, m.BenchmarkVersion.version == name
        )
    ):
        raise ValueError("Benchmark version already exists; create a new version")
    keys = [t.task_key for t in tasks]
    if len(set(keys)) != len(keys):
        raise ValueError("Duplicate task keys")
    default_evaluators = rules.get("default_evaluators")
    if default_evaluators is not None and not isinstance(default_evaluators, list):
        raise ValueError("evaluation_rules.default_evaluators must be a list")
    resolved = []
    for task in tasks:
        item = task.model_copy(deep=True)
        if default_evaluators and not item.evaluation_config.get("evaluators"):
            item.evaluation_config["evaluators"] = default_evaluators
        check_task(item)
        resolved.append(item)
    tasks = resolved
    content = {"version": name, "rules": rules, "tasks": [t.model_dump() for t in tasks]}
    v = m.BenchmarkVersion(
        benchmark_id=bench.id,
        version=name,
        evaluation_rules=rules,
        content_hash=stable_hash(content),
    )
    db.add(v)
    db.flush()
    for task in tasks:
        _insert_task(db, v.id, task)
    db.flush()
    return v


def clone_with_task(
    db: Session, source: m.BenchmarkVersion, name: str, task: TaskIn
) -> tuple[m.BenchmarkVersion, m.Task]:
    old = db.scalars(
        select(m.Task).where(m.Task.benchmark_version_id == source.id).order_by(m.Task.task_key)
    ).all()
    tasks = [
        TaskIn(
            task_key=t.task_key,
            category=t.category,
            input=t.input,
            expected_behavior=t.expected_behavior,
            constraints=t.constraints,
            available_tools=t.available_tools,
            expected_output=t.expected_output,
            evaluation_config=t.evaluation_config,
            metadata=t.task_metadata,
        )
        for t in old
    ]
    tasks.append(task)
    v = add_version(
        db, db.get(m.Benchmark, source.benchmark_id), name, source.evaluation_rules, tasks
    )
    db.flush()
    return v, db.scalar(
        select(m.Task).where(m.Task.benchmark_version_id == v.id, m.Task.task_key == task.task_key)
    )
