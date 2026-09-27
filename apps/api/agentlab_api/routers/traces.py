from agentlab import models as m
from agentlab.db import get_db
from agentlab.schemas import ListFilter
from agentlab.serializers import trace as serialize_trace
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from agentlab_api.common import found

router = APIRouter(prefix="/traces", tags=["Traces & observable tool calls"])


@router.get("", summary="Search and filter execution timelines")
def list_traces(
    experiment_id: str | None = None,
    task_id: str | None = None,
    event_type: str | None = None,
    search: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    f = ListFilter(limit=limit, offset=offset)
    q = select(m.Trace)
    if experiment_id:
        q = q.where(m.Trace.experiment_id == experiment_id)
    if task_id:
        q = q.where(m.Trace.task_id == task_id)
    if event_type:
        q = q.where(
            m.Trace.id.in_(
                select(m.TraceEvent.trace_id).where(m.TraceEvent.event_type == event_type)
            )
        )
    if search:
        term = "%" + search[:100].replace("%", "\\%").replace("_", "\\_") + "%"
        q = q.where(
            or_(
                m.Trace.task_id.in_(select(m.Task.id).where(m.Task.task_key.ilike(term))),
                m.Trace.id.in_(
                    select(m.TraceEvent.trace_id).where(m.TraceEvent.tool_name.ilike(term))
                ),
            )
        )
    return [
        serialize_trace(db, t)
        for t in db.scalars(
            q.order_by(m.Trace.created_at.desc()).offset(f.offset).limit(f.limit)
        ).all()
    ]


@router.get(
    "/{trace_id}", summary="Timeline with redacted event metadata, latency and tool results"
)
def trace(trace_id: str, db: Session = Depends(get_db)):
    return serialize_trace(db, found(db, m.Trace, trace_id), details=True)
