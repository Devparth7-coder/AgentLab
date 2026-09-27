# Architecture and evidence model

AGENTLAB's unit of evidence is a **persisted task/run**, not a plausible-looking dashboard card.

```text
Browser (Next.js / React / TypeScript / Tailwind)
    │ same-origin HTTP-only signed session; /api/proxy/*
    ▼
Next.js BFF ── server-only X-API-Key ──► FastAPI (/openapi.json)
                                           │  Pydantic validation + audit
                                           │  SQLAlchemy / Alembic
                                           ▼
                                   PostgreSQL (versioned records)
                                           ▲
                                           │ idempotent task/run updates
                             Redis broker ─► Celery workers (4 concurrency by default)
                                                │ provider adapter → HTTPS API/local Ollama
                                                │ allowlisted local mock tools ONLY
                                                └ traces / evaluations / usage / failures
```

For quick local development, `AGENTLAB_QUEUE_MODE=local-thread` and SQLite replace Redis/Celery/PostgreSQL. This path is explicitly forbidden by production configuration validation; it uses one in-process worker. The browser polls status via SWR (not invented progress). The backend processes a provider call **after releasing its database connection**, then persists its trace and evaluation in a new transaction. A conditional run-state update claims queued jobs so broker redelivery cannot rerun a terminal record; a lost dispatch leaves durable QUEUED rows recoverable with `/resume`.

## Lifecycle

1. `POST /agents` creates an agent and immutable version. Further versions are added, never edited in place. Versions hold model ID/revision, system-prompt hash (prompt text not returned by read APIs), tool allowlist, pricing if supplied, and SHA-256 of effective configuration. Credential **environment variable names** may be referenced; secret values never enter versions.
2. `POST /benchmarks` creates a version with task input, reference, allowed tools, evaluation rules and a content SHA-256. Adding a task copies the previous version into a **new** version; old references remain pinned. Eight starter *templates* are available from `/benchmarks/catalog` without scores.
3. `POST /experiments` freezes version IDs, selected task IDs, seed, repetitions (1–20), harness version (`harness-1.0.0`), supplied configuration, effective environment, Git commit (or `unknown`) and a configuration SHA-256. A 2,000-run per-experiment cap bounds dispatch. `POST /experiments/{id}/run` creates durable QUEUED rows and dispatches jobs after commit.
4. Worker claims a run, calls the configured adapter, executes **only** allowlisted sandbox tools, writes observable trace events, tool call/result rows, output hashes and evaluation evidence, provider-reported usage and wall-clock latency. It emits no private chain-of-thought. When all runs are terminal it writes immutable metric rows, marking absent measurements null.
5. `GET /experiments/{id}` includes progress, first 1,000 runs and pinned provenance; `/runs?limit=&offset=` pages through up to 2,000 runs. `/task-distribution` computes per-task pass count, Wilson 95% interval and observed Bernoulli sample variance across repeated runs. Other endpoints expose traces, failure records with classification **signals**, and linked replay attempts.
6. Regression compares matched `(task_id, run_index)` pairs only when the benchmark version, selection, repetitions, seed, harness, experiment configuration, environment and demo status agree. A report freezes the **then-current** experiment/metric/failure/comparison snapshot in JSON/Markdown/HTML. PDF is rendered from that frozen JSON, not recalculated from live database records.

## Persisted entities

| Entity | Evidence recorded |
| --- | --- |
| `agents`, `agent_versions` | Provider/model/revision; allowlisted tools; prompt/config hashes; creation time and immutable version ID. |
| `benchmarks`, `benchmark_versions`, `tasks` | Immutable task and evaluator definitions, references, content hash, category and origin metadata. |
| `experiments`, `experiment_runs` | Frozen version IDs/environment/seed/commit, queue/terminal states, output hash, per-run timing and task pair key. |
| `evaluations`, `evaluation_results` | Evaluator type/version, PASS/FAIL/NOT_MEASURED, explicit explanation and redacted evidence. |
| `traces`, `trace_events`, `tool_calls`, `tool_results` | Observable tool arguments/results/errors and relative timing. No private reasoning field. |
| `latency_records`, `cost_records`, `metrics` | Wall-clock time and usage/pricing coverage; formula, numerator/denominator, source, sample count, timestamp and full experiment/version provenance. |
| `failures`, `failure_reproductions`, `regressions`, `reports` | Forensic signals, conditional replay verdicts, paired comparison deltas and frozen report snapshots. |
| `audit_logs` | Request ID, actor class, action, record ID and sanitized action metadata. The `users` table exists but does **not** confer web-console RBAC. |

Timestamps are UTC; SQLite's timezone-naive reads are explicitly serialized as UTC. SHA-256 fingerprints are **integrity identifiers, not proof that an external provider remains unchanged**. API mutations are append-only for historical versions/results; database administrators can still modify a database directly, so use backups and restricted DB privileges. Report exports contain task evidence—protect them as potentially sensitive research data.

## Components

- `packages/agentlab/`: domain models, schemas, engine, providers, evaluators, metrics, traces, tools, fixtures, reports and Typer CLI.
- `apps/api/agentlab_api/`: authenticated FastAPI routes, request audit, rate limiting, operational measurements; migration scripts in `migrations/`.
- `apps/web/`: Next.js app router, server-only auth/proxy, React views, Playwright E2E.
- `docker-compose.yml`, `docker/`: PostgreSQL 16, Redis 7, backend migrations/API, Celery worker and Next.js. Published ports are loopback-only by default.

See [METHODOLOGY.md](METHODOLOGY.md) for definitions, [SECURITY.md](SECURITY.md) for boundaries, and [OPERATIONS.md](OPERATIONS.md) for recoverability.
