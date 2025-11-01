CREATE TABLE IF NOT EXISTS tr_approval_queue (
    approval_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    suggestion_id UUID REFERENCES tr_autopm_suggestion(suggestion_id) ON DELETE SET NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'autopm',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    reason TEXT,
    resolution_notes TEXT,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tr_approval_queue_tenant_status ON tr_approval_queue (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_tr_approval_queue_suggestion ON tr_approval_queue (tenant_id, suggestion_id);
