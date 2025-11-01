-- Chat sessions persistence
CREATE TABLE IF NOT EXISTS tr_chat_session (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL DEFAULT 'Session',
  created_by_id UUID NULL REFERENCES tr_user(user_id) ON DELETE SET NULL,
  created_by_label VARCHAR(128),
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tr_chat_session_tenant ON tr_chat_session(tenant_id);
CREATE INDEX IF NOT EXISTS ix_tr_chat_session_user ON tr_chat_session(tenant_id, created_by_id);

CREATE TABLE IF NOT EXISTS tr_chat_message (
  message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES tr_chat_session(session_id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_tr_chat_message_session ON tr_chat_message(tenant_id, session_id, created_at);

