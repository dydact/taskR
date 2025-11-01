from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import FlowRun, FlowTemplate
from app.metrics import observe_flow_run_duration, record_flow_run_transition


@dataclass(frozen=True)
class FlowValidationError(Exception):
    message: str


def validate_flow_definition(payload: dict[str, Any]) -> None:
    nodes = payload.get("nodes")
    edges = payload.get("edges")
    if not isinstance(nodes, list) or not nodes:
        raise FlowValidationError("Flow definition must include at least one node")
    ids = {node.get("id") for node in nodes if isinstance(node, dict)}
    if None in ids or "" in ids:
        raise FlowValidationError("Each node requires an id")

    adjacency: dict[str, list[str]] = {node_id: [] for node_id in ids}
    for edge in edges or []:
        if not isinstance(edge, dict):
            continue
        source = edge.get("from")
        target = edge.get("to")
        if source not in ids or target not in ids:
            raise FlowValidationError("Edge references unknown node")
        adjacency[target].append(source)

    visited: set[str] = set()
    stack: set[str] = set()

    def visit(node_id: str) -> None:
        if node_id in stack:
            raise FlowValidationError("Flow definition contains a cycle")
        if node_id in visited:
            return
        stack.add(node_id)
        for child in adjacency.get(node_id, []):
            visit(child)
        stack.remove(node_id)
        visited.add(node_id)

    for node_id in ids:
        visit(node_id)


async def start_flow_run(
    session: AsyncSession,
    template: FlowTemplate,
    context: dict[str, Any] | None = None,
) -> FlowRun:
    run = FlowRun(
        tenant_id=template.tenant_id,
        template_id=template.template_id,
        status="running",
        context_json=context or {},
        started_at=datetime.now(UTC),
    )
    session.add(run)
    await session.flush()
    await session.refresh(run)
    record_flow_run_transition(template.tenant_id, "running")
    return run
