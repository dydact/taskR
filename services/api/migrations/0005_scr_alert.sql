CREATE TABLE IF NOT EXISTS tr_scr_alert (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    taskr_task_id UUID,
    severity VARCHAR(32) NOT NULL,
    kind VARCHAR(64) NOT NULL,
    message TEXT NOT NULL,
    source VARCHAR(64) NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tr_scr_alert_tenant_created ON tr_scr_alert (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_tr_scr_alert_tenant_ack ON tr_scr_alert (tenant_id, acknowledged_at);
