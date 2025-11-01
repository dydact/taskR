CREATE TABLE IF NOT EXISTS tr_scheduling_negotiation (
    negotiation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    subject VARCHAR(255) NOT NULL,
    channel_type VARCHAR(32) NOT NULL DEFAULT 'email',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    participants JSONB NOT NULL DEFAULT '[]'::jsonb,
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    external_thread_id VARCHAR(128),
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_scheduling_negotiation_tenant ON tr_scheduling_negotiation (tenant_id, status);
CREATE INDEX IF NOT EXISTS ix_tr_scheduling_negotiation_thread ON tr_scheduling_negotiation (tenant_id, external_thread_id);
