"""Common provider contract. StreamTask may emit only a final event for non-streaming APIs."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator

from agentlab import models as m
from agentlab.tracing import TraceRecorder


class ProviderError(Exception):
    pass


@dataclass
class AgentContext:
    agent: m.Agent
    version: m.AgentVersion
    task: m.Task
    recorder: TraceRecorder
    seed: int = 0


@dataclass
class AgentResult:
    output: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    ttft_ms: float | None = None
    api_calls: int = 0
    metadata: dict = field(default_factory=dict)


class AgentProvider(ABC):
    name: str = "base"
    supports_tools: bool = False

    @abstractmethod
    async def run_task(self, ctx: AgentContext) -> AgentResult:
        raise NotImplementedError

    async def stream_task(self, ctx: AgentContext) -> AsyncIterator[dict]:
        """Uniform async iterator; default is a final event, not a claim of token streaming."""
        result = await self.run_task(ctx)
        yield {"type": "FINAL_RESPONSE", "output": result.output}

    def get_usage(self, result: AgentResult) -> dict:
        return {
            "input_tokens": result.input_tokens,
            "output_tokens": result.output_tokens,
            "total_tokens": result.input_tokens + result.output_tokens
            if result.input_tokens is not None and result.output_tokens is not None
            else None,
        }

    def get_metadata(self, ctx: AgentContext) -> dict:
        return {
            "provider": self.name,
            "model": ctx.version.model,
            "model_revision": ctx.version.model_revision,
            "supports_tools": self.supports_tools,
            "configuration_hash": ctx.version.configuration_hash,
        }
