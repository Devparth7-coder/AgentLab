# Security model and production boundaries

AGENTLAB is designed for **safe evaluation of untrusted task text**. It is not a production multi-tenant identity/authorization system. Deploy with trusted operators and external controls. Never place private chain-of-thought, plaintext credentials or dangerous production actions in tasks.

## Enforced controls

- **Backend auth:** `X-API-Key` admin key for protected calls; an optional separate read-only key permits GET/HEAD/OPTIONS but no mutations. Production startup rejects missing/short admin keys, `auth_mode=disabled`, SQLite or local-thread execution. Sensitive endpoints require auth; `/health`, `/docs`, `/openapi.json`, `/redoc` are public documentation/health paths. Rate limits use Redis in Celery mode; production fails closed if Redis rate limiting is unavailable.
- **Browser auth/BFF:** Next.js checks an access key (minimum 32 characters) and issues an HTTP-only, signed, eight-hour SameSite=strict cookie. Web proxy injects the backend key **only server-side** and enforces same-host Origin for writes; browser JS never receives a provider/admin key. Cookies use `Secure` under HTTPS / non-local production hosts. The development auth bypass refuses to activate in a production Next build. Both web and API access keys must be independently random and rotated by operators. TLS/host forwarding is required for remote login. This is a **single shared console access key**, not per-person RBAC/SSO.
- **Request boundaries:** Pydantic schemas reject extra fields, credential-like fields/values and invalid env references; backend caps request bodies at 1 MiB and experiments at 2,000 runs. One user-supplied field cannot select an external provider URL: URLs come from administrator environment variables. Same-origin proxy restricts methods to GET/POST, validates paths, blocks redirects and returns only controlled response headers. HTTP provider redirects are disabled.
- **Tool sandbox:** `dataset.aggregate`, `dataset.lookup`, calculator (safe AST), mock search/unavailable and other built-in allowlisted fixtures only. A task/version tool intersection determines permission; unknown/dangerous tools are rejected. No shell, arbitrary user Python, file write, email send, payment, browser automation against external targets, production delete or real-world high-risk action is executed by robustness probes. `trusted_python` evaluates only installed, known plugin names; JSON schema remote refs are rejected.
- **Observable traces only:** Input hashes, allowed tool selection/arguments/results/status, output hashes/previews, error/retry signals and timing. No hidden reasoning is read, requested, stored or presented. Redaction removes common credential fields and bearer/key patterns; trace capture can be reduced with `AGENTLAB_TRACE_CAPTURE=metadata`. Like all pattern-based scanners this is **defense-in-depth, not a guarantee** for every secret format. Do not submit secrets as task inputs.
- **Audit:** Structured logs include request ID, actor class, path **without query**, method, status, timestamp and latency. Mutation audit rows include sanitized action IDs. API errors hide raw SQL uniqueness violations and broker connection strings; provider HTTP errors omit response bodies. Treat traces/reports as sensitive artifacts, and protect database, backups and log sinks accordingly.

## Recommended deployment

1. Run `AGENTLAB_ENV=production`, PostgreSQL + Redis/Celery, distinct high-entropy admin/web/session/DB secrets, demo seeding off unless consciously needed. Use a managed secret store / Docker secret injection and restrictive filesystem permissions; **never commit `.env`**, upload service credentials as benchmark data, or use `NEXT_PUBLIC_` for keys. Rotate credentials after exposure. Configure `GIT_COMMIT` from the actual deployed revision.
2. Keep Docker host port bindings loopback (Compose default), terminate TLS at a trusted reverse proxy, preserve the browser `Host` header, restrict who can reach the backend port, and consider IP allowlists. Production cookie security depends on HTTPS/browser host. Next.js login is a shared access gate; for teams, put SSO/RBAC at the gateway and add true tenant/user isolation before allowing multiple untrusted organizations.
3. Give worker only necessary credential env vars and network egress to trusted endpoints, and keep Ollama/private tools on a trusted network. Isolate PostgreSQL and Redis, use backups/encryption in transit and at rest, restricted DB roles, independent monitoring and an incident plan. Default Compose is a **development template**, not a certified hardened cluster.
4. Scrutinize any optional LLM judge: a prompt injection in untrusted content can affect a judge's answer even when instructions are separated; treat judge scores as fallible. Only allow trusted HTTPS judges and validated rubrics. External model/tool revisions and side effects are outside AGENTLAB's determinism guarantee.

## Threats and limitations

| Threat | Mitigation / remaining work |
| --- | --- |
| Credential accidentally submitted | Schema rejects recognized secret patterns and keys; server-only env refs. This is not a DLP guarantee for arbitrary formats—use a managed secret store and input policy. |
| Prompt injection | Evaluators treat task text as data; sandbox tool execution. No general guarantee that a remote agent/judge obeys instructions. |
| CSRF / BFF bypass | SameSite=strict cookie, Origin-host checks for writes, signed HTTP-only session. A shared key and bearer backend key do not replace SSO, MFA, anti-abuse policy or per-user audit. |
| SSRF / uploaded code | Provider URLs admin-only; proxy path allowlist and no redirects; no arbitrary scripts or external tool connectors. Administrators can still configure an unsafe endpoint, so restrict egress. |
| Replay duplication | Committed QUEUED jobs are recoverable; explicit stale recovery warns of potential duplicate external calls. Provider HTTP POST retries can also duplicate charges. |
| Data retention | Reports and traces retain redacted research evidence; automated retention/deletion, at-rest encryption, legal hold and tenant separation are **not implemented**. |

See [OPERATIONS.md](OPERATIONS.md) for queue recovery and [TESTING.md](TESTING.md) for verified controls.
