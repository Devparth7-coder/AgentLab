# AGENTLAB

**Test. Observe. Break. Improve.** An evidence-first workbench for AI-agent reliability: versioned agents and benchmarks, asynchronous task-level evaluations, observable traces, failure replay, controlled robustness probes, paired regression analysis, measured cost/latency and exportable reports.

> **No convincing-looking invented scores.** Every displayed metric comes from persisted executions, with a formula, sample count, source, timestamp, agent version, benchmark version and experiment provenance. Missing usage/pricing is **Not measured**; unstarted work is **Pending evaluation**. The optional demo is explicitly **DEMO / SYNTHETIC**, not a model-capability claim.

## What runs today

| Surface | Implemented behavior |
| --- | --- |
| Registry | Immutable agent versions (provider, model, revision, prompt hash, tool allowlist, config hash) and immutable benchmark versions with reference answers and evaluator rules. |
| Workers | Durable per-task/per-run rows; PostgreSQL + Redis/Celery in Compose. Queue, poll, cancel pending work, resume queued work and explicitly recover stale work. SQLite/local-thread mode is for development only. |
| Evidence | Redacted observable input/output metadata, sandboxed tool calls/results, evaluator evidence, run latency, failures, frequency, and conditional replay outcomes. **No private chain-of-thought.** |
| Measurement | Explicit denominators and measurement coverage, multi-run per-task Wilson intervals and variance, provider-reported token usage, configured-price inference estimates, wall-clock latency percentiles. Null ≠ zero. |
| Research loop | Seeded robustness variants, comparable paired regression deltas and new-failure links, immutable JSON/Markdown/HTML report snapshots and PDF exports from those snapshots. |
| Interface | Responsive Next.js dark research console: overview, agents/versions, benchmarks/suites, experiments, traces, failures, robustness, regression, cost/latency, reports, methodology and operations. Browser traffic goes through an authenticated same-origin BFF. |
| Integrations | Mock, OpenAI-compatible, Anthropic, Gemini, Ollama, Hugging Face (OpenAI-compatible router) and custom HTTPS HTTP adapters. External calls require administrator-configured credentials; no real-model result is bundled. |

## Start with Docker Compose

Requires Docker Compose v2, Git and available ports 3000/8000. **Docker is not available in this development sandbox, so the Compose deployment itself has not been executed here.** The API, migrations, web production build, unit/integration tests and browser E2E flows were exercised locally with SQLite.

1. `cp .env.example .env` and keep `.env` private (it is Git-ignored). Replace `POSTGRES_PASSWORD`, `AGENTLAB_API_KEY`, `WEB_ACCESS_KEY` and `WEB_SESSION_SECRET` with **four different** cryptographically random values, at least 32 characters for the last three (for example `openssl rand -hex 32` for each). Set `GIT_COMMIT` to `git rev-parse HEAD`; if unavailable leave the explicit value `unknown`, not a guessed SHA. In production inject values with your secret manager instead of committing local `.env` files, set `AGENTLAB_ENV=production`, and set `AGENTLAB_DEMO_SEED=false` unless intentionally using the synthetic fixture. Compose wires `BACKEND_API_KEY` to `AGENTLAB_API_KEY` server-side.
2. `make dev` (runs `docker compose up --build -d`). The backend upgrades Alembic before starting; the worker and web start afterward.
3. Visit **http://localhost:3000**, enter your `WEB_ACCESS_KEY`. The API documentation is **http://localhost:8000/docs**; use `X-API-Key: <AGENTLAB_API_KEY>` for protected API calls. Services bind to **127.0.0.1** by default; put HTTPS and a trusted proxy in front before external access. `make down` stops services without deleting the named PostgreSQL/Redis volumes.
4. The landing page is intentionally empty until real runs finish. With `AGENTLAB_DEMO_SEED=true`, only the **fixture definitions** are preloaded; **no scores are seeded**. Click **Run 50-case demo** in Experiments to generate two new, measured mock experiments. Compare them, inspect a linked failure/trace, replay it, generate a robustness suite and export an evidence PDF.

Docker Compose requires a set `POSTGRES_PASSWORD`; its `.env.example` host-side `AGENTLAB_DATABASE_URL` is an example to adjust when running **outside** Compose. Compose constructs its own container database URL using `POSTGRES_PASSWORD`.

### Local development without Docker

Use Python 3.11+, Node 20+, and a local terminal for each service. This mode uses **SQLite + a single in-process worker**, not Redis/Celery, and must never be used as a production deployment:

```bash
python -m pip install -e '.[dev]'
npm --prefix apps/web ci
export AGENTLAB_ENV=development AGENTLAB_AUTH_MODE=disabled AGENTLAB_QUEUE_MODE=local-thread
export AGENTLAB_DATABASE_URL=sqlite:///./agentlab.db
export AGENTLAB_DEMO_SEED=true
export GIT_COMMIT="$(git rev-parse HEAD)"
alembic upgrade head
make api            # terminal A: http://localhost:8000
# In terminal B, from this repository:
WEB_AUTH_MODE=disabled API_INTERNAL_URL=http://127.0.0.1:8000 make web
```

`WEB_AUTH_MODE=disabled` works **only** in the Next development server. A production `next build/start` always requires a signed console session and server-side backend API key. The backend likewise rejects disabled authentication in production. Do not publish development ports on an untrusted network.

### CLI / curl

Set `AGENTLAB_API_URL=http://localhost:8000` and export `AGENTLAB_API_KEY` in your shell (in unauthenticated local development it may be absent); the CLI never writes credentials into platform records.

```bash
agentlab health
agentlab demo seed                # definitions only; no results
agentlab demo run --seed 42       # returns IDs of newly queued experiments
agentlab experiment status EXPERIMENT_ID
agentlab failure list --experiment EXPERIMENT_ID
agentlab failure replay FAILURE_ID
agentlab regression compare BASELINE_ID CANDIDATE_ID
agentlab report generate EXPERIMENT_ID --format pdf --out evidence.pdf
# Or: curl -H "X-API-Key: $AGENTLAB_API_KEY" http://localhost:8000/system/metrics
```

To build your own workload: `agentlab agent register --file agent.json`, `agentlab benchmark create --file benchmark.json`, then `agentlab benchmark run BENCHMARK_VERSION_ID --agent-version AGENT_VERSION_ID --runs 3 --seed 42`. The REST shapes are documented at `/openapi.json` and in [docs/API.md](docs/API.md). For a GUI-only path, use **Agents → Benchmarks → Run benchmark**.

## Verification

```bash
make test               # isolated backend unit/integration tests + frontend typecheck
make lint               # Ruff + frontend ESLint + TypeScript
npm --prefix apps/web run build
make test-e2e           # after starting API and web; install Playwright Chromium if needed
alembic check           # schema matches migrations (SQLite test URL)
```

The browser tests exercise registration, a custom suite/run/trace, 100 executed demo runs, regression, failure replay, robustness variants with N-run uncertainty, cost boundaries, an evidence PDF download and system health. Tests **do not** make live paid-provider calls. See [docs/TESTING.md](docs/TESTING.md) for the security/test matrix and actual verification boundaries.

## Research & operator documentation

- [Architecture, data flow, evidence schema and provenance](docs/ARCHITECTURE.md)
- [Metric definitions, denominators, uncertainty and comparison policy](docs/METHODOLOGY.md)
- [Provider adapters, credential refs, custom HTTP and pricing](docs/PROVIDERS.md)
- [Security model, threats and production hardening](docs/SECURITY.md)
- [Operations, queue recovery, monitoring, migrations and deployment](docs/OPERATIONS.md)
- [Synthetic demo, 50-case fixture and honest walkthrough](docs/DEMO.md)
- [API/CLI recipes](docs/API.md)
- [Test coverage and known limitations](docs/TESTING.md)

## Explicit boundaries

This is a functional research platform, **not** an assurance that any external model is safe or capable. External provider adapters have been exercised against synthetic HTTP fixtures, not paid/live models in this environment. Rule-based/reference evaluators measure only their stated rules; optional LLM judges are disabled unless configured and are not ground truth. The deterministic mock reads fixture metadata, not natural language. External replays may only be partial or non-deterministic. Inference cost excludes tool/provider extras and judge fees; no assumed price or token count is supplied. Operational DB counts are not Redis broker depth; API latency is available in request logs, not aggregated across replicas by this app. The access-key console is a **single-workspace gate, not multi-user SSO/RBAC**. For regulated/multi-tenant use, add identity, policy, tenant isolation, retention controls, encryption and independent penetration/deployment testing.
