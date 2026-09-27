"""Immutable agent-version registration and content-addressed configurations."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.schemas import AgentIn, VersionIn
from agentlab.security import stable_hash, validate_no_secrets
from agentlab.tools import TOOL_SCHEMAS


def new_version(db: Session, agent: m.Agent, data: VersionIn) -> m.AgentVersion:
    if db.scalar(
        select(m.AgentVersion.id).where(
            m.AgentVersion.agent_id == agent.id, m.AgentVersion.version == data.version
        )
    ):
        raise ValueError("This agent version already exists; versions are immutable")
    unknown = set(data.tool_configuration) - set(TOOL_SCHEMAS)
    if unknown:
        raise ValueError(
            f"Only allowlisted sandboxed built-in tools are allowed: {sorted(unknown)}"
        )
    config = data.model_dump()
    validate_no_secrets(config["configuration"])
    version = m.AgentVersion(
        agent_id=agent.id,
        version=data.version,
        model=data.model,
        model_revision=data.model_revision,
        prompt_template=data.system_prompt,
        system_prompt_hash=stable_hash(data.system_prompt),
        tool_configuration=data.tool_configuration,
        configuration=data.configuration,
        environment_metadata=data.environment_metadata,
        temperature=data.temperature,
        max_tokens=data.max_tokens,
        configuration_hash=stable_hash(
            {
                **config,
                "provider": agent.provider,
                "tool_definitions": {key: TOOL_SCHEMAS[key] for key in data.tool_configuration},
            }
        ),
    )
    db.add(version)
    db.flush()
    agent.updated_at = m.now()
    return version


def new_agent(db: Session, data: AgentIn, is_demo: bool = False) -> m.Agent:
    if db.scalar(select(m.Agent.id).where(m.Agent.name == data.name)):
        raise ValueError("Agent name already registered")
    agent = m.Agent(
        name=data.name,
        description=data.description,
        provider=data.provider,
        is_demo=is_demo or data.provider == "mock",
    )
    db.add(agent)
    db.flush()
    new_version(db, agent, data.version)
    return agent
