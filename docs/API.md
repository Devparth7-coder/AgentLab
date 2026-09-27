# REST / CLI cookbook

OpenAPI is served at `http://localhost:8000/docs` and `/openapi.json`. Unless running explicitly unauthenticated local development, pass `X-API-Key: <admin key>` on protected endpoints; an optional viewer key permits read-only access. The web UI uses an authenticated BFF under `/api/proxy/*` so browser requests do **not** include the admin key.

## Endpoint map

| Workflow | REST paths |
| --- | --- |
| Liveness and operational data | `GET /health`, `GET /system/metrics`, `GET /overview`, `GET /metrics/definitions` |
| Agents | `GET/POST /agents`, `GET /agents/{id}`, `POST /agents/{id}/versions` |
| Benchmarks and templates | `GET/POST /benchmarks`, `GET /benchmarks/{id}`, `GET /benchmarks/catalog`, `GET/POST /tasks` (`POST` creates a new benchmark version) |
| Experiments and evaluation | `GET/POST /experiments`, `GET /experiments/{id}`, `GET /experiments/{id}/runs?limit=200&offset=0`, `GET /experiments/{id}/task-distribution`, `POST /experiments/{id}/run`, `/resume`, `/cancel`, `GET /evaluations` |
| Evidence | `GET /traces`, `GET /traces/{id}`, `GET /failures`, `GET /failures/{id}`, `POST /failures/{id}/replay` |
| Research | `POST /robustness/generate`, `GET /regressions`, `POST /regressions/compare`, `GET /cost/summary?experiment_id=...`, `GET /latency/distribution?experiment_id=...` |
| Reports/demo | `GET/POST /reports`, `GET /reports/{id}`, `GET /reports/{id}/download?format=pdf|md|json|html`, `POST /demo/seed`, `POST /demo/run` |

Common lists have `limit`/`offset` (max page size 200). Successful report POST freezes the *current* evidence; repeated report generation creates new snapshots instead of mutating the old one. Export JSON contains all frozen metric/failure/comparison records. The PDF is binary `application/pdf` and needs a file destination; the HTML export is standalone and print-ready with a restricted Content Security Policy when served by the API.

## An explicit custom benchmark

The following **local deterministic fixture example** creates an agent and task; there is no model price, token count or capability assertion. Save the first block as `agent.json` and the second as `benchmark.json`.

```json
{
  "name": "Fixture Echo Agent",
  "provider": "mock",
  "version": {
    "version": "1.0.0",
    "model": "echo-fixture",
    "tool_configuration": [],
    "configuration": {"behavior": "echo"}
  }
}
```

```json
{
  "name": "Fixture Echo Suite",
  "version": "1.0.0",
  "category": "General Agent",
  "tasks": [
    {
      "task_key": "hello",
      "input": "hello",
      "expected_output": "hello",
      "available_tools": [],
      "evaluation_config": {"evaluators": [{"type": "exact_match"}]}
    }
  ]
}
```

```bash
agentlab agent register --file agent.json
agentlab benchmark create --file benchmark.json
# Copy version IDs from responses; keep the benchmark version constant across paired comparisons.
agentlab benchmark run BENCHMARK_VERSION_ID --agent-version AGENT_VERSION_ID --runs 3 --seed 42
agentlab experiment status EXPERIMENT_ID
agentlab report generate EXPERIMENT_ID --format json --out evidence.json
```

Example via HTTP (requires `AGENTLAB_API_KEY` in your shell):

```bash
curl -H "X-API-Key: $AGENTLAB_API_KEY" \
  "http://localhost:8000/experiments/EXPERIMENT_ID/task-distribution"
curl -H "X-API-Key: $AGENTLAB_API_KEY" \
  "http://localhost:8000/experiments/EXPERIMENT_ID/runs?limit=20&offset=0"
curl -H "X-API-Key: $AGENTLAB_API_KEY" \
  "http://localhost:8000/reports/REPORT_ID/download?format=pdf" \
  --output evidence.pdf
```

**Credential hygiene:** never paste an API key, Bearer token or private content into task or version JSON; `configuration.secret_ref` accepts only an environment-variable **name**. Unmeasured numeric fields are JSON `null` (UI: Not measured); dates are ISO-8601 UTC. Errors use HTTP 400/401/403/404/409/413/422/429/503 with sanitized detail; 503 after dispatch can mean the experiment was **committed** and may be resumed.
