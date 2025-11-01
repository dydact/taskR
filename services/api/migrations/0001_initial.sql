CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS tr_tenant (
    tenant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    global_org_id UUID,
    org_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tr_user (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    email VARCHAR(320) NOT NULL,
    given_name VARCHAR(128) NOT NULL DEFAULT '',
    family_name VARCHAR(128) NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    global_user_id UUID,
    identity_provider VARCHAR(64),
    identity_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS ix_tr_user_global ON tr_user (global_user_id);

CREATE TABLE IF NOT EXISTS tr_space (
    space_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    slug VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(32),
    icon VARCHAR(64),
    position INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_space_tenant ON tr_space (tenant_id);

CREATE TABLE IF NOT EXISTS tr_folder (
    folder_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES tr_space(space_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_folder_space ON tr_folder (tenant_id, space_id);

CREATE TABLE IF NOT EXISTS tr_list (
    list_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES tr_space(space_id) ON DELETE CASCADE,
    folder_id UUID REFERENCES tr_folder(folder_id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    color VARCHAR(32),
    default_view VARCHAR(32) NOT NULL DEFAULT 'list',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_list_space ON tr_list (tenant_id, space_id);
CREATE INDEX IF NOT EXISTS ix_tr_list_folder ON tr_list (tenant_id, folder_id);

CREATE TABLE IF NOT EXISTS tr_list_status (
    status_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    list_id UUID NOT NULL REFERENCES tr_list(list_id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL DEFAULT 'active',
    color VARCHAR(32),
    position INTEGER NOT NULL DEFAULT 0,
    is_done BOOLEAN NOT NULL DEFAULT FALSE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_list_status_list ON tr_list_status (tenant_id, list_id, position);

CREATE TABLE IF NOT EXISTS tr_custom_field (
    field_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID REFERENCES tr_space(space_id) ON DELETE SET NULL,
    list_id UUID REFERENCES tr_list(list_id) ON DELETE SET NULL,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    field_type VARCHAR(32) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_custom_field_tenant ON tr_custom_field (tenant_id, space_id);

-- moved after tr_task to satisfy FK

CREATE TABLE IF NOT EXISTS tr_doc (
    doc_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID REFERENCES tr_space(space_id) ON DELETE SET NULL,
    list_id UUID REFERENCES tr_list(list_id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    summary TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    updated_by_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_doc_tenant ON tr_doc (tenant_id, space_id, list_id);

CREATE TABLE IF NOT EXISTS tr_doc_revision (
    revision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    doc_id UUID NOT NULL REFERENCES tr_doc(doc_id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    plain_text TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_doc_revision_doc ON tr_doc_revision (tenant_id, doc_id, version);

CREATE TABLE IF NOT EXISTS tr_task (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID REFERENCES tr_space(space_id) ON DELETE SET NULL,
    list_id UUID NOT NULL REFERENCES tr_list(list_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'backlog',
    priority VARCHAR(16) NOT NULL DEFAULT 'medium',
    due_at TIMESTAMPTZ,
    assignee_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    created_by_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_task_list ON tr_task (tenant_id, list_id);
CREATE INDEX IF NOT EXISTS ix_tr_task_assignee ON tr_task (tenant_id, assignee_id);

CREATE TABLE IF NOT EXISTS tr_task_custom_field (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tr_task(task_id) ON DELETE CASCADE,
    field_id UUID NOT NULL REFERENCES tr_custom_field(field_id) ON DELETE CASCADE,
    value JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_task_custom_field_task ON tr_task_custom_field (tenant_id, task_id);
CREATE INDEX IF NOT EXISTS ix_tr_task_custom_field_field ON tr_task_custom_field (tenant_id, field_id);

CREATE TABLE IF NOT EXISTS tr_subtask (
    subtask_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tr_task(task_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tr_comment (
    comment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tr_task(task_id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES tr_user(user_id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    mentions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_comment_task ON tr_comment (tenant_id, task_id);

CREATE TABLE IF NOT EXISTS tr_attachment (
    attachment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    task_id UUID REFERENCES tr_task(task_id) ON DELETE SET NULL,
    file_key VARCHAR(512) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tr_activity_event (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    task_id UUID REFERENCES tr_task(task_id) ON DELETE SET NULL,
    actor_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    event_type VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_activity_event_task ON tr_activity_event (tenant_id, task_id);

CREATE TABLE IF NOT EXISTS tr_worklog (
    worklog_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tr_task(task_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES tr_user(user_id) ON DELETE CASCADE,
    minutes_spent INTEGER NOT NULL,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tr_task_dependency (
    dependency_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tr_task(task_id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tr_task(task_id) ON DELETE CASCADE,
    dependency_type VARCHAR(32) NOT NULL DEFAULT 'blocks',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_task_dependency_task ON tr_task_dependency (tenant_id, task_id);

CREATE TABLE IF NOT EXISTS tr_automation_rule (
    rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(32) NOT NULL,
    definition JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_automation_rule_tenant ON tr_automation_rule (tenant_id);

CREATE TABLE IF NOT EXISTS tr_dashboard (
    dashboard_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES tr_space(space_id) ON DELETE CASCADE,
    slug VARCHAR(128) NOT NULL DEFAULT 'default',
    name VARCHAR(255) NOT NULL,
    layout_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, space_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_dashboard_slug ON tr_dashboard (tenant_id, space_id, slug);

CREATE TABLE IF NOT EXISTS tr_deptx_department (
    department_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    slug VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    focus_area VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_deptx_department_tenant ON tr_deptx_department (tenant_id);

CREATE TABLE IF NOT EXISTS tr_deptx_workflow (
    workflow_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES tr_deptx_department(department_id) ON DELETE CASCADE,
    slug VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    n8n_workflow_id UUID,
    version INTEGER NOT NULL DEFAULT 1,
    trigger_type VARCHAR(64),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, department_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_deptx_workflow_department ON tr_deptx_workflow (tenant_id, department_id);

CREATE TABLE IF NOT EXISTS tr_deptx_agent (
    agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES tr_deptx_department(department_id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    description TEXT,
    skill_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    sandbox_profile VARCHAR(128),
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, department_id, name)
);
CREATE INDEX IF NOT EXISTS ix_tr_deptx_agent_department ON tr_deptx_agent (tenant_id, department_id);

CREATE TABLE IF NOT EXISTS tr_deptx_execution (
    execution_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES tr_deptx_department(department_id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES tr_deptx_workflow(workflow_id) ON DELETE CASCADE,
    agent_id UUID REFERENCES tr_deptx_agent(agent_id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    trigger_type VARCHAR(64),
    trace_id UUID,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_payload JSONB,
    metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    quality_score NUMERIC(5,2),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_deptx_execution_workflow ON tr_deptx_execution (tenant_id, workflow_id);
CREATE INDEX IF NOT EXISTS ix_tr_deptx_execution_status ON tr_deptx_execution (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS tr_preference_model (
    model_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    slug VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    base_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'inactive',
    description TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_preference_model_status ON tr_preference_model (tenant_id, status);

CREATE TABLE IF NOT EXISTS tr_preference_variant (
    variant_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES tr_preference_model(model_id) ON DELETE CASCADE,
    key VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    rollout_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'inactive',
    metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, model_id, key)
);
CREATE INDEX IF NOT EXISTS ix_tr_preference_variant_model ON tr_preference_variant (tenant_id, model_id);

CREATE TABLE IF NOT EXISTS tr_preference_rollout (
    rollout_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES tr_preference_model(model_id) ON DELETE CASCADE,
    variant_id UUID REFERENCES tr_preference_variant(variant_id) ON DELETE SET NULL,
    stage VARCHAR(64) NOT NULL DEFAULT 'draft',
    target_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    current_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    safety_status VARCHAR(32) NOT NULL DEFAULT 'pending',
    guardrail_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_preference_rollout_model ON tr_preference_rollout (tenant_id, model_id);
CREATE INDEX IF NOT EXISTS ix_tr_preference_rollout_stage ON tr_preference_rollout (tenant_id, stage);

CREATE TABLE IF NOT EXISTS tr_preference_feedback (
    feedback_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES tr_preference_model(model_id) ON DELETE CASCADE,
    variant_id UUID REFERENCES tr_preference_variant(variant_id) ON DELETE SET NULL,
    task_id UUID,
    user_id UUID,
    source VARCHAR(64) NOT NULL,
    signal_type VARCHAR(32) NOT NULL,
    rating INTEGER,
    notes TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_preference_feedback_model ON tr_preference_feedback (tenant_id, model_id, recorded_at);
CREATE INDEX IF NOT EXISTS ix_tr_preference_feedback_variant ON tr_preference_feedback (tenant_id, variant_id);

CREATE TABLE IF NOT EXISTS tr_flow_template (
    template_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    slug VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'generic',
    description TEXT,
    definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_by_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_flow_template_category ON tr_flow_template (tenant_id, category);

CREATE TABLE IF NOT EXISTS tr_flow_run (
    run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES tr_flow_template(template_id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_flow_run_template ON tr_flow_run (tenant_id, template_id);
CREATE INDEX IF NOT EXISTS ix_tr_flow_run_status ON tr_flow_run (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS tr_autopm_suggestion (
    suggestion_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    flow_run_id UUID REFERENCES tr_flow_run(run_id) ON DELETE SET NULL,
    task_id UUID,
    title VARCHAR(255) NOT NULL,
    details TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'proposed',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_tr_autopm_suggestion_status ON tr_autopm_suggestion (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS tr_sica_session (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    subject_type VARCHAR(64) NOT NULL,
    subject_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open',
    critique_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolution_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_sica_session_subject ON tr_sica_session (tenant_id, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS tr_sica_note (
    note_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES tr_sica_session(session_id) ON DELETE CASCADE,
    author_id UUID REFERENCES tr_user(user_id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_sica_note_session ON tr_sica_note (tenant_id, session_id, created_at);

CREATE TABLE IF NOT EXISTS tr_calendar_source (
    source_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    slug VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS ix_tr_calendar_source_type ON tr_calendar_source (tenant_id, type);

CREATE TABLE IF NOT EXISTS tr_calendar_event (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES tr_calendar_source(source_id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    title VARCHAR(255) NOT NULL,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    location VARCHAR(255),
    attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_calendar_event_source ON tr_calendar_event (tenant_id, source_id, start_at);

CREATE TABLE IF NOT EXISTS tr_calendar_slot (
    slot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    owner_id UUID,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'free',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_calendar_slot_owner ON tr_calendar_slot (tenant_id, owner_id, start_at);

CREATE TABLE IF NOT EXISTS tr_meeting_note (
    note_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    event_id UUID REFERENCES tr_calendar_event(event_id) ON DELETE SET NULL,
    task_id UUID,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    summary TEXT,
    action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_meeting_note_event ON tr_meeting_note (tenant_id, event_id);

CREATE TABLE IF NOT EXISTS tr_retention_policy (
    policy_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    resource_type VARCHAR(64) NOT NULL,
    retention_days INTEGER NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, resource_type)
);

CREATE TABLE IF NOT EXISTS tr_outbox_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic VARCHAR(128) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_tr_outbox_events_status ON tr_outbox_events (status, created_at);
