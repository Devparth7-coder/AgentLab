"""API response helpers and append-only mutation auditing."""

import logging

from agentlab import models as m
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session


def bad(exc: Exception, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail=str(exc)) from exc


def found(db: Session, model, entity_id: str):
    value = db.get(model, entity_id)
    if value is None:
        raise HTTPException(status_code=404, detail=f"{model.__name__} not found")
    return value


def audit(
    db: Session,
    request: Request,
    action: str,
    entity_type: str,
    entity_id: str | None,
    details: dict | None = None,
):
    db.add(
        m.AuditLog(
            actor=getattr(request.state, "actor", "unknown"),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            request_id=getattr(request.state, "request_id", None),
            details=details or {},
        )
    )


def dispatch_or_unavailable(experiment_id: str) -> int:
    """A committed QUEUED run remains durable if the broker is unavailable."""
    from agentlab.executions import dispatch_experiment

    try:
        return dispatch_experiment(experiment_id)
    except Exception as exc:
        # Never return or log a broker connection string; it can contain credentials.
        logging.getLogger("agentlab.dispatch").warning(
            "dispatch_unavailable experiment_id=%s error_type=%s",
            experiment_id,
            type(exc).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail=f"Worker dispatch unavailable. Runs remain queued; retry /experiments/{experiment_id}/resume after restoring the broker.",
        ) from None
