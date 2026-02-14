from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from nats.aio.client import Client as NATS

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.migrations import apply_migrations
from app.events.outbox import EventPublisher
from app.events.sql_outbox import SqlOutboxRepository
from app.events.exo_consumer import ExoAssignmentConsumer
from app.routes.health import router as health_router
from app.routes.custom_fields import router as custom_fields_router
from app.routes.analytics import router as analytics_router
from app.routes.docs import router as docs_router
from app.routes.claims import router as claims_router
from app.routes.admin import router as admin_router
from app.routes.calendar import router as calendar_router
from app.routes.dashboards import router as dashboards_router
from app.routes.comments import router as comments_router
from app.routes.user_preferences import router as user_preferences_router
from app.routes.subtasks import router as subtasks_router
from app.routes.deptx import router as deptx_router
from app.routes.flows import router as flows_router
from app.routes.chat import router as chat_router
from app.routes.assistant import router as assistant_router
from app.routes.meetings import router as meetings_router
from app.routes.summaries import router as summaries_router
from app.routes.notifications import router as notifications_router
from app.routes.ai import router as ai_router
from app.routes.insights import router as insights_router
from app.routes.preferences import router as preferences_router
from app.routes.profile import router as profile_router
from app.routes.approvals import router as approvals_router
from app.routes.scheduling import router as scheduling_router
from app.routes.metrics import router as metrics_router
from app.routes.integrations import router as integrations_router
from app.routes.hr import router as hr_router
from app.routes.hr_views import router as hr_views_router
from app.routes.hr_webhooks import router as hr_webhooks_router
from app.routes.tenant_config import router as tenant_config_router
from app.routes.sica import router as sica_router
from app.routes.events import router as events_router
from app.routes.folders import router as folders_router
from app.routes.lists import router as lists_router
from app.routes.spaces import router as spaces_router
from app.routes.tasks import router as tasks_router
from app.routes.bridge import router as bridge_router
from app.routes.dedicated import router as dedicated_router
from app.services.notifications import notification_service
from app.services.memory import memory_service
from common_auth import add_tenant_middleware

nats_client: NATS | None = None
publisher: EventPublisher | None = None
exo_consumer: ExoAssignmentConsumer | None = None
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - wiring code
    global nats_client, publisher, exo_consumer
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, apply_migrations)
    nats_instance: NATS | None = NATS()
    try:
        await nats_instance.connect(servers=[settings.nats_url])
    except Exception:
        nats_instance = None

    repository = SqlOutboxRepository(SessionLocal)
    publisher = EventPublisher(repository=repository, nats=nats_instance)
    nats_client = nats_instance
    exo_consumer = ExoAssignmentConsumer()
    app.state.event_publisher = publisher
    app.state.notification_service = notification_service
    app.state.memory_service = memory_service
    await notification_service.start()
    await memory_service.start()
    if exo_consumer is not None:
        try:
            await exo_consumer.start(nats_instance)
        except Exception:
            logger.exception("Failed to start Exo assignment consumer")
    try:
        yield
    finally:
        if exo_consumer is not None:
            await exo_consumer.stop()
            exo_consumer = None
        await notification_service.stop()
        await memory_service.stop()
        if nats_instance is not None and nats_instance.is_connected:
            await nats_instance.drain()
            await asyncio.sleep(0.1)


app = FastAPI(title=settings.app_name, lifespan=lifespan)
add_tenant_middleware(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_cors_origins or ["http://localhost", "https://localhost"],
    allow_origin_regex=settings.allowed_cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(spaces_router)
app.include_router(folders_router)
app.include_router(lists_router)
app.include_router(tasks_router)
app.include_router(events_router)
app.include_router(comments_router)
app.include_router(user_preferences_router)
app.include_router(subtasks_router)
app.include_router(custom_fields_router)
app.include_router(docs_router)
app.include_router(claims_router)
app.include_router(analytics_router)
app.include_router(ai_router)
app.include_router(dashboards_router)
from app.routes.scheduling import router as scheduling_router
app.include_router(preferences_router)
app.include_router(profile_router)
app.include_router(flows_router)
app.include_router(calendar_router)
app.include_router(meetings_router)
app.include_router(summaries_router)
app.include_router(insights_router)
app.include_router(sica_router)
app.include_router(metrics_router)
app.include_router(admin_router)
app.include_router(scheduling_router)
app.include_router(approvals_router)
app.include_router(integrations_router)
app.include_router(chat_router)
app.include_router(assistant_router)
app.include_router(hr_views_router)
app.include_router(hr_router)
app.include_router(hr_webhooks_router)
app.include_router(tenant_config_router)
app.include_router(bridge_router)
app.include_router(dedicated_router)
app.include_router(notifications_router)
app.include_router(deptx_router)
