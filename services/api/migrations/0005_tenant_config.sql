-- Tenant configuration storage for per-tenant clearinghouse settings
CREATE TABLE IF NOT EXISTS tr_tenant_config (
  tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
  cfg_key VARCHAR(64) NOT NULL,
  cfg_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, cfg_key)
);

CREATE INDEX IF NOT EXISTS ix_tr_tenant_config_key ON tr_tenant_config (cfg_key);
