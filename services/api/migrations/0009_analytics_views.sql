CREATE TABLE IF NOT EXISTS tr_space_plan_point (
    plan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
    space_id UUID NOT NULL REFERENCES tr_space(space_id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    planned_count INTEGER NOT NULL,
    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_tr_space_plan_point_space_date
    ON tr_space_plan_point (tenant_id, space_id, target_date);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'mv_space_completion_daily' AND relkind = 'm'
    ) THEN
        EXECUTE $sql$
            CREATE MATERIALIZED VIEW mv_space_completion_daily AS
            SELECT
                t.tenant_id,
                t.space_id,
                DATE_TRUNC('day', t.updated_at)::DATE AS bucket_date,
                COUNT(*) AS completed_count
            FROM tr_task t
            JOIN tr_list_status ls
                ON ls.tenant_id = t.tenant_id
                AND ls.list_id = t.list_id
                AND LOWER(ls.name) = LOWER(t.status)
            WHERE ls.is_done IS TRUE
              AND t.updated_at IS NOT NULL
            GROUP BY t.tenant_id, t.space_id, DATE_TRUNC('day', t.updated_at)::DATE;
        $sql$;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'ix_mv_space_completion_daily'
    ) THEN
        CREATE UNIQUE INDEX ix_mv_space_completion_daily
            ON mv_space_completion_daily (tenant_id, space_id, bucket_date);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = 'mv_space_worklog_minutes' AND relkind = 'm'
    ) THEN
        EXECUTE $sql$
            CREATE MATERIALIZED VIEW mv_space_worklog_minutes AS
            SELECT
                t.tenant_id,
                t.space_id,
                t.task_id,
                COALESCE(SUM(w.minutes_spent), 0) AS total_minutes
            FROM tr_task t
            LEFT JOIN tr_worklog w
                ON w.tenant_id = t.tenant_id
                AND w.task_id = t.task_id
            GROUP BY t.tenant_id, t.space_id, t.task_id;
        $sql$;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'ix_mv_space_worklog_minutes'
    ) THEN
        CREATE INDEX ix_mv_space_worklog_minutes
            ON mv_space_worklog_minutes (tenant_id, space_id, task_id);
    END IF;
END $$;
