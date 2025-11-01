CREATE TABLE IF NOT EXISTS tr_user_preference (
    preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ux_tr_user_preference_tenant_user_key'
    ) THEN
        ALTER TABLE tr_user_preference
            ADD CONSTRAINT ux_tr_user_preference_tenant_user_key
            UNIQUE (tenant_id, user_id, key);
    END IF;
END $$;

