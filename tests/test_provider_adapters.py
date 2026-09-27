"""Contract fixtures exercise each adapter without claiming a live model call."""

import asyncio
from types import SimpleNamespace

import pytest
from agentlab.providers.base import AgentContext, ProviderError
from agentlab.providers.http import (
    AnthropicProvider,
    CustomHTTPProvider,
    GeminiProvider,
    HuggingFaceProvider,
    OllamaProvider,
    OpenAIProvider,
)
from agentlab.tracing import TraceRecorder


def context(*, config=None, tool="calculator"):
    return AgentContext(
        agent=SimpleNamespace(provider="test"),
        version=SimpleNamespace(
            prompt_template="Test prompt",
            model="fixture-model",
            temperature=0.0,
            max_tokens=128,
            configuration=config or {},
            model_revision="local-fixture",
            configuration_hash="test-hash",
            tool_configuration=[tool],
        ),
        task=SimpleNamespace(input="2 + 2", available_tools=[tool]),
        recorder=TraceRecorder([tool]),
        seed=12,
    )


@pytest.mark.parametrize(
    ("provider", "credential_env", "reply"),
    [
        (
            OpenAIProvider,
            "OPENAI_API_KEY",
            {
                "choices": [{"message": {"content": "four"}}],
                "usage": {"prompt_tokens": 7, "completion_tokens": 4},
            },
        ),
        (
            HuggingFaceProvider,
            "HF_TOKEN",
            {
                "choices": [{"message": {"content": "four"}}],
                "usage": {"prompt_tokens": 7, "completion_tokens": 4},
            },
        ),
        (
            AnthropicProvider,
            "ANTHROPIC_API_KEY",
            {
                "content": [{"type": "text", "text": "four"}],
                "usage": {"input_tokens": 7, "output_tokens": 4},
            },
        ),
        (
            GeminiProvider,
            "GEMINI_API_KEY",
            {
                "candidates": [{"content": {"parts": [{"text": "four"}]}}],
                "usageMetadata": {"promptTokenCount": 7, "candidatesTokenCount": 4},
            },
        ),
        (
            OllamaProvider,
            None,
            {"message": {"content": "four"}, "prompt_eval_count": 7, "eval_count": 4},
        ),
        (
            CustomHTTPProvider,
            None,
            {"output": "four", "usage": {"input_tokens": 7, "output_tokens": 4}},
        ),
    ],
)
def test_adapter_fixture_contract(monkeypatch, provider, credential_env, reply):
    import agentlab.providers.http as adapters

    if credential_env:
        monkeypatch.setenv(credential_env, "fixture-credential-not-real")
    monkeypatch.setenv("AGENTLAB_CUSTOM_HTTP_URL", "https://fixture-agent.example/run")
    requests = []

    async def fake_post(url, headers, payload):
        requests.append((url, headers, payload))
        return reply

    monkeypatch.setattr(adapters, "_post", fake_post)
    ctx = context()
    runner = provider()
    result = asyncio.run(runner.run_task(ctx))
    assert result.output == "four" and result.api_calls == 1
    assert runner.get_usage(result) == {"input_tokens": 7, "output_tokens": 4, "total_tokens": 11}
    assert runner.get_metadata(ctx)["provider"] == runner.name
    assert requests[0][0].startswith("https://") or runner.name == "ollama"
    assert "fixture-credential-not-real" not in str(requests[0][2])
    assert "fixture-credential-not-real" not in str(ctx.recorder.events)


@pytest.mark.parametrize(
    "provider",
    [
        OpenAIProvider,
        HuggingFaceProvider,
        AnthropicProvider,
        GeminiProvider,
        OllamaProvider,
        CustomHTTPProvider,
    ],
)
def test_missing_usage_is_not_fake_zero(monkeypatch, provider):
    import agentlab.providers.http as adapters

    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("HF_TOKEN", "test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    monkeypatch.setenv("AGENTLAB_CUSTOM_HTTP_URL", "https://fixture-agent.example/run")
    reply = {
        "openai": {"choices": [{"message": {"content": "answer"}}]},
        "huggingface": {"choices": [{"message": {"content": "answer"}}]},
        "anthropic": {"content": [{"type": "text", "text": "answer"}]},
        "gemini": {"candidates": [{"content": {"parts": [{"text": "answer"}]}}]},
        "ollama": {"message": {"content": "answer"}},
        "custom_http": {"output": "answer"},
    }

    async def fake_post(url, headers, payload):
        return reply[provider.name]

    monkeypatch.setattr(adapters, "_post", fake_post)
    result = asyncio.run(provider().run_task(context()))
    assert provider().get_usage(result) == {
        "input_tokens": None,
        "output_tokens": None,
        "total_tokens": None,
    }


def test_custom_provider_scopes_secret_and_forbids_insecure_endpoint(monkeypatch):
    import agentlab.providers.http as adapters

    monkeypatch.setenv("AGENTLAB_PROVIDER_FIXTURE_TOKEN", "test-placeholder")
    monkeypatch.setenv("AGENTLAB_CUSTOM_HTTP_URL", "https://fixture-agent.example/run")
    observed = []

    async def fake_post(url, headers, payload):
        observed.append((url, headers, payload))
        return {"output": "done"}

    monkeypatch.setattr(adapters, "_post", fake_post)
    ctx = context(config={"secret_ref": "AGENTLAB_PROVIDER_FIXTURE_TOKEN", "mode": "fixture"})
    asyncio.run(CustomHTTPProvider().run_task(ctx))
    assert observed[0][1]["Authorization"] == "Bearer test-placeholder"
    assert observed[0][2]["configuration"] == {"mode": "fixture"}
    assert "secret_ref" not in str(observed[0][2])
    monkeypatch.setenv("AGENTLAB_CUSTOM_HTTP_URL", "http://insecure.example/run")
    with pytest.raises(ProviderError, match="HTTPS"):
        asyncio.run(CustomHTTPProvider().run_task(ctx))


@pytest.mark.asyncio
async def test_http_transport_bounded_retry_and_no_response_leak(monkeypatch):
    import httpx
    from agentlab.providers import http as adapters

    requests, delays = [], []

    def handler(request):
        requests.append(request)
        if len(requests) < 3:
            return httpx.Response(
                429, json={"secret": "provider-should-not-leak"}, headers={"Retry-After": "0.1"}
            )
        return httpx.Response(200, json={"output": "observed"})

    original_client = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        adapters.httpx,
        "AsyncClient",
        lambda **kwargs: original_client(transport=transport, **kwargs),
    )

    async def record_delay(seconds):
        delays.append(seconds)

    monkeypatch.setattr(adapters.asyncio, "sleep", record_delay)
    data = await adapters._post("https://fixture-provider.example/run", {}, {"test": True})
    assert data == {"output": "observed", "__agentlab_attempts": 3} and len(requests) == 3
    assert delays == [0.1, 0.1]

    def always_forbidden(request):
        requests.append(request)
        return httpx.Response(403, json={"secret": "provider-should-not-leak"})

    transport = httpx.MockTransport(always_forbidden)
    with pytest.raises(ProviderError, match="HTTP 403") as exc:
        await adapters._post("https://fixture-provider.example/run", {}, {})
    assert "provider-should-not-leak" not in str(exc.value)
    assert len(requests) == 4  # non-retryable status is attempted exactly once


def test_adapter_counts_retry_attempts_and_rejects_negative_usage(monkeypatch):
    import agentlab.providers.http as adapters

    monkeypatch.setenv("OPENAI_API_KEY", "fixture-not-real")

    async def counted_post(url, headers, payload):
        return {
            "choices": [{"message": {"content": "observed"}}],
            "usage": {"prompt_tokens": -3, "completion_tokens": 2},
            "__agentlab_attempts": 3,
        }

    monkeypatch.setattr(adapters, "_post", counted_post)
    result = asyncio.run(OpenAIProvider().run_task(context()))
    assert result.api_calls == 3  # physical HTTP attempts, not logical turns
    assert result.input_tokens is None and result.output_tokens == 2
    assert OpenAIProvider().get_usage(result)["total_tokens"] is None
