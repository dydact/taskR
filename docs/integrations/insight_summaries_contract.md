## Insight Summaries Contract (TaskR Perspective)

Canonical reference: dydact/docs/integrations/insight_summaries_contract.md

Endpoints (implemented in taskR API):
- POST `/summaries/meetings`
- POST `/summaries/autopm`

Headers:
- `x-tenant-id` required
- `x-user-id` optional
- `x-model-profile: reasoning` optional (switches model)

Request/Response Shapes
- Meetings
  - Request: `{ transcript?: string, notes?: string, meeting_meta?: object }`
  - Response:
    {
      "summary": "string",
      "action_items": [{"text": "string", "owner": "string", "due": "ISO?"}],
      "risks": ["string"],
      "timeline": [{"when": "string", "note": "string"}],
      "meta": {"source": "local_llm|fallback", "tenant_id": "...", "summary_id": "uuid", "generated_at": "ISO"}
    }
- AutoPM
  - Request: `{ thread?: string[], updates?: string[], project_meta?: object }`
  - Response:
    {
      "summary": "string",
      "blockers": ["string"],
      "next_actions": [{"text": "string", "owner": "string", "due": "ISO?"}],
      "owners": [{"id": "string", "name": "string"}],
      "meta": {"source": "local_llm|fallback", "tenant_id": "...", "summary_id": "uuid"}
    }

Notes
- When `TR_LOCAL_OPENAI_BASE_URL` is configured, responses are generated via the local OpenAI-compatible API with `response_format: json_object`. Otherwise a deterministic fallback is returned to keep the UI usable in dev.
- SSE info events (`/events/stream`) are out of scope in this phase but planned.
