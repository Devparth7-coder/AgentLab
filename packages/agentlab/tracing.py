"""Observable evidence only: no hidden reasoning, no model scratchpads."""

from dataclasses import dataclass
from time import perf_counter
from typing import Any

from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.security import redact
from agentlab.tools import execute


@dataclass
class ToolOutcome:
    ok: bool
    value: dict
    error: str | None = None


class TraceRecorder:
    def __init__(
        self,
        allowed_tools: list[str],
        capture: str = "redacted",
        fail_first_tool: str | None = None,
        fault_policy: str | None = None,
    ):
        self.start = perf_counter()
        self.allowed_tools = allowed_tools
        self.capture = capture
        self.fail_first_tool = fail_first_tool
        self.fault_policy = fault_policy
        self.fault_consumed = False
        self.fault_attempts = 0
        self.events: list[dict] = []
        self.calls: list[dict] = []

    def safe(self, value: Any) -> Any:
        if self.capture == "metadata":
            if isinstance(value, dict):
                return {"keys": list(value)[:40], "type": "object"}
            return {"type": type(value).__name__}
        return redact(value)

    def event(
        self,
        event_type: str,
        *,
        status: str = "INFO",
        tool_name: str | None = None,
        input_metadata: dict | None = None,
        output_metadata: dict | None = None,
        duration_ms: float | None = None,
        error: str | None = None,
    ) -> int:
        sequence = len(self.events)
        self.events.append(
            {
                "sequence": sequence,
                "timestamp": m.now(),
                "offset_ms": round((perf_counter() - self.start) * 1000, 3),
                "duration_ms": round(duration_ms, 3) if duration_ms is not None else None,
                "event_type": event_type,
                "status": status,
                "tool_name": tool_name,
                "input_metadata": self.safe(input_metadata or {}),
                "output_metadata": self.safe(output_metadata or {}),
                "error": redact(error) if error else None,
            }
        )
        return sequence

    def call_tool(self, name: str, arguments: dict) -> ToolOutcome:
        seq = self.event("TOOL_CALL", tool_name=name, input_metadata={"arguments": arguments})
        start = perf_counter()
        try:
            if name == self.fail_first_tool:
                self.fault_attempts += 1
                if (
                    self.fault_policy == "tool_unavailable"
                    or (self.fault_policy == "repeated_failures" and self.fault_attempts <= 2)
                    or (self.fault_policy == "tool_failure" and not self.fault_consumed)
                ):
                    self.fault_consumed = True
                    raise RuntimeError("Injected sandbox tool failure (robustness test)")
            result = execute(name, arguments, self.allowed_tools)
            if (
                name == self.fail_first_tool
                and self.fault_policy == "invalid_tool_response"
                and not self.fault_consumed
            ):
                self.fault_consumed = True
                result = {
                    "malformed_fixture": True
                }  # deliberate invalid shape, not an external tool result
            status, error = "SUCCESS", None
        except (ValueError, RuntimeError, ZeroDivisionError) as exc:
            result = {"error": str(exc)}
            status, error = "ERROR", str(exc)
        duration = (perf_counter() - start) * 1000
        self.event(
            "TOOL_RESPONSE" if status == "SUCCESS" else "TOOL_ERROR",
            status=status,
            tool_name=name,
            duration_ms=duration,
            output_metadata={"result": result},
            error=error,
        )
        self.calls.append(
            {
                "event_sequence": seq,
                "tool_name": name,
                "arguments": self.safe(arguments),
                "raw_arguments": arguments,
                "status": status,
                "duration_ms": round(duration, 3),
                "result": self.safe(result),
                "error": redact(error) if error else None,
            }
        )
        return ToolOutcome(ok=status == "SUCCESS", value=result, error=error)

    def persist(self, db: Session, run_id: str, experiment_id: str, task: m.Task) -> m.Trace:
        trace = m.Trace(
            run_id=run_id,
            experiment_id=experiment_id,
            task_id=task.id,
            duration_ms=round((perf_counter() - self.start) * 1000, 3),
        )
        db.add(trace)
        db.flush()
        for e in self.events:
            db.add(m.TraceEvent(trace_id=trace.id, **e))
        rules = next(
            (
                r
                for r in task.evaluation_config.get("evaluators", [])
                if r.get("type") == "tool_rules"
            ),
            None,
        )
        for c in self.calls:
            required = rules.get("required_tools", []) if rules else []
            argument_rules = (
                rules.get("argument_equals", {}).get(c["tool_name"], {}) if rules else {}
            )
            selection_valid = (
                (
                    c["tool_name"] in required
                    and c["tool_name"] not in rules.get("forbidden_tools", [])
                )
                if rules
                else None
            )
            argument_valid = (
                (
                    all(c["raw_arguments"].get(k) == v for k, v in argument_rules.items())
                    and c["status"] == "SUCCESS"
                )
                if rules
                else None
            )
            tool_call = m.ToolCall(
                trace_id=trace.id,
                run_id=run_id,
                event_sequence=c["event_sequence"],
                tool_name=c["tool_name"],
                arguments=c["arguments"] if isinstance(c["arguments"], dict) else {},
                status=c["status"],
                duration_ms=c["duration_ms"],
                selection_valid=selection_valid,
                argument_valid=argument_valid,
            )
            db.add(tool_call)
            db.flush()
            db.add(
                m.ToolResult(
                    tool_call_id=tool_call.id,
                    output=c["result"] if isinstance(c["result"], dict) else {},
                    error=c["error"],
                )
            )
        db.flush()
        return trace
