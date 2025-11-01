CREATE TABLE IF NOT EXISTS tr_outbox_event (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_tr_outbox_event_status_created ON tr_outbox_event (status, created_at);
