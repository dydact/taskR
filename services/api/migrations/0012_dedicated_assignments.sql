CREATE TABLE IF NOT EXISTS tr_assignment (
    assignment_id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    agent_slug VARCHAR(128) NOT NULL,
    agent_version VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    priority VARCHAR(32) NOT NULL DEFAULT 'normal',
    service_owner VARCHAR(64),
    node_id VARCHAR(128),
    overlay JSONB NOT NULL DEFAULT '{}'::jsonb,
    prompt_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    polaris_obligations JSONB NOT NULL DEFAULT '[]'::jsonb,
    feature_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tr_assignment_tenant ON tr_assignment (tenant_id);
CREATE INDEX IF NOT EXISTS ix_tr_assignment_status ON tr_assignment (tenant_id, status);
CREATE INDEX IF NOT EXISTS ix_tr_assignment_agent ON tr_assignment (tenant_id, agent_slug);

CREATE TABLE IF NOT EXISTS tr_assignment_event (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    assignment_id UUID NOT NULL REFERENCES tr_assignment(assignment_id) ON DELETE CASCADE,
    event_type VARCHAR(128) NOT NULL,
    source VARCHAR(64),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tr_assignment_event_assignment
    ON tr_assignment_event (tenant_id, assignment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_tr_assignment_event_type
    ON tr_assignment_event (tenant_id, event_type);
