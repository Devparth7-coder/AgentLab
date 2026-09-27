import asyncio
import json
from types import SimpleNamespace

import pytest
from agentlab import models as m
from agentlab.benchmarks import new_benchmark
from agentlab.db import SessionLocal
from agentlab.evaluation import evaluate
from agentlab.executions import _pricing
from agentlab.failures import classify
from agentlab.metrics import percentile, wilson_ci
from agentlab.providers import PROVIDERS, provider_for
from agentlab.providers.base import AgentContext
from agentlab.providers.http import OpenAIProvider
from agentlab.registry import new_agent, new_version
from agentlab.schemas import AgentIn, BenchmarkIn, TaskIn, VersionIn
from agentlab.security import redact
from agentlab.tools import execute
from agentlab.tracing import TraceRecorder
from sqlalchemy import select


def test_registration_is_immutable_and_secret_safe():
    with SessionLocal.begin() as db:
        a = new_agent(
            db,
            AgentIn(
                name="Safe Research Agent",
                provider="mock",
                version=VersionIn(
                    version="1.0",
                    model="fixture",
                    tool_configuration=["calculator"],
                    configuration={"behavior": "echo"},
                ),
            ),
        )
        v = db.scalar(select(m.AgentVersion).where(m.AgentVersion.agent_id == a.id))
        assert v.system_prompt_hash and len(v.configuration_hash) == 64
        with pytest.raises(ValueError, match="immutable"):
            new_version(db, a, VersionIn(version="1.0", model="fixture"))
        with pytest.raises(ValueError, match="allowlisted"):
            new_version(
                db, a, VersionIn(version="2.0", model="fixture", tool_configuration=["delete_all"])
            )
    with pytest.raises(ValueError, match="Credential-like"):
        VersionIn(version="1.0", model="x", configuration={"api_key": "plaintext"})
    assert redact({"Authorization": "Bearer verysecret", "content": "sk-1234567890123456"}) == {
        "Authorization": "[REDACTED]",
        "content": "[REDACTED]",
    }


def test_task_clone_never_changes_original():
    from agentlab.benchmarks import clone_with_task

    with SessionLocal.begin() as db:
        b = new_benchmark(
            db,
            BenchmarkIn(
                name="Example benchmark",
                tasks=[TaskIn(task_key="first", input="One", expected_output="One")],
            ),
        )
        old = db.scalar(select(m.BenchmarkVersion).where(m.BenchmarkVersion.benchmark_id == b.id))
        new, added = clone_with_task(
            db, old, "2.0", TaskIn(task_key="second", input="Two", expected_output="Two")
        )
        assert added.benchmark_version_id == new.id
        assert db.query(m.Task).filter_by(benchmark_version_id=old.id).count() == 1
        assert db.query(m.Task).filter_by(benchmark_version_id=new.id).count() == 2
        assert old.content_hash != new.content_hash


def test_evaluators_and_metrics_no_fabrication():
    task = m.Task(
        input="calc",
        expected_output={"total_revenue": 3},
        evaluation_config={
            "evaluators": [
                {"type": "exact_match"},
                {
                    "type": "json_schema",
                    "schema": {
                        "type": "object",
                        "properties": {"total_revenue": {"type": "integer"}},
                        "required": ["total_revenue"],
                    },
                },
                {
                    "type": "tool_rules",
                    "required_tools": ["dataset.aggregate"],
                    "argument_equals": {"dataset.aggregate": {"region": "North", "month": "Jan"}},
                },
            ]
        },
    )
    trace = TraceRecorder(["dataset.aggregate"])
    trace.call_tool("dataset.aggregate", {"region": "North"})
    status, results = evaluate(task, json.dumps({"total_revenue": 3}), trace)
    assert status == "FAILED" and results[2]["evidence"]["invalid_arguments"]
    assert classify(status, results)[0] == "TOOL_ARGUMENT_FAILURE"
    task2 = m.Task(input="no reference", expected_output=None, evaluation_config={"evaluators": []})
    assert evaluate(task2, "looks convincing", TraceRecorder([]))[0] == "ERROR"
    assert percentile([2, 10, 4, 8], 0.95) == 10
    assert wilson_ci(8, 10)[0] < 80 < wilson_ci(8, 10)[1]
    assert (
        _pricing(m.AgentVersion(configuration={}), {"input_tokens": None, "output_tokens": None})[0]
        is None
    )
    assert (
        _pricing(
            m.AgentVersion(
                configuration={"pricing": {"input_per_million_usd": 2, "output_per_million_usd": 4}}
            ),
            {"input_tokens": 1000, "output_tokens": 500},
        )[0]
        == 0.004
    )


def test_tool_sandbox_and_provider_contract(monkeypatch):
    assert set(PROVIDERS) == {
        "mock",
        "openai",
        "anthropic",
        "gemini",
        "ollama",
        "huggingface",
        "custom_http",
    }
    assert execute("calculator", {"expression": "2 + 2 * 3"}, ["calculator"])["result"] == 8
    with pytest.raises(ValueError):
        execute("calculator", {"expression": "__import__('os').system('whoami')"}, ["calculator"])
    with pytest.raises(ValueError):
        execute("delete_user", {}, ["delete_user"])
    for name in PROVIDERS:
        p = provider_for(name)
        assert (
            callable(p.run_task)
            and callable(p.stream_task)
            and callable(p.get_usage)
            and callable(p.get_metadata)
        )
    monkeypatch.setenv("OPENAI_API_KEY", "unit-only-not-real")
    import agentlab.providers.http as adapters

    requests = []

    async def fake_post(url, headers, payload):
        requests.append(payload)
        if len(requests) == 1:
            return {
                "usage": {"prompt_tokens": 7, "completion_tokens": 4},
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call-1",
                                    "function": {
                                        "name": "calculator",
                                        "arguments": '{"expression":"2 + 2"}',
                                    },
                                }
                            ],
                        }
                    }
                ],
            }
        return {
            "usage": {"prompt_tokens": 10, "completion_tokens": 2},
            "choices": [{"message": {"content": "4"}}],
        }

    monkeypatch.setattr(adapters, "_post", fake_post)
    rec = TraceRecorder(["calculator"])
    ctx = AgentContext(
        agent=SimpleNamespace(provider="openai"),
        version=SimpleNamespace(
            prompt_template="math",
            model="test-model",
            temperature=0,
            max_tokens=64,
            configuration={},
            model_revision=None,
            configuration_hash="hash",
            tool_configuration=["calculator"],
        ),
        task=SimpleNamespace(input="2 + 2?", available_tools=["calculator"]),
        recorder=rec,
    )
    result = asyncio.run(OpenAIProvider().run_task(ctx))
    assert result.output == "4" and result.input_tokens == 17 and result.output_tokens == 6
    assert len(rec.calls) == 1 and rec.calls[0]["status"] == "SUCCESS"
    assert "Bearer unit-only-not-real" not in str(rec.events)
