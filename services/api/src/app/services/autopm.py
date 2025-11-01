from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.events.bus import event_bus
from app.models.core import AutoPMSuggestion, FlowRun, Task
from app.services.approvals import enqueue_suggestion
from app.services.insight import summarize_autopm


async def generate_suggestions(
    session: AsyncSession,
    run: FlowRun,
    lookback_hours: int = 24,
    limit: int = 20,
) -> list[AutoPMSuggestion]:
    cutoff = datetime.now(UTC) - timedelta(hours=lookback_hours)
    query = (
        select(Task)
        .where(
            Task.tenant_id == run.tenant_id,
            Task.status.not_in(["done", "completed", "archived"]),
            (Task.due_at.is_not(None)) & (Task.due_at < cutoff),
        )
        .order_by(Task.due_at)
        .limit(limit)
    )
    result = await session.execute(query)
    tasks = result.scalars().all()

    suggestions: list[AutoPMSuggestion] = []
    pending_approvals: list[tuple[AutoPMSuggestion, str | None]] = []
    for task in tasks:
        due_at_iso = task.due_at.isoformat() if task.due_at else None
        context = {
            "status": task.status,
            "priority": task.priority,
        }
        if task.metadata_json:
            assignee = task.metadata_json.get("assignee_name") or task.metadata_json.get("assignee_email")
            if assignee:
                context["assignee"] = assignee
        summary_result = await summarize_autopm(str(run.tenant_id), task.title, due_at_iso, context)
        summary_meta = {
            "source": summary_result.source,
            "generated_at": datetime.now(UTC).isoformat(),
        }
        suggestion_metadata = {
            "task_status": task.status,
            "task_priority": task.priority,
            "due_at": due_at_iso,
            "insight_context": context,
            "summary": summary_meta,
        }
        suggestion = AutoPMSuggestion(
            tenant_id=run.tenant_id,
            flow_run_id=run.run_id,
            task_id=task.task_id,
            title=f"Follow up on overdue task: {task.title}",
            details=summary_result.text,
            status="proposed",
            metadata_json=suggestion_metadata,
        )
        session.add(suggestion)
        suggestions.append(suggestion)

        if (task.priority or "").lower() in {"high", "urgent"}:
            pending_approvals.append((suggestion, "high_priority_task"))

    await session.flush()

    if pending_approvals:
        for suggestion, reason in pending_approvals:
            approval = await enqueue_suggestion(
                session,
                suggestion,
                source="autopm",
                reason=reason,
            )
            suggestion.metadata_json = {
                **(suggestion.metadata_json or {}),
                "approval_queue_id": str(approval.approval_id),
            }
        await session.flush()

    for suggestion in suggestions:
        summary_meta = (suggestion.metadata_json or {}).get("summary") or {}
        await event_bus.publish(
            {
                "type": "autopm.suggestion.created",
                "tenant_id": str(run.tenant_id),
                "flow_run_id": str(run.run_id),
                "suggestion_id": str(suggestion.suggestion_id),
                "payload": {
                    "task_id": str(suggestion.task_id) if suggestion.task_id else None,
                    "title": suggestion.title,
                    "summary_source": summary_meta.get("source"),
                    "approval_queue_id": (suggestion.metadata_json or {}).get("approval_queue_id"),
                },
            }
        )

    return suggestions
