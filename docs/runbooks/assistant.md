# Knowledge Assistant Runbook

## Overview

The knowledge assistant answers tenant-scoped questions by retrieving dossiers from memPODS, composing a retrieval-augmented prompt, and streaming the response back to the client. All questions and answers are persisted to `tr_chat_*` tables so the experience aligns with the existing chat UI.

Key flow:
1. `POST /assistant/query` accepts the natural-language question and optional context filters.
2. The API fetches relevant dossiers from memPODS (`/api/v1/dossiers/search`) and builds the RAG prompt.
3. ToolFront (or fallback local LLM) generates the answer.
4. Question and answer are stored as `tr_chat_message` rows; an `assistant.reply` event is emitted for SSE clients.

## Configuration

Set the following env vars for the API service:
| Variable | Description |
|----------|-------------|
| `TR_MEMPODS_URL` / `TR_MEMPODS_API_TOKEN` | Access to the memPODS search API. |
| `TR_MEMPODS_TIMEOUT_SECONDS` | Optional request timeout (default 10s). |
| `TR_TOOLFRONT_*` | ToolFront base URL, token, and registry path for the `insight.llm` provider. |
| `TR_NOTIFICATION_QUEUE_SIZE` | Shared with other async services; ensure headroom for reply events. |

## Endpoint Contract

`POST /assistant/query`

```json
{
  "question": "What changed in Project X this week?",
  "context": {
    "project_id": "uuid",
    "filters": {
      "status": ["in_progress"]
    }
  },
  "mode": "summary" // or "detail"
}
```

Headers: `x-tenant-id` (required), `x-user-id` (optional for audit trail).

Response:
```json
{
  "answer": "Concise response with inline [S1] citations.",
  "sources": [
    {"resource_type": "task", "resource_id": "uuid", "snippet": "..."}
  ],
  "session_id": "uuid",
  "message_id": "uuid"
}
```

Each request is limited to 60 calls per tenant per minute. Clients can listen to `/events/stream` for `assistant.reply` events if they prefer push updates.

## Persistence

- Questions/answers land in `tr_chat_session` and `tr_chat_message`.
- Sources are stored in the message body so storefront UIs can render traceability.
- memPODS search results are not cached; rely on memPODS' relevance ranking.

## Operations

- **Warm start**: the assistant service is part of the API process; ensure `memory_service` and `notification_service` start cleanly at boot.
- **Rate limit hit**: clients receive HTTP 429 with `{"detail": "rate_limited"}`. Inspect API logs for abuse or increase the limit via configuration if necessary.
- **Prompt issues**: check ToolFront logs; the API will fall back to the local LLM if ToolFront is unavailable. Warnings are emitted via logger `app.services.insight`.

## Troubleshooting Checklist

| Symptom | Action |
|---------|--------|
| 429 errors immediately | Confirm the tenant is not reusing the same session across bots; if legitimate load, raise the limit. |
| Empty answers | Verify memPODS search results exist; use the Postman collection `taskr-mempods.postman_collection.json` to replicate. |
| Missing citations | Confirm dossiers contain `content` or `snippet` fields; ingestion workers may need to be backfilled. |
| No SSE events | Ensure `/events/stream` consumers are online and `assistant.reply` is not filtered out by channel config. |

## Testing

- Unit tests cover prompt assembly and persistence (`services/api/tests/test_assistant.py`).
- Use the Postman "Knowledge Assistant" collection or `curl`:
  ```bash
  curl -X POST "$API_URL/assistant/query" \\
    -H "x-tenant-id: $TENANT" \\
    -H "Content-Type: application/json" \\
    -d '{"question": "Summarise sprint blockers"}'
  ```
- For load testing, throttle clients to <60 RPS per tenant to respect rate limits.

