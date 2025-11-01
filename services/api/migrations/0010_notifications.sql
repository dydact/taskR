-- Notification channel configuration
CREATE TABLE IF NOT EXISTS tr_notification_channel (
  channel_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
  channel VARCHAR(32) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tr_notification_channel_tenant
  ON tr_notification_channel(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tr_notification_channel_tenant_channel
  ON tr_notification_channel(tenant_id, channel);
