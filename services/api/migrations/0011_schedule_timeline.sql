-- Schedule timeline entity linking calendar, worklogs, payroll, and billing
CREATE TABLE IF NOT EXISTS tr_schedule_timeline (
  timeline_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tr_tenant(tenant_id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  patient_id UUID NULL,
  staff_id UUID NULL,
  location_id UUID NULL,
  service_type VARCHAR(64) NOT NULL,
  authorization_id UUID NULL,
  cpt_code VARCHAR(32) NULL,
  modifiers TEXT[] DEFAULT '{}',
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  worked_start TIMESTAMPTZ NULL,
  worked_end TIMESTAMPTZ NULL,
  duration_minutes INTEGER NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'scheduled',
  payroll_entry_id UUID NULL,
  claim_id UUID NULL,
  transport_job_id UUID NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_tr_schedule_timeline_session
  ON tr_schedule_timeline(tenant_id, session_id);

CREATE INDEX IF NOT EXISTS ix_tr_schedule_timeline_tenant_schedule
  ON tr_schedule_timeline(tenant_id, scheduled_start);

CREATE INDEX IF NOT EXISTS ix_tr_schedule_timeline_staff_date
  ON tr_schedule_timeline(tenant_id, staff_id, scheduled_start);
