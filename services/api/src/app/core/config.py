from __future__ import annotations

import json
from typing import Any

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost:5173",
    "https://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "https://localhost:5174",
    "https://127.0.0.1:5174",
]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TR_")

    app_name: str = "taskR-api"
    database_url: str = "postgresql://taskr:taskr@localhost:5432/taskr"
    redis_url: str = "redis://localhost:6379/0"
    nats_url: str = "nats://localhost:4222"
    environment: str = "local"
    guardrail_slack_webhook: str | None = None
    guardrail_pagerduty_routing_key: str | None = None
    guardrail_pagerduty_component: str = "preferences"
    insight_api_url: str | None = None
    insight_api_timeout_seconds: float = 5.0
    # Local OpenAI-compatible endpoint (e.g., LiteLLM proxy to Ollama)
    local_openai_base_url: str | None = None
    local_openai_model: str = "ollama/qwen2.5:14b-instruct"
    local_openai_reason_model: str = "ollama/deepseek-r1:32b-qwen-distill-q4_K_M"
    toolfront_base_url: str | None = None
    toolfront_api_token: str | None = None
    toolfront_registry_path: str | None = None
    toolfront_env: str | None = None
    use_toolfront: bool = True
    rollout_autopilot_enabled: bool = False
    notification_queue_size: int = 1000
    notification_retry_limit: int = 3
    notification_retry_delay_seconds: float = 2.0
    notification_cache_ttl_seconds: float = 60.0
    notification_log_failures: bool = True
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None
    scr_linkage_subject: str = "scr.linkage.v1"
    scr_linkage_http_url: str | None = None
    scr_linkage_http_token: str | None = None
    scr_alert_token: str | None = None
    # scrAIv integration (proxy /hr/*)
    scraiv_base_url: str | None = None
    scraiv_api_key: str | None = None
    allowed_cors_origins: list[str] = Field(default_factory=lambda: DEFAULT_CORS_ORIGINS.copy())

    subscription_default_plan: str = "growth"
    subscription_plans: dict[str, dict[str, list[str]]] = Field(
        default_factory=lambda: {
            "starter": {
                "taskr": ["tasks.core", "meetings.core"],
            },
            "growth": {
                "taskr": ["tasks.core", "meetings.core", "flows.core", "billing.export"],
            },
            "enterprise": {
                "taskr": [
                    "tasks.core",
                    "tasks.advanced",
                    "meetings.core",
                    "flows.core",
                    "billing.export",
                ],
            },
        }
    )

    @field_validator("allowed_cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: Any) -> list[str]:
        """Allow env overrides to be either JSON arrays or comma-separated strings."""

        if value is None or value == "":
            return DEFAULT_CORS_ORIGINS.copy()
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return DEFAULT_CORS_ORIGINS.copy()
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
            # Fallback: treat as comma-separated list
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return DEFAULT_CORS_ORIGINS.copy()


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
