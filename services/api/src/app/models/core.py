from __future__ import annotations

import uuid
from datetime import UTC, datetime, date

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Tenant(TimestampMixin, Base):
    __tablename__ = "tr_tenant"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active")
    global_org_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    org_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)


class User(TimestampMixin, Base):
    __tablename__ = "tr_user"
    __table_args__ = (
        Index("ix_tr_user_tenant_email", "tenant_id", "email", unique=True),
        Index("ix_tr_user_global", "global_user_id"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    given_name: Mapped[str] = mapped_column(String(128), default="")
    family_name: Mapped[str] = mapped_column(String(128), default="")
    status: Mapped[str] = mapped_column(String(32), default="active")
    roles: Mapped[list[str]] = mapped_column(JSONB, default=list)
    global_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    identity_provider: Mapped[str | None] = mapped_column(String(64))
    identity_metadata: Mapped[dict] = mapped_column(JSONB, default=dict)

    tenant: Mapped[Tenant] = relationship("Tenant")


class Project(TimestampMixin, Base):
    __tablename__ = "tr_project"
    __table_args__ = (Index("ix_tr_project_tenant", "tenant_id"),)

    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="active")
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class Space(TimestampMixin, Base):
    __tablename__ = "tr_space"
    __table_args__ = (
        Index("ix_tr_space_tenant", "tenant_id"),
        Index("ix_tr_space_slug", "tenant_id", "slug", unique=True),
    )

    space_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(32))
    icon: Mapped[str | None] = mapped_column(String(64))
    position: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="active")
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class Folder(TimestampMixin, Base):
    __tablename__ = "tr_folder"
    __table_args__ = (Index("ix_tr_folder_space", "tenant_id", "space_id"),)

    folder_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    space_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_space.space_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)


class List(TimestampMixin, Base):
    __tablename__ = "tr_list"
    __table_args__ = (
        Index("ix_tr_list_space", "tenant_id", "space_id"),
        Index("ix_tr_list_folder", "tenant_id", "folder_id"),
    )

    list_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    space_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_space.space_id"), nullable=False)
    folder_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_folder.folder_id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)
    color: Mapped[str | None] = mapped_column(String(32))
    default_view: Mapped[str] = mapped_column(String(32), default="list")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    statuses: Mapped[list["ListStatus"]] = relationship(
        "ListStatus",
        back_populates="list",
        cascade="all, delete-orphan",
    )
    custom_fields: Mapped[list["CustomFieldDefinition"]] = relationship(
        "CustomFieldDefinition",
        back_populates="list",
        cascade="all, delete-orphan",
    )


class ListStatus(TimestampMixin, Base):
    __tablename__ = "tr_list_status"
    __table_args__ = (Index("ix_tr_list_status_list", "tenant_id", "list_id", "position"),)

    status_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    list_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_list.list_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(32), default="active")  # todo/in_progress/done
    color: Mapped[str | None] = mapped_column(String(32))
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    list: Mapped["List"] = relationship("List", back_populates="statuses")


class CustomFieldDefinition(TimestampMixin, Base):
    __tablename__ = "tr_custom_field"
    __table_args__ = (Index("ix_tr_custom_field_tenant", "tenant_id", "space_id"),)

    field_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    space_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_space.space_id"))
    list_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_list.list_id"))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False)
    field_type: Mapped[str] = mapped_column(String(32), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    list: Mapped["List | None"] = relationship("List", back_populates="custom_fields")
    task_values: Mapped[list["TaskCustomField"]] = relationship(
        "TaskCustomField",
        back_populates="field",
        cascade="all, delete-orphan",
    )


class TaskCustomField(TimestampMixin, Base):
    __tablename__ = "tr_task_custom_field"
    __table_args__ = (
        Index("ix_tr_task_custom_field_task", "tenant_id", "task_id"),
        Index("ix_tr_task_custom_field_field", "tenant_id", "field_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"), nullable=False)
    field_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_custom_field.field_id"), nullable=False)
    value: Mapped[dict | None] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    task: Mapped["Task"] = relationship("Task", back_populates="custom_fields")
    field: Mapped["CustomFieldDefinition"] = relationship("CustomFieldDefinition", back_populates="task_values")


class Document(TimestampMixin, Base):
    __tablename__ = "tr_doc"
    __table_args__ = (
        Index("ix_tr_doc_tenant", "tenant_id", "space_id", "list_id"),
        Index("ix_tr_doc_slug", "tenant_id", "slug", unique=True),
    )

    doc_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    space_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_space.space_id"))
    list_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_list.list_id"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)

    revisions: Mapped[list["DocumentRevision"]] = relationship(
        "DocumentRevision",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentRevision.version",
    )


class DocumentRevision(TimestampMixin, Base):
    __tablename__ = "tr_doc_revision"
    __table_args__ = (Index("ix_tr_doc_revision_doc", "tenant_id", "doc_id", "version"),)

    revision_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    doc_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_doc.doc_id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    plain_text: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))

    document: Mapped["Document"] = relationship("Document", back_populates="revisions")


class ChatSession(TimestampMixin, Base):
    __tablename__ = "tr_chat_session"
    __table_args__ = (
        Index("ix_tr_chat_session_tenant", "tenant_id"),
        Index("ix_tr_chat_session_user", "tenant_id", "created_by_id"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="Session")
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))
    created_by_label: Mapped[str | None] = mapped_column(String(128))
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ChatMessage(TimestampMixin, Base):
    __tablename__ = "tr_chat_message"
    __table_args__ = (
        Index("ix_tr_chat_message_session", "tenant_id", "session_id", "created_at"),
    )

    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_chat_session.session_id"), nullable=False)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Task(TimestampMixin, Base):
    __tablename__ = "tr_task"
    __table_args__ = (
        Index("ix_tr_task_list", "tenant_id", "list_id"),
        Index("ix_tr_task_assignee", "tenant_id", "assignee_id"),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    space_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_space.space_id"))
    list_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_list.list_id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="backlog")
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    due_at: Mapped[datetime | None] = mapped_column()
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    custom_fields: Mapped[list["TaskCustomField"]] = relationship(
        "TaskCustomField",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class Subtask(TimestampMixin, Base):
    __tablename__ = "tr_subtask"

    subtask_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")


class Comment(TimestampMixin, Base):
    __tablename__ = "tr_comment"
    __table_args__ = (Index("ix_tr_comment_task", "tenant_id", "task_id"),)

    comment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"), nullable=False)
    author_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    mentions: Mapped[list[str]] = mapped_column(JSONB, default=list)


class Attachment(TimestampMixin, Base):
    __tablename__ = "tr_attachment"

    attachment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"))
    file_key: Mapped[str] = mapped_column(String(512), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(default=0)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ActivityEvent(TimestampMixin, Base):
    __tablename__ = "tr_activity_event"
    __table_args__ = (Index("ix_tr_activity_event_task", "tenant_id", "task_id"),)

    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)


class Worklog(TimestampMixin, Base):
    __tablename__ = "tr_worklog"

    worklog_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"), nullable=False)
    minutes_spent: Mapped[int] = mapped_column(nullable=False)
    logged_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text)


class TaskDependency(TimestampMixin, Base):
    __tablename__ = "tr_task_dependency"
    __table_args__ = (Index("ix_tr_task_dependency_task", "tenant_id", "task_id"),)

    dependency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"), nullable=False)
    depends_on_task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_task.task_id"), nullable=False)
    dependency_type: Mapped[str] = mapped_column(String(32), default="blocks")


class AutomationRule(TimestampMixin, Base):
    __tablename__ = "tr_automation_rule"
    __table_args__ = (Index("ix_tr_automation_rule_tenant", "tenant_id"),)

    rule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rule_type: Mapped[str] = mapped_column(String(32), nullable=False)
    definition: Mapped[dict] = mapped_column(JSONB, default=dict)
    enabled: Mapped[bool] = mapped_column(default=True)


class Dashboard(TimestampMixin, Base):
    __tablename__ = "tr_dashboard"
    __table_args__ = (
        Index("ix_tr_dashboard_slug", "tenant_id", "space_id", "slug", unique=True),
    )

    dashboard_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    space_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_space.space_id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), default="default")
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    layout_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    space: Mapped["Space"] = relationship("Space")


class SpacePlanPoint(TimestampMixin, Base):
    __tablename__ = "tr_space_plan_point"
    __table_args__ = (
        Index("ix_tr_space_plan_point_space_date", "tenant_id", "space_id", "target_date", unique=True),
    )

    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    space_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_space.space_id"), nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    planned_count: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class DeptxDepartment(TimestampMixin, Base):
    __tablename__ = "tr_deptx_department"
    __table_args__ = (Index("ix_tr_deptx_department_tenant", "tenant_id"),)

    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    focus_area: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    workflows: Mapped[list["DeptxWorkflow"]] = relationship(
        "DeptxWorkflow",
        back_populates="department",
        cascade="all, delete-orphan",
    )
    agents: Mapped[list["DeptxAgent"]] = relationship(
        "DeptxAgent",
        back_populates="department",
        cascade="all, delete-orphan",
    )
    executions: Mapped[list["DeptxExecution"]] = relationship(
        "DeptxExecution",
        back_populates="department",
        cascade="all, delete-orphan",
    )


class DeptxWorkflow(TimestampMixin, Base):
    __tablename__ = "tr_deptx_workflow"
    __table_args__ = (Index("ix_tr_deptx_workflow_department", "tenant_id", "department_id"),)

    workflow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_deptx_department.department_id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    n8n_workflow_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    version: Mapped[int] = mapped_column(Integer, default=1)
    trigger_type: Mapped[str | None] = mapped_column(String(64))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    department: Mapped["DeptxDepartment"] = relationship("DeptxDepartment", back_populates="workflows")
    executions: Mapped[list["DeptxExecution"]] = relationship(
        "DeptxExecution",
        back_populates="workflow",
        cascade="all, delete-orphan",
    )


class DeptxAgent(TimestampMixin, Base):
    __tablename__ = "tr_deptx_agent"
    __table_args__ = (Index("ix_tr_deptx_agent_department", "tenant_id", "department_id"),)

    agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_deptx_department.department_id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(32), default="active")
    description: Mapped[str | None] = mapped_column(Text)
    skill_tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    sandbox_profile: Mapped[str | None] = mapped_column(String(128))
    config_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    department: Mapped["DeptxDepartment"] = relationship("DeptxDepartment", back_populates="agents")
    executions: Mapped[list["DeptxExecution"]] = relationship("DeptxExecution", back_populates="agent")


class DeptxExecution(TimestampMixin, Base):
    __tablename__ = "tr_deptx_execution"
    __table_args__ = (
        Index("ix_tr_deptx_execution_workflow", "tenant_id", "workflow_id"),
        Index("ix_tr_deptx_execution_status", "tenant_id", "status", "created_at"),
    )

    execution_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    department_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_deptx_department.department_id"), nullable=False)
    workflow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_deptx_workflow.workflow_id"), nullable=False)
    agent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_deptx_agent.agent_id"))
    status: Mapped[str] = mapped_column(String(32), default="queued")
    trigger_type: Mapped[str | None] = mapped_column(String(64))
    trace_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    started_at: Mapped[datetime | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column()
    input_payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    output_payload: Mapped[dict | None] = mapped_column(JSONB)
    metrics_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    quality_score: Mapped[float | None] = mapped_column(Numeric(5, 2))
    error_message: Mapped[str | None] = mapped_column(Text)

    department: Mapped["DeptxDepartment"] = relationship("DeptxDepartment", back_populates="executions")
    workflow: Mapped["DeptxWorkflow"] = relationship("DeptxWorkflow", back_populates="executions")
    agent: Mapped["DeptxAgent | None"] = relationship("DeptxAgent", back_populates="executions")


class PreferenceModel(TimestampMixin, Base):
    __tablename__ = "tr_preference_model"
    __table_args__ = (Index("ix_tr_preference_model_status", "tenant_id", "status"),)

    model_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="inactive")
    description: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    variants: Mapped[list["PreferenceVariant"]] = relationship(
        "PreferenceVariant",
        back_populates="model",
        cascade="all, delete-orphan",
    )
    rollouts: Mapped[list["PreferenceRollout"]] = relationship(
        "PreferenceRollout",
        back_populates="model",
        cascade="all, delete-orphan",
    )
    feedback: Mapped[list["PreferenceFeedback"]] = relationship(
        "PreferenceFeedback",
        back_populates="model",
        cascade="all, delete-orphan",
    )


class PreferenceVariant(TimestampMixin, Base):
    __tablename__ = "tr_preference_variant"
    __table_args__ = (Index("ix_tr_preference_variant_model", "tenant_id", "model_id"),)

    variant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    model_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_preference_model.model_id"), nullable=False)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rollout_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0)
    status: Mapped[str] = mapped_column(String(32), default="inactive")
    metrics_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    model: Mapped["PreferenceModel"] = relationship("PreferenceModel", back_populates="variants")
    rollouts: Mapped[list["PreferenceRollout"]] = relationship("PreferenceRollout", back_populates="variant")
    feedback: Mapped[list["PreferenceFeedback"]] = relationship("PreferenceFeedback", back_populates="variant")


class PreferenceRollout(TimestampMixin, Base):
    __tablename__ = "tr_preference_rollout"
    __table_args__ = (
        Index("ix_tr_preference_rollout_model", "tenant_id", "model_id"),
        Index("ix_tr_preference_rollout_stage", "tenant_id", "stage"),
    )

    rollout_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    model_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_preference_model.model_id"), nullable=False)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_preference_variant.variant_id"))
    stage: Mapped[str] = mapped_column(String(64), default="draft")
    target_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0)
    current_rate: Mapped[float] = mapped_column(Numeric(5, 4), default=0)
    safety_status: Mapped[str] = mapped_column(String(32), default="pending")
    guardrail_metrics: Mapped[dict] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column()
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    model: Mapped["PreferenceModel"] = relationship("PreferenceModel", back_populates="rollouts")
    variant: Mapped["PreferenceVariant | None"] = relationship("PreferenceVariant", back_populates="rollouts")


class PreferenceFeedback(Base):
    __tablename__ = "tr_preference_feedback"
    __table_args__ = (
        Index("ix_tr_preference_feedback_model", "tenant_id", "model_id", "recorded_at"),
        Index("ix_tr_preference_feedback_variant", "tenant_id", "variant_id"),
    )

    feedback_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    model_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_preference_model.model_id"), nullable=False)
    variant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_preference_variant.variant_id"))
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    signal_type: Mapped[str] = mapped_column(String(32), nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    recorded_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    model: Mapped["PreferenceModel"] = relationship("PreferenceModel", back_populates="feedback")
    variant: Mapped["PreferenceVariant | None"] = relationship("PreferenceVariant", back_populates="feedback")


class FlowTemplate(TimestampMixin, Base):
    __tablename__ = "tr_flow_template"
    __table_args__ = (
        Index("ix_tr_flow_template_category", "tenant_id", "category"),
        Index("ix_tr_flow_template_slug", "tenant_id", "slug", unique=True),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(64), default="generic")
    description: Mapped[str | None] = mapped_column(Text)
    definition_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    tags: Mapped[list[str]] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)

    runs: Mapped[list["FlowRun"]] = relationship(
        "FlowRun",
        back_populates="template",
        cascade="all, delete-orphan",
    )


class UserPreference(TimestampMixin, Base):
    __tablename__ = "tr_user_preference"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", "key", name="ux_tr_user_preference_tenant_user_key"),)

    preference_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    key: Mapped[str] = mapped_column(String(128), nullable=False)
    value_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))

    # Note: No relationship to FlowRun; there is no FK from preferences to runs.


class FlowRun(TimestampMixin, Base):
    __tablename__ = "tr_flow_run"
    __table_args__ = (
        Index("ix_tr_flow_run_template", "tenant_id", "template_id"),
        Index("ix_tr_flow_run_status", "tenant_id", "status", "created_at"),
    )

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_flow_template.template_id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    context_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    result_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    started_at: Mapped[datetime | None] = mapped_column()
    completed_at: Mapped[datetime | None] = mapped_column()

    template: Mapped["FlowTemplate"] = relationship("FlowTemplate", back_populates="runs")
    suggestions: Mapped[list["AutoPMSuggestion"]] = relationship(
        "AutoPMSuggestion",
        back_populates="flow_run",
        cascade="all, delete-orphan",
    )


class AutoPMSuggestion(TimestampMixin, Base):
    __tablename__ = "tr_autopm_suggestion"
    __table_args__ = (
        Index("ix_tr_autopm_suggestion_status", "tenant_id", "status", "created_at"),
    )

    suggestion_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    flow_run_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_flow_run.run_id"))
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    details: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="proposed")
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    resolved_at: Mapped[datetime | None] = mapped_column()

    flow_run: Mapped["FlowRun | None"] = relationship("FlowRun", back_populates="suggestions")
    approvals: Mapped[list["ApprovalQueueItem"]] = relationship(
        "ApprovalQueueItem",
        back_populates="suggestion",
        cascade="all, delete-orphan",
    )


class SicaSession(TimestampMixin, Base):
    __tablename__ = "tr_sica_session"
    __table_args__ = (
        Index("ix_tr_sica_session_subject", "tenant_id", "subject_type", "subject_id"),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    subject_type: Mapped[str] = mapped_column(String(64), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="open")
    critique_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    resolution_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    notes: Mapped[list["SicaNote"]] = relationship(
        "SicaNote",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class SicaNote(Base):
    __tablename__ = "tr_sica_note"
    __table_args__ = (
        Index("ix_tr_sica_note_session", "tenant_id", "session_id", "created_at"),
    )

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_sica_session.session_id"), nullable=False)
    author_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_user.user_id"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(UTC))

    session: Mapped["SicaSession"] = relationship("SicaSession", back_populates="notes")


class CalendarSource(TimestampMixin, Base):
    __tablename__ = "tr_calendar_source"
    __table_args__ = (
        Index("ix_tr_calendar_source_type", "tenant_id", "type"),
        Index("ix_tr_calendar_source_slug", "tenant_id", "slug", unique=True),
    )

    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    slug: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    events: Mapped[list["CalendarEvent"]] = relationship(
        "CalendarEvent",
        back_populates="source",
        cascade="all, delete-orphan",
    )


class CalendarEvent(TimestampMixin, Base):
    __tablename__ = "tr_calendar_event"
    __table_args__ = (
        Index("ix_tr_calendar_event_source", "tenant_id", "source_id", "start_at"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_calendar_source.source_id"), nullable=False)
    external_id: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    start_at: Mapped[datetime] = mapped_column()
    end_at: Mapped[datetime] = mapped_column()
    location: Mapped[str | None] = mapped_column(String(255))
    attendees: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    source: Mapped["CalendarSource"] = relationship("CalendarSource", back_populates="events")
    meeting_notes: Mapped[list["MeetingNote"]] = relationship(
        "MeetingNote",
        back_populates="event",
        cascade="all, delete-orphan",
    )


class CalendarSlot(TimestampMixin, Base):
    __tablename__ = "tr_calendar_slot"
    __table_args__ = (
        Index("ix_tr_calendar_slot_owner", "tenant_id", "owner_id", "start_at"),
    )

    slot_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    start_at: Mapped[datetime] = mapped_column()
    end_at: Mapped[datetime] = mapped_column()
    status: Mapped[str] = mapped_column(String(32), default="free")
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class MeetingNote(TimestampMixin, Base):
    __tablename__ = "tr_meeting_note"
    __table_args__ = (
        Index("ix_tr_meeting_note_event", "tenant_id", "event_id"),
    )

    note_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_calendar_event.event_id"))
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    action_items: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)

    event: Mapped["CalendarEvent | None"] = relationship("CalendarEvent", back_populates="meeting_notes")


class SchedulingNegotiation(TimestampMixin, Base):
    __tablename__ = "tr_scheduling_negotiation"
    __table_args__ = (
        Index("ix_tr_scheduling_negotiation_tenant", "tenant_id", "status"),
        Index("ix_tr_scheduling_negotiation_thread", "tenant_id", "external_thread_id"),
    )

    negotiation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    channel_type: Mapped[str] = mapped_column(String(32), default="email")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    participants: Mapped[list[str]] = mapped_column(JSONB, default=list)
    messages: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    external_thread_id: Mapped[str | None] = mapped_column(String(128))
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ApprovalQueueItem(TimestampMixin, Base):
    __tablename__ = "tr_approval_queue"
    __table_args__ = (
        Index("ix_tr_approval_queue_tenant_status", "tenant_id", "status", "created_at"),
        Index("ix_tr_approval_queue_suggestion", "tenant_id", "suggestion_id"),
    )

    approval_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    suggestion_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_autopm_suggestion.suggestion_id"))
    source: Mapped[str] = mapped_column(String(64), default="autopm")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    reason: Mapped[str | None] = mapped_column(Text)
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    suggestion: Mapped["AutoPMSuggestion | None"] = relationship("AutoPMSuggestion", back_populates="approvals")


class OutboxMessage(TimestampMixin, Base):
    __tablename__ = "tr_outbox_event"
    __table_args__ = (
        Index("ix_tr_outbox_event_status_created", "status", "created_at"),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RetentionPolicy(TimestampMixin, Base):
    __tablename__ = "tr_retention_policy"
    __table_args__ = (
        Index("ix_tr_retention_policy_resource", "tenant_id", "resource_type", unique=True),
    )

    policy_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class ScrAlert(TimestampMixin, Base):
    __tablename__ = "tr_scr_alert"
    __table_args__ = (
        Index("ix_tr_scr_alert_tenant_created", "tenant_id", "created_at"),
        Index("ix_tr_scr_alert_tenant_ack", "tenant_id", "acknowledged_at"),
    )

    alert_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    taskr_task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(64), nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TenantConfig(TimestampMixin, Base):
    __tablename__ = "tr_tenant_config"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), primary_key=True
    )
    cfg_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    cfg_value: Mapped[dict] = mapped_column(JSONB, default=dict)


class UsageStat(TimestampMixin, Base):
    __tablename__ = "tr_usage_stat"
    __table_args__ = (
        Index("ix_tr_usage_stat_metric", "tenant_id", "metric", "period_date"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), primary_key=True)
    metric: Mapped[str] = mapped_column(String(64), primary_key=True)
    period_date: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class NotificationChannel(TimestampMixin, Base):
    __tablename__ = "tr_notification_channel"
    __table_args__ = (
        Index("ix_tr_notification_channel_tenant", "tenant_id"),
        UniqueConstraint("tenant_id", "channel", name="ux_tr_notification_channel_tenant_channel"),
    )

    channel_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tr_tenant.tenant_id"), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    events: Mapped[list[str]] = mapped_column(JSONB, default=list)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
