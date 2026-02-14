-- Custom field options for select/multi-select
CREATE TABLE IF NOT EXISTS tr_custom_field_option (
  option_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id UUID NOT NULL REFERENCES tr_custom_field(field_id) ON DELETE CASCADE,
  label VARCHAR(128) NOT NULL,
  value VARCHAR(128) NOT NULL,
  color VARCHAR(16) NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (field_id, value)
);

CREATE INDEX IF NOT EXISTS ix_tr_custom_field_option_field
  ON tr_custom_field_option(field_id, position);
