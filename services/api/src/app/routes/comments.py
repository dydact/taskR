from __future__ import annotations

import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db_session
from app.models.core import ActivityEvent, Comment, Task
from app.routes.utils import get_tenant
from app.schemas import CommentCreate, CommentRead
from app.services.notifications import NotificationEvent, notification_service
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/comments", tags=["comments"])

_MENTION_REGEX = re.compile(r"@([a-zA-Z0-9._-]+)")


def _extract_mentions(body: str) -> list[str]:
    if not body:
        return []
    matches = _MENTION_REGEX.findall(body)
    mentions = []
    seen = set()
    for item in matches:
        if not item:
            continue
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        mentions.append(normalized)
    return mentions


async def _get_task_for_tenant(session: AsyncSession, tenant_id: uuid.UUID, task_id: uuid.UUID) -> Task:
    task = await session.get(Task, task_id)
    if task is None or task.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return task


@router.get("/tasks/{task_id}", response_model=list[CommentRead])
async def list_task_comments(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[CommentRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    await _get_task_for_tenant(session, tenant.tenant_id, task_id)

    query = (
        select(Comment)
        .where(Comment.tenant_id == tenant.tenant_id, Comment.task_id == task_id)
        .order_by(Comment.created_at.asc())
    )
    result = await session.execute(query)
    comments = result.scalars().all()
    return [CommentRead.model_validate(comment) for comment in comments]


@router.post("", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def create_comment(
    payload: CommentCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> CommentRead:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await _get_task_for_tenant(session, tenant.tenant_id, payload.task_id)

    detected_mentions = _extract_mentions(payload.body)
    mentions = [mention for mention in dict.fromkeys([*(payload.mentions or []), *detected_mentions]) if mention]

    comment = Comment(
        tenant_id=tenant.tenant_id,
        task_id=task.task_id,
        author_id=payload.author_id,
        body=payload.body,
        mentions=mentions,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    session.add(comment)
    await session.flush()
    await session.refresh(comment)
    if mentions:
        snippet = payload.body.strip()
        if len(snippet) > 220:
            snippet = f"{snippet[:217]}..."
        payload_data = {
            "task_id": str(task.task_id),
            "task_title": task.title,
            "comment_id": str(comment.comment_id),
            "author_id": str(payload.author_id) if payload.author_id else None,
            "mentions": mentions,
            "snippet": snippet,
            "cta_path": f"/tasks/{task.task_id}",
        }
        session.add(
            ActivityEvent(
                tenant_id=tenant.tenant_id,
                task_id=task.task_id,
                actor_id=payload.author_id,
                event_type="comment.mention",
                payload=payload_data,
            )
        )
        await notification_service.enqueue(
            NotificationEvent(
                tenant_id=tenant.tenant_id,
                event_type="comment.mention",
                payload=payload_data,
            )
        )
    return CommentRead.model_validate(comment)
