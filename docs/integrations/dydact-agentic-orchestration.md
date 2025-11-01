# Dydact Agentic Orchestration Contract

## Purpose
Dydact is the central AI provider for the platform. taskR and scrAIv call Dydact for LLM chat, structured summaries, and tool-assisted workflows. This document defines the shared API.

## Transport Options
- Primary: OpenAI-compatible `/v1/chat/completions` with SSE for streaming
- Task-specific endpoints (for quick parity with taskR):
  - `POST /summaries/meetings` → `{ summary: string }`
  - `POST /summaries/autopm` → `{ summary: string }`

## Headers & Tenancy
- Always propagate: `x-tenant-id`, `x-user-id`, `idempotency-key` (optional on writes)
- Dydact may use these to select model policies/guardrails and audit logs.

## Endpoints

### 1) Chat (SSE)
- `POST /v1/chat/completions`
  - Body (subset of OpenAI):
    ```json
    {
      "model": "claude-sonnet|qwen2.5-14b|...",
      "messages": [{"role":"system","content":"..."}, {"role":"user","content":"..."}],
      "temperature": 0.3,
      "max_tokens": 2000,
      "stream": true
    }
    ```
  - Stream format: standard `data: {"id","choices":[{"delta":{"content":"..."}}]}` + `data: [DONE]`.

### 2) Meeting Summary
- `POST /summaries/meetings`
  - Body:
    ```json
    {
      "content": "raw transcript text",
      "action_items": [{"title":"...","description":"..."}]
    }
    ```
  - Response: `{ "summary": "<= 120 words, clear bullets allowed" }`

### 3) AutoPM Summary
- `POST /summaries/autopm`
  - Body:
    ```json
    {
      "task_title": "Fix onboarding email",
      "due_at": "2025-10-20T15:30:00Z",
      "metadata": {"status":"In Progress","priority":"high","assignee":"alex@acme.com"}
    }
    ```
  - Response: `{ "summary": "Short narrative of risk + next action" }`

## Model Selection
- Profiles:
  - `default`: fast generalist model (Qwen2.5 14B recommended locally; GPT/Claude in cloud)
  - `reasoning`: deeper chain-of-thought (DeepSeek R1 32B/local or Claude Sonnet/cloud)
- Selection via header `x-model-profile: reasoning` or by model name.

## Guardrails & Preferences (optional)
- Dydact should support preference/guardrail metrics similar to taskR’s preferences module for consistent reporting.

## Acceptance
- taskR `/chat` proxies through to Dydact and streams cleanly.
- `/summaries/*` responses drop in without prompt changes.
