"""Redaction and input policy. Never serialize raw credentials, private reasoning or arbitrary code."""

import hashlib
import json
import re
from collections.abc import Mapping
from typing import Any

REDACT_KEYS = re.compile(
    r"(api[_-]?key|authorization|password|secret|access[_-]?token|private[_-]?key|cookie|credential)",
    re.I,
)
VALUE_SECRETS = re.compile(r"(?i)(bearer\s+\S+|sk-[a-zA-Z0-9_-]{12,}|AIza[a-zA-Z0-9_-]{20,})")
VALID_ENV_REF = re.compile(
    r"^(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|HF_TOKEN|AGENTLAB_PROVIDER_[A-Z0-9_]+)$"
)


def stable_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    ).hexdigest()


def redact(value: Any, depth: int = 0) -> Any:
    if depth > 12:
        return "[TRUNCATED]"
    if isinstance(value, Mapping):
        return {
            str(k)[:150]: "[REDACTED]"
            if REDACT_KEYS.search(str(k)) and k != "secret_ref"
            else redact(v, depth + 1)
            for k, v in list(value.items())[:120]
        }
    if isinstance(value, (list, tuple)):
        return [redact(v, depth + 1) for v in value[:120]]
    if isinstance(value, str):
        return VALUE_SECRETS.sub("[REDACTED]", value[:10000])
    return value


def validate_no_secrets(value: Any) -> None:
    """Reject known credential field names recursively, not merely redact after storage."""
    if isinstance(value, Mapping):
        for k, v in value.items():
            if REDACT_KEYS.search(str(k)) and k != "secret_ref":
                raise ValueError(f"Credential-like field '{k}' is not accepted; use secret_ref")
            if k == "secret_ref" and (not isinstance(v, str) or not VALID_ENV_REF.fullmatch(v)):
                raise ValueError("secret_ref must be an allowed environment variable name")
            validate_no_secrets(v)
    elif isinstance(value, list):
        for item in value:
            validate_no_secrets(item)
    elif isinstance(value, str) and VALUE_SECRETS.search(value):
        raise ValueError(
            "Credential-like value is not accepted; use a placeholder or environment reference"
        )
