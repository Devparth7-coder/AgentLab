# Verification plan, scope and limitations

## Commands

```bash
python -m pip install -e '.[dev]'
npm --prefix apps/web ci
pytest -q                                  # isolated SQLite backend fixtures
ruff check packages apps/api tests
ruff format --check packages apps/api tests
alembic check                              # use migrated SQLite URL or a test DB
npm --prefix apps/web run lint              # ESLint/Next rules
npm --prefix apps/web run typecheck         # TypeScript
npm --prefix apps/web run build             # production Next.js build
# Start the API and website (see README); install Chromium once with:
npx --prefix apps/web playwright install chromium
WEB_ACCESS_KEY="$WEB_ACCESS_KEY" npm --prefix apps/web run test:e2e
```

In local dev with `WEB_AUTH_MODE=disabled` the E2E suite does not require a web access key; with the production-auth web build, set the test runner's `WEB_ACCESS_KEY` to the server's **test-only** key (never commit a real key). The E2E suite uses `http://127.0.0.1:3000` by default; set `AGENTLAB_WEB_URL` if different. It **creates real test runs/records** in the chosen backend DB—use a disposable or dedicated test instance, not a shared production workspace.

## Exercised workflows

- **Backend core:** immutable versions/tasks and hashes; credential rejection and redaction; safe AST calculator and tool allowlist; rule/schema/tool-argument evaluation; no score for unmeasured references; measured cost math and null on missing usage; Wilson/percentile math.
- **Provider fixtures:** all six remote adapters use synthetic HTTP responses, verify usage provenance and missing-usage null; custom secret reference and HTTPS validation; bounded HTTP retry and sanitized non-retryable error. These tests do **not** call or certify live provider endpoints.
- **API integration:** register agent and benchmark; create and asynchronously execute an N-run experiment; paginated runs, per-task Wilson/variance, actual queue counts, latency samples; inspect failure and trace; generate Markdown/PDF report; reject changes to completed experiments. Separate 50-case DEMO test checks executed baseline/candidate, paired regression, reproducible mock replay, robust variant evaluation and report snapshot. Broker-dispatch failure test verifies sanitized 503, queued persistence and `/resume` recovery. API auth/read-only and secret rejection tests are included.
- **Browser E2E:** register agent, create suite, run/inspect trace; execute the 50-case pair, compare versions, inspect failure, replay, inspect arguments, generate JSON report; generate a seeded robustness suite, run two repetitions per task, view per-task uncertainty and cost boundaries, download a PDF, check operations and verify the BFF denies unauthenticated reads/cross-origin mutations. These use Playwright Chromium against the real Next.js/SQLAlchemy API stack in local test mode.
- **Migration/config:** `alembic check` confirms metadata matches the existing migration for SQLite; Next.js production build and lint/typecheck are verified.

## What remains to verify on your infrastructure

This sandbox has **no Docker daemon**, PostgreSQL service, Redis service, live paid provider credentials, TLS edge, multi-replica load or production secret store. The supplied Compose stack and Celery/PostgreSQL path should be integration-tested on an operator-controlled host (`docker compose config`, start, migrate, seed, run, restart worker, resume, export PDF, restore DB backup). API request timing is emitted to structured logs but not aggregated in-process; Redis broker depth is not measured by `/system/metrics`. External HTTP schemas may evolve and provider output is not deterministically replayable. Browser accessibility is improved with labeled experiment/robustness controls, but automated WCAG audits across the entire UI are not included. Operational alerts, SSO/RBAC, tenancy, data-retention policy and penetration testing remain deployment work.

Never interpret fixture pass rates as real-model performance. Never claim a numerical effect when the metric is null, sample is absent, or benchmark conditions are incomparable.

## Reproduce the action walkthrough

The silent, captioned action video is a **real browser recording**, not rendered example results. Use a disposable database and **test-only** web access key. Migrate that database, start the API with `AGENTLAB_DEMO_SEED=true` and a production-built Next website with its BFF pointing at that API; see README for the start commands. A clean, seeded database begins with **no metrics**. With Chromium installed:

```bash
AGENTLAB_WEB_URL=http://127.0.0.1:3001 WEB_ACCESS_KEY="$TEST_WEB_ACCESS_KEY" \
  node apps/web/scripts/record-action.mjs
# Requires Pillow and an ffmpeg build with H.264/libass support.
FFMPEG_BIN=/path/to/ffmpeg python apps/web/scripts/render-action-video.py
```

The recorder verifies the mock fixture counts, actual 12-run per-task distribution, frozen report provenance and `%PDF-` export **before** making the footage available. It writes a raw WebM, chapter timings, screenshots and frozen PDF under `.data/action-capture/` (Git-ignored); the renderer writes a captioned H.264 MP4 and optional WebVTT to the workspace parent. The visible UI contains DEMO labels throughout. The capture scripts do not inject scores, provider usage, model claims, or access credentials into frames. Record only disposable fixture workspaces, not private production data.
