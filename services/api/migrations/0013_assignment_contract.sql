ALTER TABLE tr_assignment
    ADD COLUMN IF NOT EXISTS agent_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID,
    ADD COLUMN IF NOT EXISTS capabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS model_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS prompt_profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_tr_assignment_tenant_agent_id
    ON tr_assignment (tenant_id, agent_id);
