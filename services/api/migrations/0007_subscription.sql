CREATE TABLE IF NOT EXISTS tr_tenant_subscription (
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    plan_slug VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    active_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_until TIMESTAMPTZ NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id)
);

CREATE INDEX IF NOT EXISTS ix_tr_tenant_subscription_plan ON tr_tenant_subscription(plan_slug);
CREATE INDEX IF NOT EXISTS ix_tr_tenant_subscription_status ON tr_tenant_subscription(status);

CREATE TABLE IF NOT EXISTS tr_tenant_feature_override (
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    application VARCHAR(64) NOT NULL,
    feature_code VARCHAR(128) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, application, feature_code)
);

CREATE INDEX IF NOT EXISTS ix_tr_tenant_feature_override_tenant ON tr_tenant_feature_override(tenant_id, application);
