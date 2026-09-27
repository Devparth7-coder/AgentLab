"""Deterministic mock agent for a controlled DEMO; never report its outputs as real model results."""

import json

from agentlab.providers.base import AgentContext, AgentProvider, AgentResult, ProviderError


class MockProvider(AgentProvider):
    name = "mock"
    supports_tools = True

    async def run_task(self, ctx: AgentContext) -> AgentResult:
        mode = ctx.version.configuration.get("behavior")
        if mode == "demo_dataset":
            region, month = (
                ctx.task.task_metadata.get("region"),
                ctx.task.task_metadata.get("month"),
            )
            if not isinstance(region, str) or not isinstance(month, str):
                raise ProviderError("Demo fixture task metadata is incomplete")
            arguments = {"region": region, "month": month}
            if (
                ctx.version.configuration.get("fault_policy") == "omit_month_every_fifth"
                and ctx.task.task_metadata.get("demo_case_index", -1) % 5 == 0
            ):
                arguments.pop("month")  # explicit, controlled tool-argument regression
            outcome = ctx.recorder.call_tool("dataset.aggregate", arguments)
            if not outcome.ok:
                raise ProviderError(outcome.error or "Mock tool failed")
            return AgentResult(
                output=json.dumps(
                    {"total_revenue": outcome.value["total_revenue"]}, sort_keys=True
                ),
                metadata={"fixture": "demo-revenue-1.0.0", "deterministic": True},
            )
        if mode == "echo":
            return AgentResult(output=ctx.task.input, metadata={"deterministic": True})
        if mode == "static_response":
            return AgentResult(
                output=str(ctx.version.configuration.get("response", "")),
                metadata={"deterministic": True},
            )
        if mode == "tool_recovery":
            outcome = ctx.recorder.call_tool("mock.unavailable", {})
            if not outcome.ok:
                ctx.recorder.event(
                    "AGENT_RETRY",
                    status="INFO",
                    output_metadata={"strategy": "calculator_fallback"},
                )
                fallback = ctx.recorder.call_tool("calculator", {"expression": "2 + 2"})
                return AgentResult(
                    output=str(fallback.value.get("result")), metadata={"deterministic": True}
                )
        raise ProviderError("Mock agent requires an explicit allowlisted behavior")
