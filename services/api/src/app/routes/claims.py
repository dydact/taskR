from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.deps import get_db_session
from app.routes.utils import get_tenant
from app.schemas import ClaimEventRead, ClaimListResponse
from common_auth import TenantHeaders, get_tenant_headers

router = APIRouter(prefix="/v1", tags=["claims"])

_SAMPLE_CLAIMS = [
    {
        "claim_id": "CLM-1001",
        "status": "submitted",
        "payer": "United Healthcare",
        "patient": "Morgan Gray",
        "amount": 154250,
        "updated_at": "2025-11-10T15:20:00Z",
        "created_at": "2025-11-08T12:00:00Z",
    },
    {
        "claim_id": "CLM-1002",
        "status": "in-review",
        "payer": "Aetna",
        "patient": "Harper Kennedy",
        "amount": 98250,
        "updated_at": "2025-11-11T09:15:00Z",
        "created_at": "2025-11-09T08:30:00Z",
    },
    {
        "claim_id": "CLM-1003",
        "status": "paid",
        "payer": "Blue Shield",
        "patient": "Avery Edwards",
        "amount": 128500,
        "updated_at": "2025-11-05T10:45:00Z",
        "created_at": "2025-11-02T14:10:00Z",
    },
]

_SAMPLE_EVENTS = {
    "CLM-1001": [
        {
            "timestamp": "2025-11-08T12:00:00Z",
            "status": "submitted",
            "description": "Claim submitted by Morgan Gray",
        },
        {
            "timestamp": "2025-11-10T15:20:00Z",
            "status": "in-review",
            "description": "Payer requested additional documentation",
        },
    ],
    "CLM-1002": [
        {
            "timestamp": "2025-11-09T08:30:00Z",
            "status": "submitted",
            "description": "Claim submitted by Harper Kennedy",
        },
        {
            "timestamp": "2025-11-11T09:15:00Z",
            "status": "in-review",
            "description": "Case analyst assigned",
        },
    ],
    "CLM-1003": [
        {
            "timestamp": "2025-11-02T14:10:00Z",
            "status": "submitted",
            "description": "Claim submitted by Avery Edwards",
        },
        {
            "timestamp": "2025-11-05T10:45:00Z",
            "status": "paid",
            "description": "Payment received",
        },
    ],
}


@router.get("/claims", response_model=ClaimListResponse)
async def list_claims(
    search: str | None = None,
    headers: TenantHeaders = Depends(get_tenant_headers),
    session=Depends(get_db_session),
) -> ClaimListResponse:
    await get_tenant(session, headers.tenant_id)
    items = _SAMPLE_CLAIMS
    if search:
        term = search.lower()
        items = [
            claim
            for claim in _SAMPLE_CLAIMS
            if term in (claim.get("claim_id", "").lower())
            or term in (claim.get("payer", "").lower())
            or term in (claim.get("patient", "").lower())
            or term in (claim.get("status", "").lower())
        ]
    return ClaimListResponse(data=items, meta={"count": len(items)})


@router.get("/scr/api/claims/{claim_id}/events", response_model=list[ClaimEventRead])
async def list_claim_events(
    claim_id: str,
    headers: TenantHeaders = Depends(get_tenant_headers),
    session=Depends(get_db_session),
) -> list[ClaimEventRead]:
    await get_tenant(session, headers.tenant_id)
    return [ClaimEventRead(**event) for event in _SAMPLE_EVENTS.get(claim_id, [])]
