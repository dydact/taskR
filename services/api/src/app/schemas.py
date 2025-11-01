from __future__ import annotations

import uuid
from datetime import datetime, date
from typing import Any, ClassVar, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Space / Folder / List Schemas
# ---------------------------------------------------------------------------


class SpaceBase(BaseModel):
    slug: str
    name: str
    description: str | None = None
    color: str | None = None
    icon: str | None = None
    position: int = 0
    status: str = "active"
    metadata_json: dict = Field(default_factory=dict)

    _allowed_statuses: ClassVar[set[str]] = {"active", "archived"}

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class SpaceCreate(SpaceBase):
    pass


class SpaceUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    color: str | None = None
    icon: str | None = None
    position: int | None = None
    status: str | None = None
    metadata_json: dict | None = None

    _allowed_statuses: ClassVar[set[str]] = SpaceBase._allowed_statuses

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class SpaceRead(SpaceBase):
    model_config = ConfigDict(from_attributes=True)

    space_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class FolderBase(BaseModel):
    name: str
    description: str | None = None
    position: int = 0
    is_archived: bool = False


class FolderCreate(FolderBase):
    pass


class FolderUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    position: int | None = None
    is_archived: bool | None = None


class FolderRead(FolderBase):
    model_config = ConfigDict(from_attributes=True)

    folder_id: uuid.UUID
    tenant_id: uuid.UUID
    space_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ListBase(BaseModel):
    name: str
    description: str | None = None
    folder_id: uuid.UUID | None = None
    position: int = 0
    color: str | None = None
    default_view: str = "list"
    is_archived: bool = False
    metadata_json: dict = Field(default_factory=dict)

    _allowed_views: ClassVar[set[str]] = {"list", "board", "calendar", "timeline"}

    @field_validator("default_view")
    @classmethod
    def validate_default_view(cls, value: str) -> str:
        if value not in cls._allowed_views:
            allowed = ", ".join(sorted(cls._allowed_views))
            raise ValueError(f"default_view must be one of: {allowed}")
        return value


class ListCreate(ListBase):
    pass


class ListUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    folder_id: uuid.UUID | None = None
    position: int | None = None
    color: str | None = None
    default_view: str | None = None
    is_archived: bool | None = None
    metadata_json: dict | None = None

    _allowed_views: ClassVar[set[str]] = ListBase._allowed_views

    @field_validator("default_view")
    @classmethod
    def validate_default_view(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_views:
            allowed = ", ".join(sorted(cls._allowed_views))
            raise ValueError(f"default_view must be one of: {allowed}")
        return value


class ListRead(ListBase):
    model_config = ConfigDict(from_attributes=True)

    list_id: uuid.UUID
    tenant_id: uuid.UUID
    space_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ListStatusBase(BaseModel):
    name: str
    category: str = "active"
    color: str | None = None
    position: int = 0
    is_done: bool = False
    is_default: bool = False

    _allowed_categories: ClassVar[set[str]] = {"active", "backlog", "done"}

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str) -> str:
        if value not in cls._allowed_categories:
            allowed = ", ".join(sorted(cls._allowed_categories))
            raise ValueError(f"category must be one of: {allowed}")
        return value


class ListStatusCreate(ListStatusBase):
    pass


class ListStatusUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    color: str | None = None
    position: int | None = None
    is_done: bool | None = None
    is_default: bool | None = None

    _allowed_categories: ClassVar[set[str]] = ListStatusBase._allowed_categories

    @field_validator("category")
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_categories:
            allowed = ", ".join(sorted(cls._allowed_categories))
            raise ValueError(f"category must be one of: {allowed}")
        return value


class ListStatusRead(ListStatusBase):
    model_config = ConfigDict(from_attributes=True)

    status_id: uuid.UUID
    tenant_id: uuid.UUID
    list_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class HierarchyList(BaseModel):
    list: ListRead
    statuses: list[ListStatusRead]


class HierarchyFolder(BaseModel):
    folder: FolderRead
    lists: list[HierarchyList]


class HierarchySpace(BaseModel):
    space: SpaceRead
    folders: list[HierarchyFolder]
    root_lists: list[HierarchyList]


class NavigationList(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    list_id: uuid.UUID
    name: str
    folder_id: uuid.UUID | None = None
    color: str | None = None
    space_id: uuid.UUID


class NavigationFolder(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    folder_id: uuid.UUID
    name: str
    space_id: uuid.UUID
    lists: list[NavigationList] = Field(default_factory=list)


class NavigationSpace(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    space_id: uuid.UUID
    slug: str
    name: str
    color: str | None = None
    folders: list[NavigationFolder] = Field(default_factory=list)
    root_lists: list[NavigationList] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Comment Schemas
# ---------------------------------------------------------------------------


class CommentBase(BaseModel):
    body: str
    mentions: list[str] = Field(default_factory=list)


class CommentCreate(CommentBase):
    task_id: uuid.UUID
    author_id: uuid.UUID | None = None


class CommentRead(CommentBase):
    model_config = ConfigDict(from_attributes=True)

    comment_id: uuid.UUID
    tenant_id: uuid.UUID
    task_id: uuid.UUID
    author_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# User Preference Schemas
# ---------------------------------------------------------------------------


class UserPreferenceBase(BaseModel):
    value: Any


class UserPreferenceRead(UserPreferenceBase):
    model_config = ConfigDict(from_attributes=True)

    preference_id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: str
    key: str
    created_at: datetime
    updated_at: datetime


class UserPreferenceUpsert(UserPreferenceBase):
    pass


# ---------------------------------------------------------------------------
# Subtask Schemas
# ---------------------------------------------------------------------------


class SubtaskBase(BaseModel):
    title: str
    status: str = "pending"


class SubtaskCreate(SubtaskBase):
    pass


class SubtaskUpdate(BaseModel):
    title: str | None = None
    status: str | None = None


class SubtaskRead(SubtaskBase):
    model_config = ConfigDict(from_attributes=True)

    subtask_id: uuid.UUID
    tenant_id: uuid.UUID
    task_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Task Schemas
# ---------------------------------------------------------------------------


class TaskBase(BaseModel):
    title: str
    description: str | None = None
    status: str = "backlog"
    priority: str = "medium"
    due_at: datetime | None = None
    assignee_id: uuid.UUID | None = None
    created_by_id: uuid.UUID | None = None
    metadata_json: dict = Field(default_factory=dict)
    _allowed_priorities: ClassVar[set[str]] = {"low", "medium", "high", "urgent"}

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str) -> str:
        if value not in cls._allowed_priorities:
            allowed = ", ".join(sorted(cls._allowed_priorities))
            raise ValueError(f"priority must be one of: {allowed}")
        return value


class TaskCreate(TaskBase):
    list_id: uuid.UUID
    space_id: uuid.UUID | None = None
    custom_fields: list["TaskCustomFieldValueUpsert"] | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    due_at: datetime | None = None
    assignee_id: uuid.UUID | None = None
    metadata_json: dict | None = None
    list_id: uuid.UUID | None = None
    custom_fields: list["TaskCustomFieldValueUpsert"] | None = None

    _allowed_priorities: ClassVar[set[str]] = TaskBase._allowed_priorities

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_priorities:
            allowed = ", ".join(sorted(cls._allowed_priorities))
            raise ValueError(f"priority must be one of: {allowed}")
        return value


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    task_id: uuid.UUID
    tenant_id: uuid.UUID
    space_id: uuid.UUID | None
    list_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    custom_fields: list["TaskCustomFieldValueRead"] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Custom Field Schemas
# ---------------------------------------------------------------------------


class CustomFieldDefinitionBase(BaseModel):
    name: str
    slug: str
    field_type: str
    description: str | None = None
    config: dict = Field(default_factory=dict)
    is_required: bool = False
    is_active: bool = True
    position: int = 0

    _allowed_types: ClassVar[set[str]] = {
        "text",
        "number",
        "date",
        "boolean",
        "select",
        "multi_select",
    }

    @field_validator("field_type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in cls._allowed_types:
            allowed = ", ".join(sorted(cls._allowed_types))
            raise ValueError(f"field_type must be one of: {allowed}")
        return value

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        slug = value.strip().lower().replace(" ", "-")
        if not slug:
            raise ValueError("slug cannot be empty")
        return slug


class CustomFieldDefinitionCreate(CustomFieldDefinitionBase):
    list_id: uuid.UUID | None = None


class CustomFieldDefinitionUpdate(BaseModel):
    name: str | None = None
    slug: str | None = None
    description: str | None = None
    config: dict | None = None
    is_required: bool | None = None
    is_active: bool | None = None
    position: int | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is None:
            return value
        slug = value.strip().lower().replace(" ", "-")
        if not slug:
            raise ValueError("slug cannot be empty")
        return slug


class CustomFieldDefinitionRead(CustomFieldDefinitionBase):
    model_config = ConfigDict(from_attributes=True)

    field_id: uuid.UUID
    tenant_id: uuid.UUID
    space_id: uuid.UUID | None
    list_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class TaskCustomFieldValueUpsert(BaseModel):
    field_id: uuid.UUID
    value: Any


class TaskCustomFieldValueRead(BaseModel):
    field_id: uuid.UUID
    field_slug: str
    field_name: str
    field_type: str
    value: Any


# ---------------------------------------------------------------------------
# Document Schemas
# ---------------------------------------------------------------------------


class DocBase(BaseModel):
    title: str
    slug: str
    summary: str | None = None
    tags: list[str] = Field(default_factory=list)
    metadata_json: dict = Field(default_factory=dict)
    space_id: uuid.UUID | None = None
    list_id: uuid.UUID | None = None
    is_archived: bool = False

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str) -> str:
        slug = value.strip().lower().replace(" ", "-")
        if not slug:
            raise ValueError("slug cannot be empty")
        return slug


class DocCreate(DocBase):
    text: str | None = None
    payload_base64: str | None = None
    content_type: str | None = None
    filename: str | None = None
    created_by_id: uuid.UUID | None = None


class DocUpdate(BaseModel):
    title: str | None = None
    slug: str | None = None
    summary: str | None = None
    tags: list[str] | None = None
    metadata_json: dict | None = None
    space_id: uuid.UUID | None = None
    list_id: uuid.UUID | None = None
    is_archived: bool | None = None
    updated_by_id: uuid.UUID | None = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        if value is None:
            return value
        slug = value.strip().lower().replace(" ", "-")
        if not slug:
            raise ValueError("slug cannot be empty")
        return slug


class DocRead(DocBase):
    model_config = ConfigDict(from_attributes=True)

    doc_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None


class DocRevisionCreate(BaseModel):
    text: str | None = None
    payload_base64: str | None = None
    content_type: str | None = None
    filename: str | None = None
    title: str | None = None
    metadata_json: dict | None = None
    created_by_id: uuid.UUID | None = None


class DocRevisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    revision_id: uuid.UUID
    doc_id: uuid.UUID
    version: int
    title: str
    content: str
    plain_text: str | None
    metadata_json: dict
    created_by_id: uuid.UUID | None
    created_at: datetime


# ---------------------------------------------------------------------------
# Analytics Schemas
# ---------------------------------------------------------------------------


class StatusSummaryEntry(BaseModel):
    status: str
    count: int


class StatusSummary(BaseModel):
    list_id: uuid.UUID | None = None
    space_id: uuid.UUID
    entries: list[StatusSummaryEntry]


class WorkloadEntry(BaseModel):
    assignee_id: uuid.UUID | None
    assignee_email: str | None
    task_count: int
    total_minutes: int


class WorkloadSummary(BaseModel):
    space_id: uuid.UUID
    entries: list[WorkloadEntry]


class VelocityPoint(BaseModel):
    date: datetime
    completed: int


class VelocitySeries(BaseModel):
    space_id: uuid.UUID
    window_days: int
    points: list[VelocityPoint]


class BurnDownPoint(BaseModel):
    date: date
    planned: int
    completed: int
    remaining: int


class BurnDownSeries(BaseModel):
    space_id: uuid.UUID
    window_days: int
    total_scope: int
    points: list[BurnDownPoint]


class CycleEfficiencyMetrics(BaseModel):
    space_id: uuid.UUID
    window_days: int
    sample_size: int
    avg_cycle_hours: float
    avg_active_hours: float
    avg_wait_hours: float
    efficiency_percent: float


class ThroughputBucket(BaseModel):
    week_start: date
    completed: int


class ThroughputHistogram(BaseModel):
    space_id: uuid.UUID
    window_weeks: int
    buckets: list[ThroughputBucket]


class OverdueSummary(BaseModel):
    space_id: uuid.UUID
    total_overdue: int
    severe_overdue: int
    avg_days_overdue: float | None
    due_soon: int


class MetricCard(BaseModel):
    key: str
    label: str
    value: float
    delta: float | None = None
    trend: str | None = None


class AnalyticsSummary(BaseModel):
    space_id: uuid.UUID
    cards: list[MetricCard]


class DashboardWidgetPosition(BaseModel):
    x: int = 0
    y: int = 0
    w: int = 4
    h: int = 3


class DashboardWidget(BaseModel):
    widget_id: uuid.UUID
    widget_type: str
    title: str
    position: DashboardWidgetPosition = Field(default_factory=DashboardWidgetPosition)
    config: dict = Field(default_factory=dict)

    _allowed_types: ClassVar[set[str]] = {
        "status_summary",
        "workload",
        "velocity",
        "burn_down",
        "cycle_efficiency",
        "throughput",
        "overdue",
        "metric_cards",
        "preference_guardrail",
        "open_count",
    }

    @field_validator("widget_type")
    @classmethod
    def validate_widget_type(cls, value: str) -> str:
        if value not in cls._allowed_types:
            allowed = ", ".join(sorted(cls._allowed_types))
            raise ValueError(f"widget_type must be one of: {allowed}")
        return value


class DashboardUpdate(BaseModel):
    name: str | None = None
    layout: list[DashboardWidget] | None = None
    metadata_json: dict | None = None


class DashboardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dashboard_id: uuid.UUID
    tenant_id: uuid.UUID
    space_id: uuid.UUID
    slug: str
    name: str
    layout: list[DashboardWidget] = Field(default_factory=list)
    metadata_json: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# DeptX Schemas
# ---------------------------------------------------------------------------


class DeptxDepartmentBase(BaseModel):
    slug: str
    name: str
    description: str | None = None
    focus_area: str | None = None
    is_active: bool = True
    metadata_json: dict = Field(default_factory=dict)


class DeptxDepartmentCreate(DeptxDepartmentBase):
    pass


class DeptxDepartmentUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    focus_area: str | None = None
    is_active: bool | None = None
    metadata_json: dict | None = None


class DeptxDepartmentRead(DeptxDepartmentBase):
    model_config = ConfigDict(from_attributes=True)

    department_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class DeptxWorkflowBase(BaseModel):
    slug: str
    name: str
    description: str | None = None
    trigger_type: str | None = None
    n8n_workflow_id: uuid.UUID | None = None
    version: int = 1
    is_active: bool = True
    metadata_json: dict = Field(default_factory=dict)


class DeptxWorkflowCreate(DeptxWorkflowBase):
    department_id: uuid.UUID


class DeptxWorkflowUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    n8n_workflow_id: uuid.UUID | None = None
    version: int | None = None
    is_active: bool | None = None
    metadata_json: dict | None = None


class DeptxWorkflowRead(DeptxWorkflowBase):
    model_config = ConfigDict(from_attributes=True)

    workflow_id: uuid.UUID
    tenant_id: uuid.UUID
    department_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class DeptxAgentBase(BaseModel):
    name: str
    role: str | None = None
    status: str = "active"
    description: str | None = None
    skill_tags: list[str] = Field(default_factory=list)
    sandbox_profile: str | None = None
    config_json: dict = Field(default_factory=dict)
    is_active: bool = True

    _allowed_statuses: ClassVar[set[str]] = {"active", "paused", "disabled"}

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class DeptxAgentCreate(DeptxAgentBase):
    department_id: uuid.UUID


class DeptxAgentUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    status: str | None = None
    description: str | None = None
    skill_tags: list[str] | None = None
    sandbox_profile: str | None = None
    config_json: dict | None = None
    is_active: bool | None = None

    _allowed_statuses: ClassVar[set[str]] = DeptxAgentBase._allowed_statuses

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class DeptxAgentRead(DeptxAgentBase):
    model_config = ConfigDict(from_attributes=True)

    agent_id: uuid.UUID
    tenant_id: uuid.UUID
    department_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class DeptxExecutionBase(BaseModel):
    status: str = "queued"
    trigger_type: str | None = None
    trace_id: uuid.UUID | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    input_payload: dict = Field(default_factory=dict)
    output_payload: dict | None = None
    metrics_json: dict = Field(default_factory=dict)
    quality_score: float | None = None
    error_message: str | None = None

    _allowed_statuses: ClassVar[set[str]] = {"queued", "running", "completed", "failed", "cancelled"}

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class DeptxExecutionCreate(BaseModel):
    workflow_id: uuid.UUID
    department_id: uuid.UUID | None = None
    agent_id: uuid.UUID | None = None
    trigger_type: str | None = None
    input_payload: dict = Field(default_factory=dict)


class DeptxExecutionUpdate(DeptxExecutionBase):
    status: str | None = None

    @field_validator("status")
    @classmethod
    def validate_optional_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in DeptxExecutionBase._allowed_statuses:
            allowed = ", ".join(sorted(DeptxExecutionBase._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class DeptxExecutionRead(DeptxExecutionBase):
    model_config = ConfigDict(from_attributes=True)

    execution_id: uuid.UUID
    tenant_id: uuid.UUID
    department_id: uuid.UUID
    workflow_id: uuid.UUID
    agent_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


# ---------------------------------------------------------------------------
# Preference Rollout Schemas
# ---------------------------------------------------------------------------


class PreferenceModelBase(BaseModel):
    slug: str
    name: str
    base_type: str
    status: str = "inactive"
    description: str | None = None
    metadata_json: dict = Field(default_factory=dict)

    _allowed_statuses: ClassVar[set[str]] = {"inactive", "training", "active", "deprecated"}

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class PreferenceModelCreate(PreferenceModelBase):
    pass


class PreferenceModelUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    base_type: str | None = None
    status: str | None = None
    description: str | None = None
    metadata_json: dict | None = None

    _allowed_statuses: ClassVar[set[str]] = PreferenceModelBase._allowed_statuses

    @field_validator("status")
    @classmethod
    def validate_optional_status(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class PreferenceModelRead(PreferenceModelBase):
    model_config = ConfigDict(from_attributes=True)

    model_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PreferenceVariantBase(BaseModel):
    key: str
    name: str
    rollout_rate: float = 0
    status: str = "inactive"
    metrics_json: dict = Field(default_factory=dict)

    _allowed_statuses: ClassVar[set[str]] = {"inactive", "ramping", "active", "paused"}

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class PreferenceVariantCreate(PreferenceVariantBase):
    model_id: uuid.UUID


class PreferenceVariantUpdate(BaseModel):
    name: str | None = None
    rollout_rate: float | None = None
    status: str | None = None
    metrics_json: dict | None = None

    _allowed_statuses: ClassVar[set[str]] = PreferenceVariantBase._allowed_statuses

    @field_validator("status")
    @classmethod
    def validate_optional_status(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_statuses:
            allowed = ", ".join(sorted(cls._allowed_statuses))
            raise ValueError(f"status must be one of: {allowed}")
        return value


class PreferenceVariantRead(PreferenceVariantBase):
    model_config = ConfigDict(from_attributes=True)

    variant_id: uuid.UUID
    tenant_id: uuid.UUID
    model_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PreferenceRolloutBase(BaseModel):
    stage: str = "draft"
    target_rate: float = 0
    current_rate: float = 0
    safety_status: str = "pending"
    guardrail_metrics: dict = Field(default_factory=dict)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    metadata_json: dict = Field(default_factory=dict)

    _allowed_stages: ClassVar[set[str]] = {"draft", "ramp", "monitor", "completed"}
    _allowed_safety: ClassVar[set[str]] = {"pending", "healthy", "warning", "halted"}

    @field_validator("stage")
    @classmethod
    def validate_stage(cls, value: str) -> str:
        if value not in cls._allowed_stages:
            allowed = ", ".join(sorted(cls._allowed_stages))
            raise ValueError(f"stage must be one of: {allowed}")
        return value

    @field_validator("safety_status")
    @classmethod
    def validate_safety_status(cls, value: str) -> str:
        if value not in cls._allowed_safety:
            allowed = ", ".join(sorted(cls._allowed_safety))
            raise ValueError(f"safety_status must be one of: {allowed}")
        return value


class PreferenceRolloutCreate(PreferenceRolloutBase):
    model_id: uuid.UUID
    variant_id: uuid.UUID | None = None


class PreferenceRolloutUpdate(BaseModel):
    stage: str | None = None
    target_rate: float | None = None
    current_rate: float | None = None
    safety_status: str | None = None
    guardrail_metrics: dict | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    metadata_json: dict | None = None

    _allowed_stages: ClassVar[set[str]] = PreferenceRolloutBase._allowed_stages
    _allowed_safety: ClassVar[set[str]] = PreferenceRolloutBase._allowed_safety

    @field_validator("stage")
    @classmethod
    def validate_optional_stage(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_stages:
            allowed = ", ".join(sorted(cls._allowed_stages))
            raise ValueError(f"stage must be one of: {allowed}")
        return value

    @field_validator("safety_status")
    @classmethod
    def validate_optional_safety(cls, value: str | None) -> str | None:
        if value is not None and value not in cls._allowed_safety:
            allowed = ", ".join(sorted(cls._allowed_safety))
            raise ValueError(f"safety_status must be one of: {allowed}")
        return value


class PreferenceRolloutRead(PreferenceRolloutBase):
    model_config = ConfigDict(from_attributes=True)

    rollout_id: uuid.UUID
    tenant_id: uuid.UUID
    model_id: uuid.UUID
    variant_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class PreferenceFeedbackBase(BaseModel):
    model_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    source: str
    signal_type: str
    rating: int | None = None
    notes: str | None = None
    metadata_json: dict = Field(default_factory=dict)
    recorded_at: datetime | None = None


class PreferenceFeedbackCreate(PreferenceFeedbackBase):
    pass


class PreferenceFeedbackRead(PreferenceFeedbackBase):
    model_config = ConfigDict(from_attributes=True)

    feedback_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime


class PreferenceRolloutSummary(BaseModel):
    rollout_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    variant_key: str | None = None
    stage: str | None = None
    current_rate: float | None = None
    target_rate: float | None = None
    safety_status: str
    total_feedback: int
    positive: int
    negative: int
    negative_ratio: float
    guardrail_evaluated_at: datetime | None = None
    last_feedback_at: datetime | None = None


class PreferenceGuardrailSummary(BaseModel):
    model_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    total_feedback: int
    positive: int
    negative: int
    avg_rating: float | None
    negative_ratio: float
    last_feedback_at: datetime | None = None
    safety_status: str
    guardrail_evaluated_at: datetime | None = None
    rollouts: list[PreferenceRolloutSummary] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Flow Templates & Runs
# ---------------------------------------------------------------------------


class FlowTemplateBase(BaseModel):
    slug: str
    name: str
    category: str = "generic"
    description: str | None = None
    definition_json: dict = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    is_active: bool = True
    version: int = 1


class FlowTemplateCreate(FlowTemplateBase):
    pass


class FlowTemplateUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    description: str | None = None
    definition_json: dict | None = None
    tags: list[str] | None = None
    is_active: bool | None = None
    version: int | None = None


class FlowTemplateRead(FlowTemplateBase):
    model_config = ConfigDict(from_attributes=True)

    template_id: uuid.UUID
    tenant_id: uuid.UUID
    created_by_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class FlowRunBase(BaseModel):
    status: str = "pending"
    context_json: dict = Field(default_factory=dict)
    result_json: dict = Field(default_factory=dict)
    started_at: datetime | None = None
    completed_at: datetime | None = None


class FlowRunCreate(BaseModel):
    template_id: uuid.UUID
    context_json: dict = Field(default_factory=dict)


class FlowRunUpdate(BaseModel):
    status: str | None = None
    result_json: dict | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class FlowRunRead(FlowRunBase):
    model_config = ConfigDict(from_attributes=True)

    run_id: uuid.UUID
    tenant_id: uuid.UUID
    template_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class AutoPMSuggestionBase(BaseModel):
    title: str
    details: str | None = None
    status: str = "proposed"
    metadata_json: dict = Field(default_factory=dict)
    task_id: uuid.UUID | None = None


class AutoPMSuggestionCreate(AutoPMSuggestionBase):
    flow_run_id: uuid.UUID | None = None


class AutoPMSuggestionUpdate(BaseModel):
    status: str | None = None
    metadata_json: dict | None = None
    resolved_at: datetime | None = None


class AutoPMSuggestionRead(AutoPMSuggestionBase):
    model_config = ConfigDict(from_attributes=True)

    suggestion_id: uuid.UUID
    tenant_id: uuid.UUID
    flow_run_id: uuid.UUID | None
    created_at: datetime
    resolved_at: datetime | None


# ---------------------------------------------------------------------------
# SICA Sessions
# ---------------------------------------------------------------------------


class SicaSessionBase(BaseModel):
    subject_type: str
    subject_id: uuid.UUID
    status: str = "open"
    critique_json: dict = Field(default_factory=dict)
    resolution_json: dict = Field(default_factory=dict)


class SicaSessionCreate(SicaSessionBase):
    pass


class SicaSessionUpdate(BaseModel):
    status: str | None = None
    critique_json: dict | None = None
    resolution_json: dict | None = None


class SicaSessionRead(SicaSessionBase):
    model_config = ConfigDict(from_attributes=True)

    session_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class SicaNoteCreate(BaseModel):
    session_id: uuid.UUID
    content: str
    metadata_json: dict = Field(default_factory=dict)


class SicaNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    note_id: uuid.UUID
    tenant_id: uuid.UUID
    session_id: uuid.UUID
    author_id: uuid.UUID | None
    content: str
    metadata_json: dict
    created_at: datetime


# ---------------------------------------------------------------------------
# Calendar & Meetings
# ---------------------------------------------------------------------------


class CalendarSourceBase(BaseModel):
    slug: str
    name: str
    type: str
    config: dict = Field(default_factory=dict)
    is_active: bool = True


class CalendarSourceCreate(CalendarSourceBase):
    pass


class CalendarSourceUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    config: dict | None = None
    is_active: bool | None = None


class CalendarSourceRead(CalendarSourceBase):
    model_config = ConfigDict(from_attributes=True)

    source_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class CalendarEventCreate(BaseModel):
    source_id: uuid.UUID
    title: str
    start_at: datetime
    end_at: datetime
    location: str | None = None
    attendees: list[dict] = Field(default_factory=list)
    metadata_json: dict = Field(default_factory=dict)
    external_id: str | None = None


class CalendarEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    tenant_id: uuid.UUID
    source_id: uuid.UUID
    title: str
    start_at: datetime
    end_at: datetime
    location: str | None
    attendees: list[dict]
    metadata_json: dict
    created_at: datetime
    updated_at: datetime


class FreeBusyRequest(BaseModel):
    owner_ids: list[uuid.UUID] | None = None
    start_at: datetime
    end_at: datetime


class FreeBusyWindow(BaseModel):
    owner_id: uuid.UUID | None
    start_at: datetime
    end_at: datetime
    status: str


class MeetingNoteCreate(BaseModel):
    event_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None
    title: str
    content: str
    summary: str | None = None
    action_items: list[dict] = Field(default_factory=list)
    metadata_json: dict = Field(default_factory=dict)


class MeetingNoteRead(MeetingNoteCreate):
    model_config = ConfigDict(from_attributes=True)

    note_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    summary_meta: dict | None = None


class NegotiationMessageCreate(BaseModel):
    author: str
    channel: str = "email"
    body: str
    metadata: dict = Field(default_factory=dict)
    status: str | None = None


class NegotiationMessageRead(NegotiationMessageCreate):
    recorded_at: datetime


class SchedulingNegotiationBase(BaseModel):
    subject: str
    channel_type: str = "email"
    participants: list[str] = Field(default_factory=list)
    metadata_json: dict = Field(default_factory=dict)
    external_thread_id: str | None = None


class SchedulingNegotiationCreate(SchedulingNegotiationBase):
    initial_message: NegotiationMessageCreate | None = None


class SchedulingNegotiationRead(SchedulingNegotiationBase):
    model_config = ConfigDict(from_attributes=True)

    negotiation_id: uuid.UUID
    tenant_id: uuid.UUID
    status: str
    messages: list[NegotiationMessageRead] = Field(default_factory=list)
    last_message_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class SchedulingNegotiationList(SchedulingNegotiationRead):
    pass


class ApprovalQueueItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    approval_id: uuid.UUID
    tenant_id: uuid.UUID
    suggestion_id: uuid.UUID | None = None
    source: str
    status: str
    reason: str | None = None
    resolution_notes: str | None = None
    metadata_json: dict = Field(default_factory=dict)
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ApprovalDecisionRequest(BaseModel):
    action: Literal["approve", "reject"]
    notes: str | None = None
    metadata_json: dict = Field(default_factory=dict)


class ActionItemsToTasksRequest(BaseModel):
    list_id: uuid.UUID
    space_id: uuid.UUID | None = None


# ---------------------------------------------------------------------------
# Retention Policies
# ---------------------------------------------------------------------------


class RetentionPolicyBase(BaseModel):
    resource_type: str
    retention_days: int = Field(ge=0)
    metadata_json: dict = Field(default_factory=dict)


class RetentionPolicyCreate(RetentionPolicyBase):
    pass


class RetentionPolicyRead(RetentionPolicyBase):
    model_config = ConfigDict(from_attributes=True)

    policy_id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class GuardrailDrillRequest(BaseModel):
    rollout_id: uuid.UUID
    target_status: Literal["pending", "healthy", "warning", "halted"]
    negative_ratio: float = Field(ge=0.0, le=1.0, default=0.0)
    total_feedback: int = Field(default=10, ge=0)
    notes: str | None = None


class ScrAlertCreate(BaseModel):
    alert_id: uuid.UUID
    tenant_id: uuid.UUID
    taskr_task_id: uuid.UUID | None = None
    severity: str
    kind: str
    message: str
    source: str = "scrAIv"
    metadata: dict = Field(default_factory=dict)
    created_at: datetime | None = None


class ScrAlertRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    alert_id: uuid.UUID
    tenant_id: uuid.UUID
    taskr_task_id: uuid.UUID | None = None
    severity: str
    kind: str
    message: str
    source: str
    metadata_json: dict
    created_at: datetime
    updated_at: datetime
    acknowledged_at: datetime | None = None


class ScrAlertAckRequest(BaseModel):
    notes: str | None = None


# ---------------------------------------------------------------------------
# Subscription & Feature Toggles
# ---------------------------------------------------------------------------


class ClearinghouseCredentials(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    directory: Optional[str] = None


class ClearinghouseEnvelopeDefaults(BaseModel):
    sender_qualifier: Optional[str] = None
    sender_id: Optional[str] = None
    receiver_qualifier: Optional[str] = None
    receiver_id: Optional[str] = None
    control_prefix: Optional[str] = None


class ClearinghouseConfig(BaseModel):
    mode: Literal["claimmd_api", "sftp", "filedrop", "manual"] = "claimmd_api"
    host: Optional[str] = None
    account_key: Optional[str] = None
    credentials: Optional[ClearinghouseCredentials] = None
    envelope: Optional[ClearinghouseEnvelopeDefaults] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ClearinghouseConfigResponse(BaseModel):
    config: ClearinghouseConfig
    updated_at: Optional[datetime] = None


class SubscriptionUpdate(BaseModel):
    plan_slug: str
    status: str | None = None
    active_until: datetime | None = None
    metadata_json: dict | None = None


class SubscriptionRead(BaseModel):
    plan_slug: str
    status: str
    active_since: datetime
    active_until: datetime | None
    features: list[str] = Field(default_factory=list)


class FeatureOverrideUpdate(BaseModel):
    feature_code: str
    enabled: bool
    application: str = "taskr"
    expires_at: datetime | None = None
    metadata_json: dict | None = None


class FeatureOverrideRead(BaseModel):
    feature_code: str
    application: str
    enabled: bool
    expires_at: datetime | None = None
    metadata_json: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------


class NotificationChannelConfig(BaseModel):
    channel: Literal["slack", "discord", "sms"]
    enabled: bool = True
    events: list[str] = Field(default_factory=list)
    config: dict[str, Any] = Field(default_factory=dict)


class NotificationConfigPayload(BaseModel):
    channels: list[NotificationChannelConfig] = Field(default_factory=list)


class NotificationConfigResponse(NotificationConfigPayload):
    updated_at: datetime | None = None
