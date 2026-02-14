CREATE TABLE IF NOT EXISTS tr_space_usage_snapshot (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES tr_space(space_id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    active_users INTEGER NOT NULL DEFAULT 0,
    tasks_created INTEGER NOT NULL DEFAULT 0,
    tasks_completed INTEGER NOT NULL DEFAULT 0,
    automations_triggered INTEGER NOT NULL DEFAULT 0,
    command_palette_invocations INTEGER NOT NULL DEFAULT 0,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, space_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS ix_tr_space_usage_snapshot_tenant_date
    ON tr_space_usage_snapshot (tenant_id, snapshot_date);
