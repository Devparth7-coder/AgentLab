# Provider contract and credential boundaries

The provider abstraction is deliberately narrower than a hosted chat UI: it accepts a pinned task/context and returns the **actual** output and provider-reported usage, while local sandbox tools write observable events. `packages/agentlab/providers/base.py` defines `AgentProvider.run_task`, `stream_task`, `get_usage` and `get_metadata`; default `stream_task` emits **only a final response**, not a false claim of token streaming. Every adapter has the same trace/evaluator pipeline.

| Provider name | Wire contract / configuration | Notes |
| --- | --- | --- |
| `mock` | Deterministic in-process fixture, explicit `configuration.behavior` (`echo`, `static_response`, `demo_dataset`, `tool_recovery`). | Every mock agent/run is marked DEMO; the fixture reports **no token usage/cost**. Demo runs are synthetic, never real-model performance. |
| `openai` | OpenAI Chat Completions `AGENTLAB_OPENAI_BASE_URL` (default official HTTPS `/v1`), `OPENAI_API_KEY`; function-tool loop. | Model ID/revision are user-pinned metadata; endpoint must support this request shape. |
| `huggingface` | OpenAI-compatible Hugging Face router (`AGENTLAB_HF_BASE_URL`, `HF_TOKEN`). | Only models/endpoints supporting the compatible chat/tool contract will work; no implied capability. |
| `anthropic` | Messages API (`AGENTLAB_ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`), tool-use blocks and tool-result messages. | Usage comes from `input_tokens` / `output_tokens` fields when supplied. |
| `gemini` | GenerateContent (`AGENTLAB_GEMINI_BASE_URL`, `GEMINI_API_KEY`), function call/response parts. | Usage comes from `usageMetadata` when supplied. |
| `ollama` | Local `AGENTLAB_OLLAMA_BASE_URL` (defaults to `http://127.0.0.1:11434` in local mode); chat/tool request, `stream:false`. | Set `http://host.docker.internal:11434` when Ollama runs on the Docker host; host gateway mapping is in Compose. Do not expose an untrusted Ollama host. |
| `custom_http` | Admin-configured **HTTPS** `AGENTLAB_CUSTOM_HTTP_URL`; optional `configuration.secret_ref` and `Authorization: Bearer ...`. | Simple envelope below; use only trusted server-side services. No URL from task/agent submissions. |

No live provider is contacted until an operator registers a matching agent/version, configures its credential **in server environment**, and queues an experiment. A missing credential raises a recorded provider error; it does not create a synthetic success, token count or estimated cost. Third-party API formats change: these HTTP adapters are covered by **mock transport contract tests**, not a guarantee of compatibility with every model/version.

## Credential and pricing configuration

A version may set `configuration.secret_ref` to a validated **name** such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN` or `AGENTLAB_PROVIDER_TEAM_KEY`. The runtime looks it up in environment variables; values are never submitted in registration JSON, returned from the API, persisted in agent versions or printed by the CLI. Compose exposes the four built-in provider variables to the worker only; for custom `AGENTLAB_PROVIDER_*` references, inject that variable into the **worker** via your deployment/Compose override or secret manager. Production requires HTTPS provider URLs except the deliberately local Ollama adapter. The API and BFF must be behind TLS in external deployments.

Pricing is **operator-supplied metadata**, not a platform guess, for example:

```json
{
  "name": "My Research Agent",
  "provider": "openai",
  "version": {
    "version": "1.0.0",
    "model": "my-actual-configured-model-id",
    "model_revision": "revision-if-known",
    "system_prompt": "Follow the explicit task and tool policy.",
    "tool_configuration": ["calculator"],
    "configuration": {
      "secret_ref": "OPENAI_API_KEY",
      "pricing": {
        "input_per_million_usd": 1.0,
        "output_per_million_usd": 2.0
      }
    }
  }
}
```

**The price numbers above are illustrative user input, not actual model pricing or a capability claim.** Replace them with your verified dated rates before reporting cost; omit `pricing` if unavailable. Even with prices, an estimate remains null until provider-reported tokens cover every completed run. Costs exclude tool fees, remote infrastructure and LLM judge usage. Recorded provider API calls count actual HTTP attempts including successful retries. If an adapter fails without a final response, its API-call count is **unknown/null**, not an invented zero; mock success performs **zero** network API calls. No fake latency is assigned. `max_tokens`/temperature/model ID are passed to compatible adapters; model-level support depends on the actual endpoint.

## Custom HTTP envelope

The worker POSTs JSON to the **admin-configured** `AGENTLAB_CUSTOM_HTTP_URL`:

```json
{
  "task": "Compute 2 + 2",
  "system_prompt": "Use the sandbox calculator",
  "model": "your-agent-id",
  "seed": 42,
  "tools": [{"name": "calculator", "description": "...", "parameters": {}}],
  "tool_results": [],
  "configuration": {"domain": "test"}
}
```

The service responds with `{"output":"4","usage":{"input_tokens":7,"output_tokens":4}}`; token fields are optional and **not** inferred when absent. To request a sandbox tool it can instead respond `{"tool_calls":[{"id":"call-1","name":"calculator","arguments":{"expression":"2+2"}}]}`. AGENTLAB validates/executes the allowlisted tool locally and sends the next request with `tool_results: [{"id":"call-1","name":"calculator","result":...,"ok":true}]`, for at most **five tool turns**. The worker never forwards `secret_ref` or pricing metadata in the envelope. Secrets are only used in server-side authorization headers.

## Failure and retry semantics

Each HTTP request uses a configured timeout (`AGENTLAB_PROVIDER_TIMEOUT_SECONDS`, default 45) and up to **three** attempts for transport/timeouts and HTTP `408/429/500/502/503/504`, with bounded exponential backoff or numeric `Retry-After` capped at five seconds. A POST may reach an external provider before timing out; a retry **can duplicate billing or side effects**. For high-stakes tasks use idempotency at your trusted provider and audit invoices; do not assume the platform can reverse a provider-side action. Error messages suppress provider response bodies, keys and connection URLs. Calls to local sandbox tools are side-effect-free and have a separate allowlist. The worker currently has no per-provider token-bucket or concurrency governor beyond its configured Celery concurrency; use provider-side limits and deployment controls.

See [SECURITY.md](SECURITY.md) and [METHODOLOGY.md](METHODOLOGY.md) before interpreting results.
