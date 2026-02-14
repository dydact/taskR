# ToolFront Rollout Checklist

Use this checklist when enabling ToolFront-backed providers (e.g., `insight.llm`) in TaskR environments.

1. **Update manifest**
   - In `platform/dydact`, run `make export-toolfront-registry` after any provider change.
   - Copy the refreshed `toolfront-registry/providers.json` into `taskR/toolfront-registry/` and commit.
   - Run `./scripts/check_toolfront_manifest.sh` locally; CI runs the same check and will fail on drift.

2. **Verify dependencies**
   - Install the shared client from the vendored wheel: `pip install ../shared-python/toolfront_registry_client-0.1.0-py3-none-any.whl` (CI uses the same artifact via `services/api/requirements.txt`).
   - Confirm `services/api/tests/test_toolfront_contract.py` passes by providing `TOOLFRONT_BASE_URL`, `TOOLFRONT_API_TOKEN`, `TOOLFRONT_ENV`, and `TOOLFRONT_REGISTRY_PATH`.

3. **Configuration**
   - Set environment variables in the target environment:
     - `TR_USE_TOOLFRONT=true`
     - `TR_TOOLFRONT_BASE_URL=<gateway URL>`
     - `TR_TOOLFRONT_API_TOKEN=<token>`
      - `TR_TOOLFRONT_REGISTRY_PATH=/app/toolfront-registry/providers.json`
      - `TR_TOOLFRONT_ENV=<edge|cloud>`
      - Leave `TR_ROLLOUT_AUTOPILOT_ENABLED=false` until guardrail telemetry is validated.
      - `TR_SCR_LINKAGE_HTTP_URL` / `TR_SCR_LINKAGE_HTTP_TOKEN` to enable the HTTP forwarder fallback.
      - `TR_SCR_ALERT_TOKEN` shared secret for scrAIv alert ingestion.

4. **Staged enablement**
   - Flip `TR_USE_TOOLFRONT=true` for staging.
   - Run the ToolFront contract test manually (`pytest services/api/tests/test_toolfront_contract.py`).
   - Start the linkage forwarder in loop mode (`make linkage-forwarder ARGS="--loop"`) or deploy as a worker.
   - Monitor Insight latencies, approval queue volume, and new `preference.rollout.autopilot` events.
   - Run `scripts/ping_scraiv_linkage.py --taskr-url ... --scr-url ...` to validate linkage delivery.
   - Enable the autopilot flag per tenant only after verifying guardrail health.

5. **Production rollout**
   - Repeat the manifest diff and contract test checks.
   - Enable ToolFront in production behind feature flags per tenant.
   - Watch PagerDuty/Slack alerts from guardrail transitions and approval queue throughput during the first 24 hours.

6. **Post-rollout maintenance**
   - Keep the manifest in sync (CI will block if drift occurs).
   - Regenerate registry files whenever providers or schema IDs change.
   - Update the changelog in TaskR and scrAIv when new providers are pulled through.
