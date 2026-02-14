#!/usr/bin/env python3
"""Seed a demo tenant/space/task hierarchy for alpha testing."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Sequence

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models.core import List, ListStatus, Space, Task, Tenant, User

TENANT_SLUG = "alpha-demo"
USER_EMAIL = "alpha.ops@dydact.io"

SPACE_DEFINITIONS = [
    {
        "slug": "operations",
        "name": "Operations Control",
        "lists": [
            {
                "name": "Inbox",
                "default_view": "list",
                "statuses": [
                    ("New", "incoming"),
                    ("In Progress", "active"),
                    ("Done", "done"),
                ],
                "tasks": [
                    ("Confirm vendor onboarding", "New"),
                    ("Prepare weekly ops digest", "In Progress"),
                ],
            },
            {
                "name": "Sprint Board",
                "default_view": "board",
                "statuses": [
                    ("Backlog", "backlog"),
                    ("Doing", "active"),
                    ("Complete", "done"),
                ],
                "tasks": [
                    ("Improve handoff playbook", "Backlog"),
                    ("Automate status exports", "Doing"),
                ],
            },
        ],
    },
    {
        "slug": "go-to-market",
        "name": "Go To Market",
        "lists": [
            {
                "name": "Launch Readiness",
                "default_view": "list",
                "statuses": [
                    ("Plan", "planning"),
                    ("Ready", "active"),
                    ("Launched", "done"),
                ],
                "tasks": [
                    ("Collect alpha feedback", "Plan"),
                    ("Prepare launch narrative", "Ready"),
                    ("Update pricing sheet", "Launched"),
                ],
            }
        ],
    },
]


async def seed() -> None:
    async with SessionLocal() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.slug == TENANT_SLUG))
        if tenant is None:
            tenant = Tenant(slug=TENANT_SLUG, name="Alpha Demo Tenant")
            session.add(tenant)
            await session.flush()
            print(f"Created tenant {TENANT_SLUG}")
        else:
            print(f"Tenant {TENANT_SLUG} already exists; updating demo data.")

        user = await session.scalar(
            select(User).where(User.tenant_id == tenant.tenant_id, User.email == USER_EMAIL)
        )
        if user is None:
            user = User(
                tenant_id=tenant.tenant_id,
                email=USER_EMAIL,
                given_name="Alpha",
                family_name="Operator",
                roles=["workspace.manage", "tasks.manage"],
            )
            session.add(user)
            await session.flush()

        for space_def in SPACE_DEFINITIONS:
            space = await _get_or_create_space(session, tenant.tenant_id, space_def)
            for list_def in space_def["lists"]:
                list_obj = await _get_or_create_list(session, tenant.tenant_id, space.space_id, list_def)
                statuses = await _ensure_statuses(session, tenant.tenant_id, list_obj.list_id, list_def["statuses"])
                await _ensure_tasks(
                    session,
                    tenant.tenant_id,
                    space.space_id,
                    list_obj.list_id,
                    list_def["tasks"],
                    statuses,
                    user.user_id,
                )

        await session.commit()
        print("Alpha workspace seeded.")


async def _get_or_create_space(session, tenant_id, definition):
    space = await session.scalar(
        select(Space).where(Space.tenant_id == tenant_id, Space.slug == definition["slug"])
    )
    if space is None:
        space = Space(
            tenant_id=tenant_id,
            slug=definition["slug"],
            name=definition["name"],
            description="Demo space for alpha usage",
            color="#6C5DD3",
        )
        session.add(space)
        await session.flush()
    return space


async def _get_or_create_list(session, tenant_id, space_id, definition):
    list_obj = await session.scalar(
        select(List).where(
            List.tenant_id == tenant_id,
            List.space_id == space_id,
            List.name == definition["name"],
        )
    )
    if list_obj is None:
        list_obj = List(
            tenant_id=tenant_id,
            space_id=space_id,
            name=definition["name"],
            default_view=definition.get("default_view", "list"),
        )
        session.add(list_obj)
        await session.flush()
    return list_obj


async def _ensure_statuses(session, tenant_id, list_id, statuses: Sequence[tuple[str, str]]):
    existing = {
        status.name: status
        for status in await session.scalars(
            select(ListStatus).where(ListStatus.tenant_id == tenant_id, ListStatus.list_id == list_id)
        )
    }
    created = {}
    for position, (name, category) in enumerate(statuses):
        status = existing.get(name)
        if status is None:
            status = ListStatus(
                tenant_id=tenant_id,
                list_id=list_id,
                name=name,
                category=category,
                position=position,
                is_done=category == "done",
            )
            session.add(status)
            await session.flush()
        created[name] = status
    return created


async def _ensure_tasks(session, tenant_id, space_id, list_id, tasks, statuses, user_id):
    for index, (title, status_name) in enumerate(tasks):
        task = await session.scalar(
            select(Task).where(
                Task.tenant_id == tenant_id,
                Task.list_id == list_id,
                Task.title == title,
            )
        )
        if task is None:
            due_at = datetime.now(UTC) + timedelta(days=index + 1)
            task = Task(
                tenant_id=tenant_id,
                space_id=space_id,
                list_id=list_id,
                title=title,
                status=status_name.lower().replace(" ", "_"),
                priority="medium",
                due_at=due_at,
                assignee_id=user_id,
                created_by_id=user_id,
            )
            session.add(task)


if __name__ == "__main__":
    asyncio.run(seed())
