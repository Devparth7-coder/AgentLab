"""Validated write contracts; unknown fields are rejected to avoid accidental secret storage."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from agentlab.security import validate_no_secrets

PROVIDERS = Literal["mock", "openai", "anthropic", "gemini", "ollama", "huggingface", "custom_http"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class VersionIn(StrictModel):
    version: str = Field(pattern=r"^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$")
    model: str = Field(min_length=1, max_length=160)
    model_revision: str | None = Field(default=None, max_length=160)
    system_prompt: str = Field(default="", max_length=16000)
    tool_configuration: list[str] = Field(default_factory=list, max_length=20)
    configuration: dict[str, Any] = Field(default_factory=dict)
    environment_metadata: dict[str, Any] = Field(default_factory=dict)
    temperature: float = Field(default=0, ge=0, le=2)
    max_tokens: int = Field(default=1024, ge=16, le=32768)

    @model_validator(mode="after")
    def safe_config(self):
        validate_no_secrets(self.configuration)
        validate_no_secrets(self.environment_metadata)
        validate_no_secrets(self.system_prompt)
        return self


class AgentIn(StrictModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=3000)
    provider: PROVIDERS
    version: VersionIn


class TaskIn(StrictModel):
    task_key: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9._-]+$")
    category: str = Field(default="General", max_length=60)
    input: str = Field(min_length=1, max_length=12000)
    expected_behavior: list[str] = Field(default_factory=list, max_length=20)
    constraints: list[str] = Field(default_factory=list, max_length=20)
    available_tools: list[str] = Field(default_factory=list, max_length=20)
    expected_output: Any = None
    evaluation_config: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def safe_data(self):
        validate_no_secrets(self.metadata)
        validate_no_secrets(self.evaluation_config)
        validate_no_secrets(self.input)
        validate_no_secrets(self.expected_output)
        return self


class BenchmarkIn(StrictModel):
    name: str = Field(min_length=2, max_length=140)
    description: str = Field(default="", max_length=3000)
    category: str = Field(default="General Agent", max_length=60)
    version: str = Field(default="1.0.0", pattern=r"^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$")
    evaluation_rules: dict[str, Any] = Field(default_factory=dict)
    tasks: list[TaskIn] = Field(min_length=1, max_length=2000)

    @model_validator(mode="after")
    def unique_keys(self):
        keys = [t.task_key for t in self.tasks]
        if len(set(keys)) != len(keys):
            raise ValueError("Task keys must be unique in a benchmark version")
        validate_no_secrets(self.evaluation_rules)
        return self


class AddTaskIn(TaskIn):
    benchmark_version_id: str = Field(min_length=32, max_length=32)
    new_version: str = Field(pattern=r"^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$")


class ExperimentIn(StrictModel):
    name: str = Field(min_length=2, max_length=160)
    agent_version_id: str = Field(min_length=32, max_length=32)
    benchmark_version_id: str = Field(min_length=32, max_length=32)
    seed: int = Field(default=0, ge=0, le=2147483647)
    runs_per_task: int = Field(default=1, ge=1, le=20)
    task_ids: list[str] = Field(default_factory=list, max_length=2000)
    configuration: dict[str, Any] = Field(default_factory=dict)
    environment: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def safe_data(self):
        validate_no_secrets(self.configuration)
        validate_no_secrets(self.environment)
        return self


class RobustnessIn(StrictModel):
    benchmark_version_id: str
    transformations: list[
        Literal[
            "whitespace", "wording", "irrelevant", "noise", "conflict", "malformed", "tool_failure"
        ]
    ] = Field(min_length=1, max_length=7)
    seed: int = Field(default=42, ge=0)
    limit: int = Field(default=50, ge=1, le=200)


class CompareIn(StrictModel):
    baseline_experiment_id: str
    candidate_experiment_id: str


class ReportIn(StrictModel):
    experiment_id: str


class DemoRunIn(StrictModel):
    seed: int = Field(default=42, ge=0)


class ListFilter(StrictModel):
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
