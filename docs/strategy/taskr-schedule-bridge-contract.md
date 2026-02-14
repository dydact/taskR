# TaskR Schedule Timeline & Bridge API Contract

This document captures the canonical data model and API contract for the
schedule → worklog → billing → claim pipeline that TaskR exposes to scrAIv (or
other Dydact services). It complements `docs/strategy/taskr-scraiv-integration.md`
and mirrors the feature-flagged `/bridge/*` endpoints implemented in TaskR.

## Canonical Entity: `tr_schedule_timeline`

| Field              | Type        | Notes |
|--------------------|-------------|-------|
| `timeline_id`      | UUID (PK)   | Unique identifier for the timeline row. |
| `tenant_id`        | UUID        | Tenant scope; cascades on delete. |
| `session_id`       | UUID        | Shared identifier linking calendar session, timesheet, billing, claim. |
| `patient_id`       | UUID?       | Optional reference to patient/client. |
| `staff_id`         | UUID?       | Optional reference to staff member. |
| `location_id`      | UUID?       | Optional location/office id. |
| `service_type`     | string(64)  | Business descriptor (e.g., therapy, eval). |
| `authorization_id` | UUID?       | Insurance authorization / plan of care reference. |
| `cpt_code`         | string(32)? | Billing code (CPT/HCPCS). |
| `modifiers`        | text[]      | Billing modifiers (e.g., GN). |
| `scheduled_start`  | timestamptz | Planned start. |
| `scheduled_end`    | timestamptz | Planned end. |
| `worked_start`     | timestamptz?| Clock-in. |
| `worked_end`       | timestamptz?| Clock-out. |
| `duration_minutes` | integer?    | Derived duration; defaults to difference between worked times. |
| `status`           | string(32)  | `scheduled`, `worked`, `approved`, `exported`, `claimed`, `paid`, etc. |
| `payroll_entry_id` | UUID?       | Link to payroll batch/entry. |
| `claim_id`         | UUID?       | Link to billing claim. |
| `transport_job_id` | UUID?       | Claim transport job identifier (clearinghouse). |
| `metadata_json`    | JSONB       | Arbitrary details (variance flags, notes). |
| `created_at`       | timestamptz | Audit timestamps. |
| `updated_at`       | timestamptz |  |

### Status ladder

```
scheduled → worked → approved → exported → submitted → accepted → paid
                                    ↘ rejected / void
```

- `submitted` and `accepted` reflect clearinghouse/ERA feedback captured via
  `/bridge/claims/status`.
- `rejected` and `void` represent negative outcomes. A rejected or voided entry
  remains tagged with that status until an override or correction is applied.
- Services consuming the bridge may map `submitted/accepted/rejected/void` back
  to their own presentation states, but those string values are what the API
  emits.
-
- Transitions can move backward when overrides occur (e.g., rejected session
  corrected and placed back into `worked` or `approved` for re-export).

### Reconciliation flows

- **Missed shift**: `scheduled` with no `worked_*` gets flagged; admin may set
  `worked` times post fact and include metadata (`"backfill": true`).
- **Backdated claims**: claim rejection updates `status` to `rejected` (or `void`
  when explicitly cancelled) and attaches metadata describing the rejection.
  Admin or AI workflows can move the entry back to `worked`/`approved` for
  correction before another export.
- **Payroll adjustments**: `payroll_entry_id` set during reconciliation; if
  payroll voided, row reverts to prior status.

## API Contract (OpenAPI excerpt)

```yaml
paths:
  /bridge/schedule:
    get:
      summary: List schedule timeline entries
      parameters:
        - name: start
          in: query
          schema: { type: string, format: date-time }
        - name: end
          in: query
          schema: { type: string, format: date-time }
        - name: staff_id
          in: query
          schema: { type: string, format: uuid }
        - name: patient_id
          in: query
          schema: { type: string, format: uuid }
        - name: status
          in: query
          schema:
            type: array
            items: { type: string }
      responses:
        "200":
          description: Timeline entries
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ScheduleTimeline"
        "503":
          description: Feature disabled
  /bridge/schedule/{session_id}/worklog:
    post:
      summary: Update worked times and duration
      parameters:
        - name: session_id
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ScheduleTimelineWorklogUpdate"
      responses:
        "200":
          description: Updated timeline
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ScheduleTimeline"
  /bridge/schedule/{session_id}/lock:
    post:
      summary: Set timeline status
      parameters:
        - name: session_id
          in: path
          required: true
          schema: { type: string, format: uuid }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ScheduleTimelineLockRequest"
      responses:
        "200":
          description: Updated timeline
  /bridge/billing/preview:
    get:
      summary: Billing preview for a timeline/session
      parameters:
        - { name: timeline_id, in: query, schema: { type: string, format: uuid } }
        - { name: session_id, in: query, schema: { type: string, format: uuid } }
      responses:
        "200":
          description: Billing payload
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/BillingPreviewResponse"
  /bridge/billing/export:
    post:
      summary: Mark timeline exported
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/BillingExportRequest"
      responses:
        "200":
          description: Updated timeline
  /bridge/claims/status:
    post:
      summary: Update claim status for a timeline
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ClaimStatusUpdate"
      responses:
        "200":
          description: Updated timeline
  /bridge/payroll/reconcile:
    post:
      summary: Record payroll batch reconciliation
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/PayrollReconcileRequest"
      responses:
        "200":
          description: Updated timelines
```

### Schemas (summary)

```
ScheduleTimeline:
  type: object
  properties:
    timeline_id: { type: string, format: uuid }
    session_id: { type: string, format: uuid }
    service_type: { type: string }
    status: { type: string }
    scheduled_start: { type: string, format: date-time }
    scheduled_end: { type: string, format: date-time }
    worked_start: { type: string, format: date-time, nullable: true }
    worked_end: { type: string, format: date-time, nullable: true }
    duration_minutes: { type: integer, nullable: true }
    modifiers: { type: array, items: { type: string } }
    metadata_json: { type: object }

ScheduleTimelineWorklogUpdate:
  properties:
    worked_start: { type: string, format: date-time, nullable: true }
    worked_end: { type: string, format: date-time, nullable: true }
    duration_minutes: { type: integer, nullable: true }
    metadata: { type: object, nullable: true }

ScheduleTimelineLockRequest:
  properties:
    status: { type: string, enum: ["scheduled","worked","approved","exported","claimed","paid"] }
    lock_metadata: { type: object, nullable: true }

BillingPreviewResponse:
  properties:
    timeline_id: { type: string, format: uuid }
    session_id: { type: string, format: uuid }
    service_type: { type: string }
    cpt_code: { type: string, nullable: true }
    modifiers: { type: array, items: { type: string } }
    units: { type: number, nullable: true }
    rate: { type: number, nullable: true }
    authorization_id: { type: string, format: uuid, nullable: true }
    metadata: { type: object }

BillingExportRequest:
  properties:
    timeline_id: { type: string, format: uuid }
    transport_job_id: { type: string, format: uuid }
    metadata: { type: object, nullable: true }

ClaimStatusUpdate:
  properties:
    timeline_id: { type: string, format: uuid }
    claim_id: { type: string, format: uuid }
    status: { type: string, enum: ["submitted","accepted","rejected","paid","void"] }
    status_code: { type: string, nullable: true }
    status_message: { type: string, nullable: true }
    metadata: { type: object, nullable: true }

PayrollReconcileRequest:
  properties:
    payroll_entry_id: { type: string, format: uuid }
    timeline_ids: { type: array, items: { type: string, format: uuid } }
    status: { type: string, enum: ["generated","paid","void"] }
    metadata: { type: object, nullable: true }
```

## Feature Flags & Environment Variables

- `TR_BRIDGE_SCHEDULE_ENABLED` (default `false`): toggles the `/bridge/*`
  endpoints. Should only be enabled in environments where scrAIv consumes them.

## Testing & Validation

- `services/api/tests/test_bridge.py` ensures the endpoints return `503` when
  disabled and validates basic response structure when enabled.
- Additional integration tests should:
  - Verify worklog updates derive duration when absent.
  - Assert status transitions align with business rules.
  - Confirm billing preview returns expected CPT/modifier/units for sample data.

## Postman / QA

- Provide sample requests at `docs/postman/taskr-bridge.postman_collection.json`
  (variables: `base_url`, `token`, `tenant_id`, `session_id`, `timeline_id`,
  etc.) so scrAIv can validate the contract ahead of UI integration.

## Open Questions

- Should rate calculation live in TaskR or scrAIv? (Currently placeholder.)
- Do we need multi-session grouping (e.g., multi-staff, group therapy) before
  enabling the bridge in production?
- How do we surface AI anomaly alerts consistently (notification vs metadata)?

Please submit updates here when new fields or endpoints are introduced so both
TaskR and scrAIv agents stay aligned.
