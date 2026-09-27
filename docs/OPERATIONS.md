# Deployment, operations and recovery

## Environment variables

Start from `.env.example`, inject production secrets through an external secret manager, and keep `.env` local and Git-ignored. The most consequential settings are:

| Variable | Purpose |
| --- | --- |
| `AGENTLAB_ENV` | `development`/`test`/`production`; production enforces authenticated PostgreSQL + Celery/Redis. |
| `AGENTLAB_DATABASE_URL`, `AGENTLAB_REDIS_URL` | SQLAlchemy URL and Redis broker/rate-limit connection. Compose builds the PostgreSQL URL from `POSTGRES_PASSWORD` and service DNS. |
| `AGENTLAB_QUEUE_MODE` | `local-thread` only in dev/tests; `celery` for production. Celery worker concurrency is 4 in Compose. |
| `AGENTLAB_API_KEY`, optional `AGENTLAB_READONLY_API_KEY` | Separate admin and read-only backend keys; inject into CLI callers as needed. |
| `WEB_ACCESS_KEY`, `WEB_SESSION_SECRET`, `WEB_AUTH_MODE` | Shared browser console login and signed HTTP-only session; `disabled` usable only for a local Next dev build. |
| `BACKEND_API_KEY`, `API_INTERNAL_URL` | Web **server-only** BFF key and backend address; Compose sets the backend key equal to `AGENTLAB_API_KEY`. Do not use `NEXT_PUBLIC_`. |
| `GIT_COMMIT` | Actual deployed SHA included in experiment hashes/reports. Omitted ⇒ explicit `unknown`; do not fabricate a revision. |
| `AGENTLAB_DEMO_SEED` | Register fixture **definitions** at startup (idempotent, no scores). Production: opt in deliberately. |
| `AGENTLAB_MAX_REQUEST_BYTES`, `AGENTLAB_RATE_LIMIT_PER_MINUTE` | API guardrails; Redis-backed rate limit in Celery deployments. |
| `AGENTLAB_PROVIDER_TIMEOUT_SECONDS`, `AGENTLAB_TRACE_CAPTURE` | Provider timeout, trace capture `redacted` (default) or `metadata` for reduced payload. |
| Provider/Judge env vars | Documented in [PROVIDERS.md](PROVIDERS.md); external API fees are operator responsibility. |

Compose binds ports to `127.0.0.1` and starts PostgreSQL/Redis with persistent named volumes. For remote access, use an HTTPS reverse proxy on a trusted host (keep `Host`), supply operational monitoring/backup/secret management and explicit network policy. Docker Compose **was not executable in the current sandbox**; run `docker compose config`, `docker compose up --build -d`, then smoke-test on your own host before production use.

## Database migrations and backup

`alembic upgrade head` runs before API startup in Compose. Local: run it explicitly against your configured `AGENTLAB_DATABASE_URL`; never rely on `Base.metadata.create_all()` outside isolated tests. `alembic check` compares ORM metadata to the applied head. Make a PostgreSQL backup (including schema/version and data) **before** migrating; test restore into a separate database and keep Redis broker durable. `docker compose down` keeps volumes; `down -v` destroys local database and queue state.

Historical agent versions, benchmark versions, completed runs, metrics, comparisons, replays and frozen reports have no API update/delete path. Operator DB writes can still alter history; use restricted credentials, backups and database audit appropriate to your environment. SQLite is useful to reproduce tests but unsuitable for production concurrency or the shared worker topology.

## Asynchronous queue controls

- `POST /experiments/{id}/run`: creates a durable row for each task × run index and dispatches *after commit*. Repeated calls do not rerun completed work. If dispatch fails, the API returns a sanitized `503`; rows remain **QUEUED**.
- `POST /experiments/{id}/resume`: redelivers QUEUED jobs. Compare-and-swap claim prevents executing a completed run twice after broker redelivery.
- `POST /experiments/{id}/resume?recover_stale=true&stale_after_seconds=600`: operator-only, resets **RUNNING** jobs older than at least 300 seconds **only if no trace exists**. It can duplicate an external call whose response never persisted; verify remote billing/side effects first.
- `POST /experiments/{id}/cancel`: cancels QUEUED work; in-flight calls cannot be forcibly interrupted, and the worker marks cancellation when it returns. Terminal results are not overwritten.
- Failures can be replayed into **new** one-task experiments. Missing broker capacity, absent provider credentials, rate limits and external timeouts must be investigated from error traces and worker logs, never replaced by optimistic scores.

## Health and monitoring

`GET /health` checks API/DB readiness. `GET /system/metrics` gives **database-derived** queued/running/ERROR run counts, a trailing-hour count of evaluated runs, run wall-clock P95 and the latency sample count. These counts include demo records if present. They are **not** direct Redis broker backlog or per-worker utilization; no broker depth is inferred from queued DB state. API middleware logs structured per-request latency, status, actor class, request ID and sanitized path; aggregate these logs across API replicas in an external collector. Worker logs include run/experiment IDs and measured duration. The Settings UI surfaces health, actual DB counters and metric definitions.

Failure modes: DB unavailable ⇒ `/health` 503; missing queue broker ⇒ committed QUEUED work and sanitized 503 on dispatch; Redis rate limit unavailable in production ⇒ fail-closed 503; missing provider secret/invalid response ⇒ ERROR run and observable error trace, not a guessed score. Configure alerts on sustained queue growth, ERROR counts, missing worker activity, request latency and failing DB/broker. Operate backups and log retention externally—this repo does not ship a full Prometheus/Grafana stack.

## Capacity and cost caveats

At most 2,000 runs per experiment and 200 paged runs per `/runs` request. The experiment detail initially materializes up to 1,000 runs and can load more. Per-task distribution and paired comparison operate on the bounded run set. Single local-thread worker is intentionally sequential; Celery concurrency in Compose is configurable. Provider HTTP calls have bounded retries; remote POST duplication and extra fees are possible. There is **no per-provider rate governor** beyond global API rate limiting, queue/worker concurrency and provider-side controls. External pricing, user billing, tool fees, caches and judge cost are not inferred.
