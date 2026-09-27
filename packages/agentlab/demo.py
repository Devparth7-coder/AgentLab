"""No prewritten results. Demo versions and 50 reference tasks only; runs measure actual mock execution."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.benchmarks import new_benchmark
from agentlab.demo_fixtures import FIXTURE_VERSION, MONTHS, REGIONS, revenue
from agentlab.registry import new_agent, new_version
from agentlab.schemas import AgentIn, BenchmarkIn, TaskIn, VersionIn

DEMO_AGENT = "DEMO · Dataset Research Agent"
DEMO_BENCHMARK = "DEMO · Revenue Analysis / 50 cases"


def seed(db: Session) -> dict:
    agent = db.scalar(select(m.Agent).where(m.Agent.name == DEMO_AGENT))
    if not agent:
        agent = new_agent(
            db,
            AgentIn(
                name=DEMO_AGENT,
                provider="mock",
                description="DEMO only · deterministic agent over a synthetic, versioned dataset. Not a language model.",
                version=VersionIn(
                    version="1.0.0",
                    model="deterministic-fixture",
                    model_revision=FIXTURE_VERSION,
                    system_prompt="Use the sandboxed dataset tool, honor both region and month, and return JSON.",
                    tool_configuration=["dataset.aggregate"],
                    configuration={"behavior": "demo_dataset", "fixture": FIXTURE_VERSION},
                ),
            ),
            is_demo=True,
        )
    first = db.scalar(
        select(m.AgentVersion).where(
            m.AgentVersion.agent_id == agent.id, m.AgentVersion.version == "1.0.0"
        )
    )
    second = db.scalar(
        select(m.AgentVersion).where(
            m.AgentVersion.agent_id == agent.id, m.AgentVersion.version == "2.0.0"
        )
    )
    if not second:
        second = new_version(
            db,
            agent,
            VersionIn(
                version="2.0.0",
                model="deterministic-fixture",
                model_revision=FIXTURE_VERSION,
                system_prompt="Use the sandboxed dataset tool and return JSON.",
                tool_configuration=["dataset.aggregate"],
                configuration={
                    "behavior": "demo_dataset",
                    "fixture": FIXTURE_VERSION,
                    "fault_policy": "omit_month_every_fifth",
                },
            ),
        )
    bench = db.scalar(select(m.Benchmark).where(m.Benchmark.name == DEMO_BENCHMARK))
    if not bench:
        tasks = []
        for ri, region in enumerate(REGIONS):
            for mi, month in enumerate(MONTHS):
                idx = ri * len(MONTHS) + mi
                tasks.append(
                    TaskIn(
                        task_key=f"revenue-{idx + 1:03d}",
                        category="Tool Calling",
                        input=f"Using dataset.aggregate, what is the total revenue for {region} in {month}? Return only JSON with total_revenue as an integer. Do not invent rows.",
                        expected_behavior=[
                            "Call dataset.aggregate with matching region and month",
                            "Return the measured total",
                        ],
                        constraints=["Never invent rows", "No real external tools"],
                        available_tools=["dataset.aggregate"],
                        expected_output={"total_revenue": revenue(region, month)},
                        evaluation_config={
                            "evaluators": [
                                {"type": "exact_match"},
                                {
                                    "type": "json_schema",
                                    "schema": {
                                        "type": "object",
                                        "properties": {"total_revenue": {"type": "integer"}},
                                        "required": ["total_revenue"],
                                        "additionalProperties": False,
                                    },
                                },
                                {
                                    "type": "tool_rules",
                                    "required_tools": ["dataset.aggregate"],
                                    "exclusive": True,
                                    "argument_equals": {
                                        "dataset.aggregate": {"region": region, "month": month}
                                    },
                                },
                            ]
                        },
                        metadata={
                            "region": region,
                            "month": month,
                            "demo_case_index": idx,
                            "fixture_version": FIXTURE_VERSION,
                        },
                    )
                )
        bench = new_benchmark(
            db,
            BenchmarkIn(
                name=DEMO_BENCHMARK,
                category="Data Analysis",
                description="DEMO ONLY · 50 controlled cases across five regions × ten months. Synthetic data; no real model measurements. v2 intentionally drops month in selected calls.",
                tasks=tasks,
                evaluation_rules={
                    "reference_source": FIXTURE_VERSION,
                    "harness": "exact match + JSON schema + tool argument rules",
                },
            ),
            is_demo=True,
        )
    bv = db.scalar(
        select(m.BenchmarkVersion).where(
            m.BenchmarkVersion.benchmark_id == bench.id, m.BenchmarkVersion.version == "1.0.0"
        )
    )
    return {
        "agent_id": agent.id,
        "v1_id": first.id,
        "v2_id": second.id,
        "benchmark_id": bench.id,
        "benchmark_version_id": bv.id,
    }


if __name__ == "__main__":
    from agentlab.db import SessionLocal

    with SessionLocal.begin() as session:
        print("DEMO seed (fixtures only, NO fabricated results):", seed(session))
