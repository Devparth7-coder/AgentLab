from agentlab import models as m
from agentlab.db import get_db
from agentlab.registry import new_agent, new_version
from agentlab.schemas import AgentIn, ListFilter, VersionIn
from agentlab.serializers import agent as serialize_agent
from agentlab.serializers import row
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab_api.common import audit, bad, found

router = APIRouter(prefix="/agents", tags=["Agents & immutable versions"])


@router.get("", summary="List registered agents")
def list_agents(limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    f = ListFilter(limit=limit, offset=offset)
    agents = db.scalars(
        select(m.Agent).order_by(m.Agent.created_at.desc()).offset(f.offset).limit(f.limit)
    ).all()
    return [serialize_agent(db, a) for a in agents]


@router.post("", status_code=201, summary="Register an agent with its initial immutable version")
def register(body: AgentIn, request: Request, db: Session = Depends(get_db)):
    try:
        obj = new_agent(db, body)
        audit(db, request, "agent.register", "agent", obj.id, {"provider": obj.provider})
        db.commit()
        return serialize_agent(db, obj)
    except ValueError as exc:
        db.rollback()
        bad(exc)


@router.get("/{agent_id}", summary="Get agent and version history (prompts omitted)")
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    return serialize_agent(db, found(db, m.Agent, agent_id))


@router.get("/{agent_id}/versions", summary="List immutable versions")
def versions(agent_id: str, db: Session = Depends(get_db)):
    found(db, m.Agent, agent_id)
    return [
        row(v)
        for v in db.scalars(
            select(m.AgentVersion)
            .where(m.AgentVersion.agent_id == agent_id)
            .order_by(m.AgentVersion.created_at.desc())
        ).all()
    ]


@router.post(
    "/{agent_id}/versions",
    status_code=201,
    summary="Create a new agent version; never edits an earlier version",
)
def create_version(agent_id: str, body: VersionIn, request: Request, db: Session = Depends(get_db)):
    try:
        v = new_version(db, found(db, m.Agent, agent_id), body)
        audit(db, request, "agent.version.create", "agent_version", v.id, {"version": v.version})
        db.commit()
        return row(v)
    except ValueError as exc:
        db.rollback()
        bad(exc)
