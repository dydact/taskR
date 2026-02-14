from __future__ import annotations

import random
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Iterable, Sequence

from sqlalchemy import cast, select
from sqlalchemy.types import String
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.core import (
    Comment,
    Document,
    DocumentRevision,
    List,
    ListStatus,
    ScheduleTimeline,
    Space,
    Task,
    Tenant,
    User,
)
from app.routes.lists import DEFAULT_STATUSES

FIRST_NAMES = [
    "Alex",
    "Jordan",
    "Taylor",
    "Morgan",
    "Riley",
    "Harper",
    "Casey",
    "Blake",
    "Avery",
    "Quinn",
]

LAST_NAMES = [
    "Anderson",
    "Brooks",
    "Campbell",
    "Diaz",
    "Edwards",
    "Foster",
    "Gray",
    "Hayes",
    "Kennedy",
    "Monroe",
]

SPACE_THEMES = [
    "Client Success",
    "Onboarding Ops",
    "Growth Experiments",
    "HR & Staffing",
    "Finance & Billing",
    "Automation Lab",
    "Product Discovery",
    "Support Queue",
    "Compliance Watch",
    "Marketing Launches",
]

LIST_NAMES = [
    "Pipeline",
    "In Delivery",
    "Review Queue",
    "Escalations",
    "QA Backlog",
    "Sprint Board",
    "Service Tickets",
]

TASK_ACTIONS = [
    "Prepare kickoff deck for",
    "Audit workflow automation for",
    "Draft compliance checklist covering",
    "Collect feedback from",
    "Schedule standing sync with",
    "Review billing entries for",
    "Assemble project brief for",
    "Refine staffing plan for",
    "Compose weekly summary for",
    "Validate guardrail metrics for",
]

COMMENT_TEMPLATES = [
    "Touched base with {name}; awaiting follow-up on open items.",
    "Reviewed latest updates — looks good but tracking one blocker.",
    "Looping in finance for a quick double-check on the numbers.",
    "Pushed a note to the channel; expecting reply tomorrow morning.",
    "Drafted response; can someone confirm before we ship?",
]

DOC_TITLES = [
    "Service Playbook",
    "Client Brief",
    "Runbook",
    "Workflow SOP",
    "Weekly Summary",
    "Retro Notes",
]

PRIORITIES = ["low", "medium", "high", "urgent"]
TASK_STATUSES = ["backlog", "in_progress", "done"]


def _slugify(value: str) -> str:
    slug = "".join(char.lower() if char.isalnum() else "-" for char in value)
    slug = "-".join(filter(None, slug.split("-")))
    return slug or f"item-{uuid.uuid4().hex[:8]}"


def _random_color() -> str:
    return "#" + "".join(random.choices("89ABCDEF0123456789", k=6))


def _random_sentence(min_words: int = 8, max_words: int = 15) -> str:
    choices = [
        "align",
        "optimize",
        "prioritize",
        "synthesize",
        "deliver",
        "enable",
        "document",
        "measure",
        "iterate",
        "prototype",
    ]
    length = random.randint(min_words, max_words)
    sentence = " ".join(random.choices(choices, k=length))
    return sentence.capitalize() + "."


def _random_paragraph(sentences: int = 3) -> str:
    return " ".join(_random_sentence() for _ in range(sentences))


@dataclass
class DemoSeedOptions:
    spaces: int = 3
    lists_per_space: int = 3
    tasks_per_list: int = 10
    comments_per_task: int = 3
    docs_per_space: int = 2
    schedule_entries: int = 6


@dataclass
class DemoSeedResult:
    tenant_id: uuid.UUID
    spaces: int
    lists: int
    tasks: int
    comments: int
    docs: int
    employees: int
    operators: int
    clients: int
    schedule_entries: int


async def _get_or_create_tenant(session: AsyncSession, identifier: str) -> Tenant:
    stmt = select(Tenant).where(
        (Tenant.slug == identifier)
        | (cast(Tenant.tenant_id, String) == identifier)
    )
    result = await session.execute(stmt)
    tenant = result.scalar_one_or_none()
    if tenant is not None:
        return tenant

    tenant = Tenant(
        tenant_id=uuid.uuid4(),
        slug=identifier,
        name=identifier.replace("-", " ").title(),
        status="active",
        org_metadata={},
    )
    session.add(tenant)
    await session.flush()
    return tenant


async def _create_users(
    session: AsyncSession,
    tenant: Tenant,
    *,
    count: int,
    role: str,
    existing_emails: set[str],
) -> list[User]:
    created: list[User] = []
    for _ in range(count):
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        base_email = f"{first}.{last}".lower()
        suffix = random.randint(100, 999)
        email = f"{base_email}{suffix}@example.com"
        while email in existing_emails:
            suffix = random.randint(100, 999)
            email = f"{base_email}{suffix}@example.com"
        existing_emails.add(email)

        user = User(
            user_id=uuid.uuid4(),
            tenant_id=tenant.tenant_id,
            email=email,
            given_name=first,
            family_name=last,
            status="active",
            roles=[role],
            identity_metadata={},
        )
        session.add(user)
        created.append(user)
    await session.flush()
    return created


def _random_description(client: User) -> str:
    paragraphs = [
        f"Client **{client.given_name} {client.family_name}** ({client.email}) requires updated deliverables.",
        _random_paragraph(3),
        "- Coordinate with automation specialists\n- Review guardrail metrics\n- Ship weekly digest",
    ]
    return "\n\n".join(paragraphs)


async def _ensure_list_statuses(
    session: AsyncSession,
    tenant: Tenant,
    list_obj: List,
) -> None:
    stmt = select(ListStatus).where(ListStatus.list_id == list_obj.list_id)
    result = await session.execute(stmt)
    if result.scalars().first():
        return
    for status_payload in DEFAULT_STATUSES:
        status = ListStatus(
            status_id=uuid.uuid4(),
            tenant_id=tenant.tenant_id,
            list_id=list_obj.list_id,
            **status_payload,
        )
        session.add(status)
    await session.flush()


async def populate_demo(
    session: AsyncSession,
    tenant_identifier: str,
    options: DemoSeedOptions,
) -> DemoSeedResult:
    random.seed()

    tenant = await _get_or_create_tenant(session, tenant_identifier)

    existing_email_stmt = select(User.email).where(User.tenant_id == tenant.tenant_id)
    existing = await session.execute(existing_email_stmt)
    existing_emails = {row[0] for row in existing.all()}

    employees = await _create_users(
        session,
        tenant,
        count=max(5, options.tasks_per_list),
        role="employee",
        existing_emails=existing_emails,
    )
    operators = await _create_users(
        session,
        tenant,
        count=3,
        role="operator",
        existing_emails=existing_emails,
    )
    clients = await _create_users(
        session,
        tenant,
        count=max(4, options.tasks_per_list),
        role="client",
        existing_emails=existing_emails,
    )

    spaces_created = 0
    lists_created = 0
    tasks_created = 0
    comments_created = 0
    docs_created = 0

    theme_pool = SPACE_THEMES.copy()
    random.shuffle(theme_pool)

    for idx in range(options.spaces):
        name = theme_pool[idx % len(theme_pool)]
        space = Space(
            space_id=uuid.uuid4(),
            tenant_id=tenant.tenant_id,
            slug=_slugify(f"{name}-{uuid.uuid4().hex[:4]}"),
            name=name,
            description=_random_paragraph(2),
            color=_random_color(),
            icon=random.choice(["target", "zap", "workflow", "briefcase", "cpu"]),
            position=idx * 100,
            status="active",
            metadata_json={
                "owner": random.choice(FIRST_NAMES),
                "category": random.choice(["operations", "client", "internal"]),
            },
        )
        session.add(space)
        await session.flush()
        spaces_created += 1

        list_names = random.sample(LIST_NAMES, k=min(len(LIST_NAMES), options.lists_per_space))
        for list_index in range(options.lists_per_space):
            list_obj = List(
                list_id=uuid.uuid4(),
                tenant_id=tenant.tenant_id,
                space_id=space.space_id,
                folder_id=None,
                name=list_names[list_index % len(list_names)],
                description=_random_paragraph(2),
                position=list_index * 100,
                color=_random_color(),
                default_view=random.choice(["list", "board"]),
                is_archived=False,
                metadata_json={
                    "serviceLine": random.choice(["CX", "Automation", "RevOps", "Compliance"])
                },
            )
            session.add(list_obj)
            await session.flush()
            lists_created += 1
            await _ensure_list_statuses(session, tenant, list_obj)

            for _ in range(options.tasks_per_list):
                client = random.choice(clients)
                assignee = random.choice(employees)
                action = random.choice(TASK_ACTIONS)
                title = f"{action} {client.given_name} {client.family_name}"
                status = random.choice(TASK_STATUSES)
                priority = random.choice(PRIORITIES)
                due_at = datetime.utcnow() + timedelta(days=random.randint(1, 21))
                task = Task(
                    task_id=uuid.uuid4(),
                    tenant_id=tenant.tenant_id,
                    space_id=space.space_id,
                    list_id=list_obj.list_id,
                    title=title,
                    description=_random_description(client),
                    status=status,
                    priority=priority,
                    due_at=due_at,
                    assignee_id=assignee.user_id,
                    created_by_id=random.choice(operators + employees).user_id,
                    metadata_json={
                        "client": {
                            "name": f"{client.given_name} {client.family_name}",
                            "email": client.email,
                            "tier": random.choice(["gold", "platinum", "standard"]),
                        },
                        "effortPoints": random.randint(1, 13),
                        "tags": random.sample(
                            ["automation", "billing", "compliance", "support", "handoff", "insight"],
                            k=random.randint(1, 3),
                        ),
                    },
                )
                session.add(task)
                await session.flush()
                tasks_created += 1

                comment_count = max(0, options.comments_per_task)
                authors_pool: Sequence[User] = employees + operators + clients
                for _ in range(comment_count):
                    author = random.choice(authors_pool)
                    comment = Comment(
                        comment_id=uuid.uuid4(),
                        tenant_id=tenant.tenant_id,
                        task_id=task.task_id,
                        author_id=author.user_id,
                        body=random.choice(COMMENT_TEMPLATES).format(name=f"{author.given_name} {author.family_name}"),
                        mentions=[],
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    )
                    session.add(comment)
                    comments_created += 1

            author = random.choice(employees + operators)
            for _ in range(options.docs_per_space):
                title = f"{random.choice(DOC_TITLES)} - {space.name}"
                doc = Document(
                    doc_id=uuid.uuid4(),
                    tenant_id=tenant.tenant_id,
                    space_id=space.space_id,
                    list_id=None,
                    title=title,
                    slug=_slugify(f"{title}-{uuid.uuid4().hex[:4]}"),
                    summary=_random_paragraph(2),
                    tags=random.sample(["playbook", "client", "ops", "ai"], k=2),
                    metadata_json={},
                    created_by_id=author.user_id,
                    updated_by_id=author.user_id,
                    is_archived=False,
                )
                session.add(doc)
                await session.flush()
                docs_created += 1

                revision = DocumentRevision(
                    revision_id=uuid.uuid4(),
                    tenant_id=tenant.tenant_id,
                    doc_id=doc.doc_id,
                    version=1,
                    title=title,
                    content="\n\n".join(
                        [
                            f"# {title}",
                            _random_paragraph(4),
                            "## Next Steps",
                            "- Review automation coverage",
                            "- Capture open questions",
                            "- Schedule follow-up",
                        ]
                    ),
                    plain_text=None,
                    metadata_json={},
                    created_by_id=author.user_id,
                )
                session.add(revision)

    for _ in range(options.schedule_entries):
        staff_member = random.choice(employees + operators)
        client = random.choice(clients)
        start = datetime.now(UTC) - timedelta(days=random.randint(1, 10), hours=random.randint(0, 6))
        duration = random.choice([45, 60, 75, 90])
        end = start + timedelta(minutes=duration)
        timeline = ScheduleTimeline(
            timeline_id=uuid.uuid4(),
            tenant_id=tenant.tenant_id,
            session_id=uuid.uuid4(),
            patient_id=client.user_id,
            staff_id=staff_member.user_id,
            location_id=None,
            service_type=random.choice(["therapy.session", "workflow.audit", "billing.review"]),
            authorization_id=None,
            cpt_code=random.choice(["97110", "97530", "99213"]),
            modifiers=["GN"],
            scheduled_start=start,
            scheduled_end=end,
            worked_start=start,
            worked_end=end,
            duration_minutes=duration,
            status=random.choice(["worked", "approved", "exported", "submitted", "paid"]),
            payroll_entry_id=None,
            claim_id=None,
            transport_job_id=None,
            metadata_json={
                "staffName": f"{staff_member.given_name} {staff_member.family_name}",
                "clientName": f"{client.given_name} {client.family_name}",
                "service": random.choice(["speech therapy", "billing review", "workflow audit"]),
            },
        )
        session.add(timeline)

    await session.flush()

    return DemoSeedResult(
        tenant_id=tenant.tenant_id,
        spaces=spaces_created,
        lists=lists_created,
        tasks=tasks_created,
        comments=comments_created,
        docs=docs_created,
        employees=len(employees),
        operators=len(operators),
        clients=len(clients),
        schedule_entries=options.schedule_entries,
    )
