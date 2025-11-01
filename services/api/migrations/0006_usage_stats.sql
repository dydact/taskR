CREATE TABLE IF NOT EXISTS tr_usage_stat (
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    metric VARCHAR(64) NOT NULL,
    period_date DATE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, metric, period_date)
);
