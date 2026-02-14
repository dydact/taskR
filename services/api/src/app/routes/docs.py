from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db_session
from app.events.bus import event_bus
from app.models.core import Document, DocumentRevision, Task
from app.routes.utils import get_list, get_space, get_tenant
from app.schemas import DocCreate, DocRead, DocRevisionCreate, DocRevisionRead, DocUpdate
from app.services.memory import memory_service
from common_auth import TenantHeaders, get_tenant_headers
from doc_ingest import DOCSTRANGE_AVAILABLE, extract_text_async

router = APIRouter(prefix="/docs", tags=["docs"])


async def _ensure_unique_slug(
    session: AsyncSession,
    tenant_id: uuid.UUID,
    slug: str,
    doc_id: uuid.UUID | None = None,
) -> None:
    query = select(Document).where(Document.tenant_id == tenant_id, Document.slug == slug)
    if doc_id is not None:
        query = query.where(Document.doc_id != doc_id)
    existing = await session.execute(query)
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slug already in use")


async def _serialize_doc(doc: Document, *, include_content: bool = False) -> DocRead:
    latest: DocumentRevision | None = None
    revisions = getattr(doc, "revisions", None)
    if revisions:
        latest = max(revisions, key=lambda rev: rev.version)
    update: dict[str, object] = {}
    if latest is not None:
        update["current_revision_id"] = latest.revision_id
        update["current_revision_version"] = latest.version
        if include_content:
            update["content"] = latest.content
    elif include_content:
        update["content"] = ""
    base = DocRead.model_validate(doc)
    return base.model_copy(update=update)


async def _serialize_revision(revision: DocumentRevision) -> DocRevisionRead:
    return DocRevisionRead.model_validate(revision)


@router.get("", response_model=list[DocRead])
async def list_docs(
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
    space_identifier: str | None = Query(default=None),
    list_id: uuid.UUID | None = Query(default=None),
    include_archived: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> list[DocRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    query = (
        select(Document)
        .options(selectinload(Document.revisions))
        .where(Document.tenant_id == tenant.tenant_id)
    )

    if space_identifier is not None:
        space = await get_space(session, tenant.tenant_id, space_identifier)
        query = query.where(Document.space_id == space.space_id)
    if list_id is not None:
        list_obj = await get_list(session, tenant.tenant_id, list_id)
        query = query.where(Document.list_id == list_obj.list_id)
    if not include_archived:
        query = query.where(Document.is_archived.is_(False))

    query = query.order_by(Document.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(query)
    docs = result.scalars().all()
    return [await _serialize_doc(doc) for doc in docs]


@router.post("", response_model=DocRead, status_code=status.HTTP_201_CREATED)
async def create_doc(
    payload: DocCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DocRead:
    tenant = await get_tenant(session, headers.tenant_id)
    space_id = None
    list_id = None
    if payload.space_id is not None:
        space = await get_space(session, tenant.tenant_id, str(payload.space_id))
        space_id = space.space_id
    if payload.list_id is not None:
        list_obj = await get_list(session, tenant.tenant_id, payload.list_id)
        list_id = list_obj.list_id
        if space_id is None:
            space_id = list_obj.space_id

    await _ensure_unique_slug(session, tenant.tenant_id, payload.slug)

    extraction = None
    if payload.text:
        extraction = {
            "content": payload.text,
            "metadata": {},
        }
    elif payload.payload_base64:
        extraction = await extract_text_async(
            payload_base64=payload.payload_base64,
            text=payload.text,
            content_type=payload.content_type,
            filename=payload.filename or "upload.txt",
        )
    else:
        extraction = {"content": "", "metadata": {}}

    doc = Document(
        tenant_id=tenant.tenant_id,
        space_id=space_id,
        list_id=list_id,
        title=payload.title,
        slug=payload.slug,
        summary=payload.summary,
        metadata_json=payload.metadata_json,
        tags=payload.tags,
        created_by_id=payload.created_by_id,
        updated_by_id=payload.created_by_id,
        is_archived=payload.is_archived,
    )
    session.add(doc)
    await session.flush()

    revision = DocumentRevision(
        tenant_id=tenant.tenant_id,
        doc_id=doc.doc_id,
        version=1,
        title=payload.title,
        content=extraction.get("content", ""),
        plain_text=extraction.get("metadata", {}).get("plain_text"),
        metadata_json=extraction.get("metadata", {}),
        created_by_id=payload.created_by_id,
    )
    session.add(revision)
    await session.flush()

    await session.refresh(doc, attribute_names=["revisions"])
    serialized = await _serialize_doc(doc, include_content=True)
    await event_bus.publish(
        {
            "type": "doc.created",
            "tenant_id": headers.tenant_id,
            "doc_id": str(doc.doc_id),
            "payload": serialized.model_dump(),
        }
    )
    await memory_service.enqueue(
        tenant.tenant_id,
        "doc",
        doc.doc_id,
        session=session,
    )
    return serialized


@router.get("/{doc_id}", response_model=DocRead)
async def get_doc(
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DocRead:
    tenant = await get_tenant(session, headers.tenant_id)
    doc = await session.get(
        Document,
        doc_id,
        options=[selectinload(Document.revisions)],
    )
    if doc is None or doc.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doc not found")
    return await _serialize_doc(doc, include_content=True)


@router.patch("/{doc_id}", response_model=DocRead)
async def update_doc(
    doc_id: uuid.UUID,
    payload: DocUpdate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DocRead:
    tenant = await get_tenant(session, headers.tenant_id)
    doc = await session.get(Document, doc_id)
    if doc is None or doc.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doc not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "slug" in update_data and update_data["slug"]:
        await _ensure_unique_slug(session, tenant.tenant_id, update_data["slug"], doc_id=doc.doc_id)
    if "space_id" in update_data and update_data["space_id"] is not None:
        space = await get_space(session, tenant.tenant_id, str(update_data["space_id"]))
        update_data["space_id"] = space.space_id
    if "list_id" in update_data and update_data["list_id"] is not None:
        list_obj = await get_list(session, tenant.tenant_id, update_data["list_id"])
        update_data["list_id"] = list_obj.list_id
        if update_data.get("space_id") is None:
            update_data["space_id"] = list_obj.space_id

    for field, value in update_data.items():
        setattr(doc, field, value)

    await session.flush()
    await session.refresh(doc, attribute_names=["revisions"])
    serialized = await _serialize_doc(doc, include_content=True)
    await event_bus.publish(
        {
            "type": "doc.updated",
            "tenant_id": headers.tenant_id,
            "doc_id": str(doc.doc_id),
            "payload": serialized.model_dump(),
        }
    )
    await memory_service.enqueue(
        tenant.tenant_id,
        "doc",
        doc.doc_id,
        session=session,
    )
    return serialized


@router.get("/tasks/{task_id}", response_model=list[DocRead])
async def list_docs_for_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DocRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    task = await session.get(Task, task_id)
    if task is None or task.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    query = (
        select(Document)
        .options(selectinload(Document.revisions))
        .where(Document.tenant_id == tenant.tenant_id)
    )
    if task.list_id is not None:
        query = query.where(Document.list_id == task.list_id)
    elif task.space_id is not None:
        query = query.where(Document.space_id == task.space_id)
    else:
        query = query.where(Document.list_id.is_(None), Document.space_id.is_(None))

    result = await session.execute(query.order_by(Document.updated_at.desc()).limit(50))
    docs = result.scalars().all()
    return [await _serialize_doc(doc) for doc in docs]


@router.delete("/{doc_id}", status_code=status.HTTP_200_OK)
async def delete_doc(
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> None:
    tenant = await get_tenant(session, headers.tenant_id)
    doc = await session.get(Document, doc_id)
    if doc is None or doc.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doc not found")
    await session.delete(doc)
    await session.flush()
    await event_bus.publish(
        {
            "type": "doc.deleted",
            "tenant_id": headers.tenant_id,
            "doc_id": str(doc_id),
        }
    )


@router.get("/{doc_id}/revisions", response_model=list[DocRevisionRead])
async def list_revisions(
    doc_id: uuid.UUID,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> list[DocRevisionRead]:
    tenant = await get_tenant(session, headers.tenant_id)
    doc = await session.get(Document, doc_id)
    if doc is None or doc.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doc not found")

    result = await session.execute(
        select(DocumentRevision)
        .where(DocumentRevision.tenant_id == tenant.tenant_id, DocumentRevision.doc_id == doc.doc_id)
        .order_by(DocumentRevision.version.desc())
    )
    revisions = result.scalars().all()
    return [await _serialize_revision(rev) for rev in revisions]


@router.post("/{doc_id}/revisions", response_model=DocRevisionRead, status_code=status.HTTP_201_CREATED)
async def create_revision(
    doc_id: uuid.UUID,
    payload: DocRevisionCreate,
    session: AsyncSession = Depends(get_db_session),
    headers: TenantHeaders = Depends(get_tenant_headers),
) -> DocRevisionRead:
    tenant = await get_tenant(session, headers.tenant_id)
    doc = await session.get(Document, doc_id, options=[selectinload(Document.revisions)])
    if doc is None or doc.tenant_id != tenant.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doc not found")

    extraction = None
    if payload.text:
        extraction = {"content": payload.text, "metadata": {}}
    elif payload.payload_base64:
        extraction = await extract_text_async(
            payload_base64=payload.payload_base64,
            text=payload.text,
            content_type=payload.content_type,
            filename=payload.filename or "upload.txt",
        )
    else:
        extraction = {"content": "", "metadata": {}}

    next_version = max((rev.version for rev in doc.revisions), default=0) + 1

    revision = DocumentRevision(
        tenant_id=tenant.tenant_id,
        doc_id=doc.doc_id,
        version=next_version,
        title=payload.title or doc.title,
        content=extraction.get("content", ""),
        plain_text=extraction.get("metadata", {}).get("plain_text"),
        metadata_json=extraction.get("metadata", {}),
        created_by_id=payload.created_by_id,
    )
    session.add(revision)
    doc.updated_by_id = payload.created_by_id or doc.updated_by_id
    doc.title = revision.title
    doc.updated_at = revision.created_at

    await session.flush()
    await session.refresh(revision)

    result = await _serialize_revision(revision)
    await event_bus.publish(
        {
            "type": "doc.revision.created",
            "tenant_id": headers.tenant_id,
            "doc_id": str(doc.doc_id),
            "revision_id": str(revision.revision_id),
            "payload": result.model_dump(),
        }
    )
    await memory_service.enqueue(
        tenant.tenant_id,
        "doc",
        doc.doc_id,
        session=session,
    )
    return result
