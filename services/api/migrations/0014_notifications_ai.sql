CREATE TABLE IF NOT EXISTS tr_notification (
    notification_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    event_type VARCHAR(128) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    cta_path TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'unread',
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_notification_tenant_status
    ON tr_notification (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS tr_ai_job (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    prompt_id VARCHAR(128),
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    result_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_ai_job_tenant_status
    ON tr_ai_job (tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS tr_analytics_event (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    event_type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_analytics_event_tenant_type
    ON tr_analytics_event (tenant_id, event_type, occurred_at DESC);
