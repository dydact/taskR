from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from nats.aio.client import Client as NATS

from app.core.config import settings
from app.core.db import SessionLocal
from app.events.bus import event_bus
from app.events.outbox import EventPublisher
from app.events.sql_outbox import SqlOutboxRepository
from app.routes.health import router as health_router
from app.routes.custom_fields import router as custom_fields_router
from app.routes.analytics import router as analytics_router
from app.routes.docs import router as docs_router
from app.routes.admin import router as admin_router
from app.routes.calendar import router as calendar_router
from app.routes.dashboards import router as dashboards_router
from app.routes.comments import router as comments_router
from app.routes.user_preferences import router as user_preferences_router
from app.routes.subtasks import router as subtasks_router
from app.routes.deptx import router as deptx_router
from app.routes.flows import router as flows_router
from app.routes.chat import router as chat_router
from app.routes.meetings import router as meetings_router
from app.routes.summaries import router as summaries_router
from app.routes.preferences import router as preferences_router
from app.routes.approvals import router as approvals_router
from app.routes.scheduling import router as scheduling_router
from app.routes.metrics import router as metrics_router
from app.routes.integrations import router as integrations_router
from app.routes.hr import router as hr_router
from app.routes.hr_webhooks import router as hr_webhooks_router
from app.routes.tenant_config import router as tenant_config_router
from app.routes.sica import router as sica_router
from app.routes.events import router as events_router
from app.routes.folders import router as folders_router
from app.routes.lists import router as lists_router
from app.routes.spaces import router as spaces_router
from app.routes.tasks import router as tasks_router
from app.services.notifications import notification_service
from common_auth import add_tenant_middleware

nats_client: NATS | None = None
publisher: EventPublisher | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):  # pragma: no cover - wiring code
    global nats_client, publisher
    nats_instance: NATS | None = NATS()
    try:
        await nats_instance.connect(servers=[settings.nats_url])
    except Exception:
        nats_instance = None

    repository = SqlOutboxRepository(SessionLocal)
    publisher = EventPublisher(repository=repository, nats=nats_instance)
    nats_client = nats_instance
    app.state.event_publisher = publisher
    app.state.notification_service = notification_service
    await notification_service.start()
    try:
        yield
    finally:
        await notification_service.stop()
        if nats_instance is not None and nats_instance.is_connected:
            await nats_instance.drain()
            await asyncio.sleep(0.1)


app = FastAPI(title=settings.app_name, lifespan=lifespan)
add_tenant_middleware(app)
if settings.allowed_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
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
app.include_router(analytics_router)
app.include_router(dashboards_router)
app.include_router(deptx_router)
app.include_router(preferences_router)
app.include_router(flows_router)
app.include_router(calendar_router)
app.include_router(meetings_router)
app.include_router(summaries_router)
app.include_router(sica_router)
app.include_router(metrics_router)
app.include_router(admin_router)
app.include_router(scheduling_router)
app.include_router(approvals_router)
app.include_router(integrations_router)
app.include_router(chat_router)
app.include_router(hr_router)
app.include_router(hr_webhooks_router)
app.include_router(tenant_config_router)
