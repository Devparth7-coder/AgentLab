"""Allowlisted, side-effect-free mock tools. No uploaded scripts or external actions."""

import ast
import operator

from jsonschema import ValidationError, validate

from agentlab.demo_fixtures import MONTHS, REGIONS, revenue, rows

TOOL_SCHEMAS = {
    "dataset.aggregate": {
        "description": "Sum revenue in the versioned demonstration dataset for a region and optionally a month.",
        "parameters": {
            "type": "object",
            "properties": {
                "region": {"type": "string", "enum": list(REGIONS)},
                "month": {"type": "string", "enum": list(MONTHS)},
            },
            "required": ["region"],
            "additionalProperties": False,
        },
    },
    "dataset.lookup": {
        "description": "Read matching records from the demonstration dataset (read-only).",
        "parameters": {
            "type": "object",
            "properties": {
                "region": {"type": "string", "enum": list(REGIONS)},
                "month": {"type": "string", "enum": list(MONTHS)},
            },
            "required": ["region"],
            "additionalProperties": False,
        },
    },
    "calculator": {
        "description": "Evaluate arithmetic safely (no Python execution).",
        "parameters": {
            "type": "object",
            "properties": {"expression": {"type": "string", "maxLength": 120}},
            "required": ["expression"],
            "additionalProperties": False,
        },
    },
    "mock.search": {
        "description": "Search static, non-network demo documentation.",
        "parameters": {
            "type": "object",
            "properties": {"query": {"type": "string", "maxLength": 120}},
            "required": ["query"],
            "additionalProperties": False,
        },
    },
    "mock.unavailable": {
        "description": "Simulated unavailable tool for recovery testing.",
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
    },
}

_ALLOWED_BINOPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
}


def _arithmetic(expr: str) -> float:
    if len(expr) > 120:
        raise ValueError("Expression too long")

    def walk(node, depth=0):
        if depth > 12:
            raise ValueError("Expression too deep")
        if (
            isinstance(node, ast.Constant)
            and type(node.value) in (int, float)
            and abs(node.value) <= 1e9
        ):
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -walk(node.operand, depth + 1)
        if isinstance(node, ast.BinOp) and type(node.op) in _ALLOWED_BINOPS:
            result = _ALLOWED_BINOPS[type(node.op)](
                walk(node.left, depth + 1), walk(node.right, depth + 1)
            )
            if abs(result) > 1e12:
                raise ValueError("Result exceeds safe bounds")
            return result
        raise ValueError("Only numbers and +, -, *, / are permitted")

    return walk(ast.parse(expr, mode="eval").body)


def execute(name: str, arguments: dict, allowed: list[str]) -> dict:
    if name not in TOOL_SCHEMAS or name not in allowed:
        raise ValueError("Tool is not allowlisted for this task and agent version")
    if not isinstance(arguments, dict):
        raise ValueError("Tool arguments must be an object")
    try:
        validate(arguments, TOOL_SCHEMAS[name]["parameters"])
    except ValidationError as exc:
        raise ValueError(f"Invalid arguments: {exc.message}") from exc
    if name == "dataset.aggregate":
        matches = [
            r
            for r in rows()
            if r["region"] == arguments["region"]
            and ("month" not in arguments or r["month"] == arguments["month"])
        ]
        return {
            "total_revenue": revenue(arguments["region"], arguments.get("month")),
            "row_count": len(matches),
        }
    if name == "dataset.lookup":
        return {
            "rows": [
                r
                for r in rows()
                if r["region"] == arguments["region"]
                and ("month" not in arguments or r["month"] == arguments["month"])
            ]
        }
    if name == "calculator":
        return {"result": _arithmetic(arguments["expression"])}
    if name == "mock.search":
        docs = [
            {
                "id": "fixture",
                "title": "Demo dataset",
                "excerpt": "Revenue is synthetic and partitioned by region and month.",
            }
        ]
        q = arguments["query"].lower()
        return {"results": [d for d in docs if q in (d["title"] + " " + d["excerpt"]).lower()]}
    if name == "mock.unavailable":
        raise RuntimeError("Simulated tool unavailability; no external system was contacted")
    raise ValueError("Unsupported tool")
