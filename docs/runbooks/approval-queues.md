# Approval Queue Workflow

TaskR records high-impact automation suggestions in an approval queue so humans (or SICA sessions) can confirm before rollout.

## Data Model
- `tr_approval_queue` stores queue items keyed by `approval_id` with `status` (pending/approved/rejected), optional `reason`, and metadata.
- Each item can reference an `autopm` suggestion via `suggestion_id`, keeping status and resolution timestamps in sync.

## API Endpoints
- `GET /approvals/queue?status=pending` – list queue items for the current tenant.
- `GET /approvals/queue/{id}` – fetch a specific item.
- `POST /approvals/queue/{id}/resolve` – approve or reject an item. Body:
  ```json
  {
    "action": "approve",  // or "reject"
    "notes": "Optional human comment",
    "metadata_json": {"approved_by": "user@example.com"}
  }
  ```

## Automation Hooks
- AutoPM adds high/urgent priority suggestions to the queue automatically and includes `approval_queue_id` in event payloads.
- Resolution events emit `approvals.queue.resolved` for downstream systems (e.g., SICA, dashboards).

## Next Steps
- Extend the queue to support scheduler decisions and external connectors once ToolFront integration is complete.
- Wire SICA session links via `metadata_json` when they become available.
