-- memPODS ingestion queue and optional local embedding storage
CREATE TABLE IF NOT EXISTS tr_memory_queue (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
  resource_type VARCHAR(32) NOT NULL,
  resource_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_tr_memory_queue_resource UNIQUE (tenant_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS ix_tr_memory_queue_status
  ON tr_memory_queue(status, available_at);

CREATE INDEX IF NOT EXISTS ix_tr_memory_queue_tenant
  ON tr_memory_queue(tenant_id, status);

CREATE TABLE IF NOT EXISTS tr_memory_vector (
  vector_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
  resource_type VARCHAR(32) NOT NULL,
  resource_id UUID NOT NULL,
  embedding DOUBLE PRECISION[] NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_tr_memory_vector_resource UNIQUE (tenant_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS ix_tr_memory_vector_resource
  ON tr_memory_vector(tenant_id, resource_type);
