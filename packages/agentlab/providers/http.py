"""HTTP model adapters. Endpoints and secrets ONLY from server environment; tools sandboxed."""

import json
import os
from urllib.parse import quote

import httpx

from agentlab.config import settings
from agentlab.providers.base import AgentContext, AgentProvider, AgentResult, ProviderError
from agentlab.security import VALID_ENV_REF
from agentlab.tools import TOOL_SCHEMAS


def _secret(ctx: AgentContext, default: str) -> str:
    ref = ctx.version.configuration.get("secret_ref", default)
    if not isinstance(ref, str) or not VALID_ENV_REF.fullmatch(ref):
        raise ProviderError("Invalid credential environment reference")
    key = os.getenv(ref, "")
    if not key:
        raise ProviderError(f"Missing provider credential environment variable {ref}")
    return key


def _endpoint(env: str, default: str, *, local: bool = False) -> str:
    url = os.getenv(env, default).rstrip("/")
    if not url or (not url.startswith("https://") and not (local and url.startswith("http://"))):
        raise ProviderError(
            f"{env} must be an HTTPS URL" + (" or configured local HTTP endpoint" if local else "")
        )
    # Admin controls URL via environment, never from agent/task/user payload.
    return url


async def _post(url: str, headers: dict, payload: dict) -> dict:
    try:
        async with httpx.AsyncClient(
            timeout=settings().provider_timeout_seconds, follow_redirects=False
        ) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise ProviderError("Provider response must be a JSON object")
            return data
    except httpx.TimeoutException as exc:
        raise ProviderError("Provider request timed out") from exc
    except httpx.HTTPStatusError as exc:
        raise ProviderError(f"Provider returned HTTP {exc.response.status_code}") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise ProviderError("Provider request failed or response was invalid") from exc


def _tool_specs(ctx: AgentContext, anthropic: bool = False) -> list[dict]:
    allowed = (
        set(ctx.task.available_tools) & set(ctx.version.tool_configuration) & set(TOOL_SCHEMAS)
    )
    return [
        {
            "name": name,
            "description": TOOL_SCHEMAS[name]["description"],
            "input_schema" if anthropic else "parameters": TOOL_SCHEMAS[name]["parameters"],
        }
        for name in sorted(allowed)
    ]


def _parse_args(value) -> dict:
    try:
        data = json.loads(value) if isinstance(value, str) else value
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def _usage_add(previous: int | None, added: int | None) -> int | None:
    return previous + added if previous is not None and isinstance(added, int) else None


class OpenAIProvider(AgentProvider):
    name = "openai"
    supports_tools = True
    env_base = "AGENTLAB_OPENAI_BASE_URL"
    default_base = "https://api.openai.com/v1"
    default_ref = "OPENAI_API_KEY"

    async def run_task(self, ctx: AgentContext) -> AgentResult:
        endpoint = _endpoint(self.env_base, self.default_base) + "/chat/completions"
        headers = {"Authorization": "Bearer " + _secret(ctx, self.default_ref)}
        messages = (
            [{"role": "system", "content": ctx.version.prompt_template}]
            if ctx.version.prompt_template
            else []
        ) + [{"role": "user", "content": ctx.task.input}]
        specs = _tool_specs(ctx)
        tools = [{"type": "function", "function": spec} for spec in specs]
        input_tokens: int | None = 0
        output_tokens: int | None = 0
        calls = 0
        for _ in range(5):
            payload = {
                "model": ctx.version.model,
                "messages": messages,
                "temperature": ctx.version.temperature,
                "max_tokens": ctx.version.max_tokens,
            }
            if tools:
                payload["tools"] = tools
            data = await _post(endpoint, headers, payload)
            calls += 1
            usage = data.get("usage") or {}
            input_tokens = _usage_add(input_tokens, usage.get("prompt_tokens"))
            output_tokens = _usage_add(output_tokens, usage.get("completion_tokens"))
            try:
                message = data["choices"][0]["message"]
            except (KeyError, IndexError, TypeError) as exc:
                raise ProviderError("Missing choices/message in provider response") from exc
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                content = message.get("content") or ""
                if isinstance(content, list):
                    content = "\n".join(
                        str(part.get("text", "")) for part in content if isinstance(part, dict)
                    )
                return AgentResult(
                    output=str(content),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    api_calls=calls,
                )
            messages.append(
                {"role": "assistant", "content": message.get("content"), "tool_calls": tool_calls}
            )
            for call in tool_calls:
                name = call.get("function", {}).get("name", "")
                outcome = ctx.recorder.call_tool(
                    name, _parse_args(call.get("function", {}).get("arguments"))
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id", "missing"),
                        "content": json.dumps(outcome.value),
                    }
                )
        raise ProviderError("Provider exceeded the tool-turn limit (5)")


class HuggingFaceProvider(OpenAIProvider):
    name = "huggingface"
    env_base = "AGENTLAB_HF_BASE_URL"
    default_base = "https://router.huggingface.co/v1"
    default_ref = "HF_TOKEN"


class AnthropicProvider(AgentProvider):
    name = "anthropic"
    supports_tools = True

    async def run_task(self, ctx: AgentContext) -> AgentResult:
        url = _endpoint("AGENTLAB_ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1") + "/messages"
        headers = {
            "x-api-key": _secret(ctx, "ANTHROPIC_API_KEY"),
            "anthropic-version": "2023-06-01",
        }
        messages = [{"role": "user", "content": ctx.task.input}]
        specs = _tool_specs(ctx, anthropic=True)
        inp: int | None = 0
        out: int | None = 0
        for call_index in range(5):
            payload = {
                "model": ctx.version.model,
                "max_tokens": ctx.version.max_tokens,
                "temperature": ctx.version.temperature,
                "messages": messages,
            }
            if ctx.version.prompt_template:
                payload["system"] = ctx.version.prompt_template
            if specs:
                payload["tools"] = specs
            data = await _post(url, headers, payload)
            usage = data.get("usage") or {}
            inp = _usage_add(inp, usage.get("input_tokens"))
            out = _usage_add(out, usage.get("output_tokens"))
            blocks = data.get("content") or []
            tool_blocks = [block for block in blocks if block.get("type") == "tool_use"]
            if not tool_blocks:
                return AgentResult(
                    output="\n".join(
                        str(b.get("text", "")) for b in blocks if b.get("type") == "text"
                    ),
                    input_tokens=inp,
                    output_tokens=out,
                    api_calls=call_index + 1,
                )
            messages.append({"role": "assistant", "content": blocks})
            feedback = []
            for block in tool_blocks:
                outcome = ctx.recorder.call_tool(block.get("name", ""), block.get("input") or {})
                feedback.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.get("id"),
                        "content": json.dumps(outcome.value),
                        "is_error": not outcome.ok,
                    }
                )
            messages.append({"role": "user", "content": feedback})
        raise ProviderError("Provider exceeded the tool-turn limit (5)")


class GeminiProvider(AgentProvider):
    name = "gemini"
    supports_tools = True

    async def run_task(self, ctx: AgentContext) -> AgentResult:
        model = quote(ctx.version.model, safe="-_.")
        url = (
            _endpoint(
                "AGENTLAB_GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
            )
            + f"/models/{model}:generateContent"
        )
        headers = {"x-goog-api-key": _secret(ctx, "GEMINI_API_KEY")}
        contents = [{"role": "user", "parts": [{"text": ctx.task.input}]}]
        specs = _tool_specs(ctx)
        declarations = [
            {
                "name": item["name"],
                "description": item["description"],
                "parameters": {
                    k: v for k, v in item["parameters"].items() if k != "additionalProperties"
                },
            }
            for item in specs
        ]
        inp: int | None = 0
        out: int | None = 0
        for call_index in range(5):
            payload = {
                "contents": contents,
                "generationConfig": {
                    "temperature": ctx.version.temperature,
                    "maxOutputTokens": ctx.version.max_tokens,
                },
            }
            if ctx.version.prompt_template:
                payload["systemInstruction"] = {"parts": [{"text": ctx.version.prompt_template}]}
            if declarations:
                payload["tools"] = [{"functionDeclarations": declarations}]
            data = await _post(url, headers, payload)
            usage = data.get("usageMetadata") or {}
            inp = _usage_add(inp, usage.get("promptTokenCount"))
            out = _usage_add(out, usage.get("candidatesTokenCount"))
            try:
                content = data["candidates"][0]["content"]
                parts = content["parts"]
            except (KeyError, IndexError, TypeError) as exc:
                raise ProviderError("Missing candidate content in provider response") from exc
            function_parts = [part["functionCall"] for part in parts if "functionCall" in part]
            if not function_parts:
                return AgentResult(
                    output="\n".join(str(part.get("text", "")) for part in parts),
                    input_tokens=inp,
                    output_tokens=out,
                    api_calls=call_index + 1,
                )
            contents.append({"role": "model", "parts": parts})
            replies = []
            for call in function_parts:
                name = call.get("name", "")
                outcome = ctx.recorder.call_tool(name, call.get("args") or {})
                replies.append({"functionResponse": {"name": name, "response": outcome.value}})
            contents.append({"role": "user", "parts": replies})
        raise ProviderError("Provider exceeded the tool-turn limit (5)")


class OllamaProvider(AgentProvider):
    name = "ollama"
    supports_tools = True

    async def run_task(self, ctx: AgentContext) -> AgentResult:
        url = (
            _endpoint("AGENTLAB_OLLAMA_BASE_URL", "http://127.0.0.1:11434", local=True)
            + "/api/chat"
        )
        messages = (
            [{"role": "system", "content": ctx.version.prompt_template}]
            if ctx.version.prompt_template
            else []
        ) + [{"role": "user", "content": ctx.task.input}]
        specs = _tool_specs(ctx)
        inp: int | None = 0
        out: int | None = 0
        for call_index in range(5):
            payload = {
                "model": ctx.version.model,
                "messages": messages,
                "stream": False,
                "options": {
                    "temperature": ctx.version.temperature,
                    "num_predict": ctx.version.max_tokens,
                },
            }
            if specs:
                payload["tools"] = [{"type": "function", "function": spec} for spec in specs]
            data = await _post(url, {}, payload)
            inp = _usage_add(inp, data.get("prompt_eval_count"))
            out = _usage_add(out, data.get("eval_count"))
            message = data.get("message") or {}
            tool_calls = message.get("tool_calls") or []
            if not tool_calls:
                return AgentResult(
                    output=str(message.get("content") or ""),
                    input_tokens=inp,
                    output_tokens=out,
                    api_calls=call_index + 1,
                )
            messages.append(message)
            for call in tool_calls:
                name = call.get("function", {}).get("name", "")
                outcome = ctx.recorder.call_tool(
                    name, _parse_args(call.get("function", {}).get("arguments"))
                )
                messages.append(
                    {"role": "tool", "content": json.dumps(outcome.value), "tool_name": name}
                )
        raise ProviderError("Provider exceeded the tool-turn limit (5)")


class CustomHTTPProvider(AgentProvider):
    name = "custom_http"
    supports_tools = True

    async def run_task(self, ctx: AgentContext) -> AgentResult:
        url = _endpoint("AGENTLAB_CUSTOM_HTTP_URL", "")
        headers = {}
        if ctx.version.configuration.get("secret_ref"):
            headers["Authorization"] = "Bearer " + _secret(ctx, "")
        tool_results = []
        inp: int | None = 0
        out: int | None = 0
        for call_index in range(5):
            data = await _post(
                url,
                headers,
                {
                    "task": ctx.task.input,
                    "system_prompt": ctx.version.prompt_template,
                    "model": ctx.version.model,
                    "seed": ctx.seed,
                    "tools": _tool_specs(ctx),
                    "tool_results": tool_results,
                    "configuration": {
                        k: v
                        for k, v in ctx.version.configuration.items()
                        if k not in {"secret_ref", "pricing"}
                    },
                },
            )
            usage = data.get("usage") or {}
            inp = _usage_add(inp, usage.get("input_tokens"))
            out = _usage_add(out, usage.get("output_tokens"))
            calls = data.get("tool_calls") or []
            if not calls:
                return AgentResult(
                    output=str(data.get("output", "")),
                    input_tokens=inp,
                    output_tokens=out,
                    api_calls=call_index + 1,
                    ttft_ms=data.get("ttft_ms")
                    if isinstance(data.get("ttft_ms"), (int, float))
                    else None,
                )
            tool_results = []
            for call in calls:
                name = call.get("name", "")
                outcome = ctx.recorder.call_tool(name, _parse_args(call.get("arguments")))
                tool_results.append(
                    {"id": call.get("id"), "name": name, "result": outcome.value, "ok": outcome.ok}
                )
        raise ProviderError("Provider exceeded the tool-turn limit (5)")
