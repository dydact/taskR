from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class AssignmentStatus(str, enum.Enum):
    """Lifecycle states for dedicated agent reservations."""

    RESERVED = "reserved"
    ACTIVE = "active"
    RELEASED = "released"
    PENDING = "pending"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AssignmentPriority(str, enum.Enum):
    """Priority tiers that upstream schedulers may assign."""

    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class CapabilitySnapshot(BaseModel):
    """Point-in-time resource view for an Exo node."""

    model_config = ConfigDict(extra="allow")

    cpu: str | None = None
    cpu_arch: str | None = None
    memory_gb: float | None = Field(default=None, ge=0)
    gpu: str | None = None
    gpu_memory_gb: float | None = Field(default=None, ge=0)
    tee: str | None = None
    zones: list[str] = Field(default_factory=list)
    polaris_pool: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ModelDescriptor(BaseModel):
    """Agent model metadata necessary for scheduling decisions."""

    model_config = ConfigDict(extra="allow")

    family: str
    size: str
    provider: str | None = None
    tokenizer: str | None = None
    revision: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PromptRevision(BaseModel):
    """A logged change to the agent's prompt strategy."""

    model_config = ConfigDict(extra="allow")

    role: Literal["system", "user", "assistant", "tool"]
    content: str
    created_at: datetime | None = None
    author: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PromptProfile(BaseModel):
    """Snapshot of the prompt configuration at reservation time."""

    model_config = ConfigDict(extra="allow")

    initial_prompt: str
    adaptation_method: str | None = None
    last_updated: datetime | None = None
    notes: str | None = None
    revisions: list[PromptRevision] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssignmentPolicy(BaseModel):
    """Reservation traits that inform schedulers."""

    model_config = ConfigDict(extra="allow")

    preemption: Literal["never", "coop", "force"] = "never"
    max_idle_seconds: int | None = Field(default=None, ge=0)
    tee_required: bool = True
    allow_spot_failover: bool = False
    allowed_pools: list[str] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PolarisObligation(BaseModel):
    """Polaris pool/zone obligations tied to the assignment."""

    model_config = ConfigDict(extra="allow")

    obligation_id: str
    kind: str
    status: str
    due_at: datetime | None = None
    pool: str | None = None
    zones: list[str] = Field(default_factory=list)
    weight: float | None = Field(default=None, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


class OverlayIdentity(BaseModel):
    """Overlay credentials issued to the dedicated node."""

    model_config = ConfigDict(extra="allow")

    overlay_id: str | None = None
    overlay_type: str | None = None
    label: str | None = None
    certificate_fingerprint: str | None = None
    issued_at: datetime | None = None
    expires_at: datetime | None = None
    harbor_urls: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AssignmentPayload(BaseModel):
    """
    Canonical assignment payload shared across TaskR, Exo, DeptX, and Flow.

    This shape is used for ingestion and eventing and is intentionally tolerant
    of extra fields so each service can round-trip its own metadata during the
    transition.
    """

    model_config = ConfigDict(extra="allow")

    assignment_id: str
    tenant_id: str
    agent_id: str | None = None
    department_id: str | None = None
    agent_slug: str
    agent_version: str | None = None
    status: AssignmentStatus = AssignmentStatus.RESERVED
    priority: AssignmentPriority = AssignmentPriority.NORMAL
    service_owner: str | None = None
    node_id: str | None = None
    overlay: OverlayIdentity | None = None
    capabilities: CapabilitySnapshot | None = None
    model: ModelDescriptor | None = None
    prompt_profile: PromptProfile | None = None
    prompt_history: list[PromptRevision] = Field(default_factory=list)
    polaris_obligations: list[PolarisObligation] = Field(default_factory=list)
    policy: AssignmentPolicy | None = None
    feature_flags: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)
    expires_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssignmentEventType(str, enum.Enum):
    """Event types emitted for assignment timelines."""

    CREATED = "assignment.created"
    UPDATED = "assignment.updated"
    STATUS_CHANGED = "assignment.status_changed"
    AUDIT = "assignment.audit"
    PROMPT_APPENDED = "assignment.prompt_appended"
    OVERLAY_UPDATED = "assignment.overlay_updated"
    OBLIGATION_ADDED = "assignment.obligation_added"
    OBLIGATION_FULFILLED = "assignment.obligation_fulfilled"
    HEARTBEAT = "assignment.heartbeat"
    NODE_ATTACHED = "assignment.node_attached"
    NODE_DETACHED = "assignment.node_detached"
    CAPABILITIES_UPDATED = "assignment.capabilities_updated"
    MODEL_UPDATED = "assignment.model_updated"


class AssignmentEventPayload(BaseModel):
    """Canonical assignment event payload pushed through TaskR ingestion."""

    model_config = ConfigDict(extra="allow")

    event_id: str
    assignment_id: str
    tenant_id: str
    event_type: AssignmentEventType
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    source: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "AssignmentEventPayload",
    "AssignmentEventType",
    "AssignmentPayload",
    "AssignmentPolicy",
    "AssignmentPriority",
    "AssignmentStatus",
    "CapabilitySnapshot",
    "ModelDescriptor",
    "OverlayIdentity",
    "PolarisObligation",
    "PromptProfile",
    "PromptRevision",
]
