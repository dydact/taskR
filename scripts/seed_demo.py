#!/usr/bin/env python3
"""
Seed the taskR development stack with sample data so the React workspace has something to render.

Usage:
    python scripts/seed_demo.py [--api http://localhost:8010] [--tenant demo]
                                [--db postgresql://taskr:taskr@localhost:5432/taskr]
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional

try:
    import psycopg
except ImportError:  # pragma: no cover - runtime guard
    print("psycopg is required. Install it with `pip install psycopg[binary]`.", file=sys.stderr)
    sys.exit(1)

try:
    import requests
except ImportError:
    print("The `requests` package is required. Install it with `pip install requests`.", file=sys.stderr)
    sys.exit(1)

SPACE_DEFINITIONS = [
    {"slug": "automation-lab", "name": "Automation Lab", "color": "#6366F1"},
    {"slug": "client-success", "name": "Client Success", "color": "#22C55E"},
    {"slug": "compliance-watch", "name": "Compliance Watch", "color": "#F97316"},
    {"slug": "finance-billing", "name": "Finance & Billing", "color": "#0EA5E9"},
    {"slug": "growth-experiment", "name": "Growth Experiment", "color": "#A855F7"},
    {"slug": "hr-staffing", "name": "HR & Staffing", "color": "#E11D48"},
    {"slug": "marketing-launch", "name": "Marketing Launch", "color": "#14B8A6"},
    {"slug": "onboarding-ops", "name": "Onboarding Ops", "color": "#F59E0B"},
    {"slug": "product-discovery", "name": "Product Discovery", "color": "#3B82F6"},
    {"slug": "support-queue", "name": "Support Queue", "color": "#9333EA"},
]


APPROX_NOW = datetime.now(timezone.utc)


def log(message: str) -> None:
    print(f"[seed] {message}")


def warn(message: str) -> None:
    print(f"[seed][warn] {message}", file=sys.stderr)


class ApiError(RuntimeError):
    pass


@dataclass
class Config:
    api_base: str
    tenant_slug: str
    headers: Dict[str, str]
    db_url: str


class Seeder:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.session = requests.Session()
        self.session.headers.update(
            {
                "x-tenant-id": config.tenant_slug,
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        self.db_conn = psycopg.connect(config.db_url, autocommit=True)
        self.tenant_id: Optional[uuid.UUID] = None

    # -------------------- Helpers --------------------
    def _request(
        self,
        method: str,
        path: str,
        *,
        json: Any | None = None,
        params: Dict[str, Any] | None = None,
        ok_statuses: Iterable[int] = (200, 201),
    ) -> Any:
        url = f"{self.config.api_base.rstrip('/')}/{path.lstrip('/')}"
        resp = self.session.request(method, url, json=json, params=params, timeout=10)
        if resp.status_code not in ok_statuses:
            raise ApiError(f"{method.upper()} {url} failed ({resp.status_code}): {resp.text}")
        if resp.content:
            return resp.json()
        return None

    def _fetch_existing_tasks(self, space_slug: str) -> Dict[str, dict]:
        page = 1
        items: Dict[str, dict] = {}
        while True:
            data = self._request(
                "get",
                "/tasks",
                params={"space_identifier": space_slug, "page_size": 200, "page": page},
            )
            if not data:
                break
            for item in data:
                items[item["title"]] = item
            if len(data) < 200:
                break
            page += 1
        return items

    # -------------------- Tenant / users --------------------
    def ensure_tenant(self) -> None:
        with self.db_conn.cursor() as cur:
            cur.execute(
                "SELECT tenant_id FROM tr_tenant WHERE slug = %s",
                (self.config.tenant_slug,),
            )
            row = cur.fetchone()
            if row:
                self.tenant_id = row[0]
                log(f"Found tenant '{self.config.tenant_slug}' ({self.tenant_id})")
                return

            new_id = uuid.uuid5(uuid.NAMESPACE_DNS, f"taskr-demo-{self.config.tenant_slug}")
            cur.execute(
                """
                INSERT INTO tr_tenant (tenant_id, slug, name, status)
                VALUES (%s, %s, %s, 'active')
                ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                RETURNING tenant_id
                """,
                (new_id, self.config.tenant_slug, self.config.tenant_slug.title()),
            )
            self.tenant_id = cur.fetchone()[0]
            log(f"Created tenant '{self.config.tenant_slug}' ({self.tenant_id})")

    def upsert_users(self) -> Dict[str, uuid.UUID]:
        assert self.tenant_id is not None
        users = [
            ("cecilia.collins@example.com", "Cecilia", "Collins"),
            ("marco.igwe@example.com", "Marco", "Igwe"),
            ("avery.liang@example.com", "Avery", "Liang"),
        ]
        mapping: Dict[str, uuid.UUID] = {}
        with self.db_conn.cursor() as cur:
            for email, given, family in users:
                cur.execute(
                    """
                    INSERT INTO tr_user (tenant_id, email, given_name, family_name, status)
                    VALUES (%s, %s, %s, %s, 'active')
                    ON CONFLICT (tenant_id, email) DO UPDATE
                        SET given_name = EXCLUDED.given_name,
                            family_name = EXCLUDED.family_name,
                            status = 'active'
                    RETURNING user_id
                    """,
                    (self.tenant_id, email, given, family),
                )
                user_id = cur.fetchone()[0]
                mapping[email] = user_id
                log(f"Ensured user {email} ({user_id})")
        return mapping

    # -------------------- Space & Lists --------------------
    def ensure_space(self, slug: str, name: str) -> dict:
        spaces = self._request("get", "/spaces", params={"page_size": 200})
        for space in spaces:
            if space["slug"] == slug or space["name"] == name:
                log(f"Using existing space '{slug}'")
                return space

        payload = {"slug": slug, "name": name}
        definition = next((item for item in SPACE_DEFINITIONS if item["slug"] == slug), None)
        if definition and definition.get("color"):
            payload["color"] = definition["color"]
        space = self._request("post", "/spaces", json=payload)
        log(f"Created space '{slug}'")
        return space

    def ensure_list(self, space_slug: str, space_id: str, name: str) -> dict:
        lists = self._request("get", f"/lists/spaces/{space_slug}")
        for lst in lists:
            if lst["name"].lower() == name.lower():
                log(f"Using existing list '{name}'")
                return lst

        payload = {"name": name, "default_view": "board", "metadata_json": {}}
        lst = self._request("post", f"/lists/spaces/{space_slug}", json=payload)
        log(f"Created list '{name}'")
        return lst

    def fetch_status_names(self, list_id: str) -> Dict[str, str]:
        statuses = self._request("get", f"/lists/{list_id}/statuses")
        return {item["name"].lower(): item["name"] for item in statuses}

    # -------------------- Tasks / Worklogs --------------------
    def seed_tasks(self, space_slug: str, list_map: Dict[str, dict], status_map: Dict[str, Dict[str, str]], user_map: Dict[str, uuid.UUID]) -> None:
        existing = self._fetch_existing_tasks(space_slug)

        demo_tasks = [
            {
                "title": "Wireframe assistant feedback flow",
                "status": "In Progress",
                "priority": "high",
                "list": "Sprint Backlog",
                "assignee": "cecilia.collins@example.com",
                "due_in_days": 3,
            },
            {
                "title": "Draft analytics dashboard copy",
                "status": "Backlog",
                "priority": "medium",
                "list": "Sprint Backlog",
                "assignee": None,
                "due_in_days": 6,
            },
            {
                "title": "QA autopilot guardrails",
                "status": "In Progress",
                "priority": "urgent",
                "list": "Sprint Backlog",
                "assignee": "marco.igwe@example.com",
                "due_in_days": 1,
            },
            {
                "title": "Publish weekly usage recap",
                "status": "Done",
                "priority": "low",
                "list": "Sprint Backlog",
                "assignee": "avery.liang@example.com",
                "due_in_days": -2,
            },
            {
                "title": "Assemble deptX starter kit",
                "status": "Backlog",
                "priority": "medium",
                "list": "Ready for Review",
                "assignee": None,
                "due_in_days": 5,
            },
            {
                "title": "Tag transcripts for retraining",
                "status": "In Progress",
                "priority": "high",
                "list": "Ready for Review",
                "assignee": "marco.igwe@example.com",
                "due_in_days": 2,
            },
            {
                "title": "Synthesize beta feedback",
                "status": "Done",
                "priority": "medium",
                "list": "Ready for Review",
                "assignee": "cecilia.collins@example.com",
                "due_in_days": -6,
            },
        ]

        created_tasks: Dict[str, str] = {}
        for task in demo_tasks:
            if task["title"] in existing:
                created_tasks[task["title"]] = existing[task["title"]]["task_id"]
                continue

            list_info = list_map[task["list"]]
            statuses = status_map[list_info["list_id"]]
            status_name = statuses.get(task["status"].lower(), task["status"])

            payload = {
                "title": task["title"],
                "list_id": list_info["list_id"],
                "status": status_name,
                "priority": task["priority"],
                "metadata_json": {
                    "source": "seed_demo",
                    "summary": f"Auto-seeded task for {task['list']}",
                },
            }
            if task["assignee"]:
                payload["assignee_id"] = str(user_map[task["assignee"]])
            due_date = APPROX_NOW + timedelta(days=task["due_in_days"])
            payload["due_at"] = due_date.replace(tzinfo=None).isoformat()

            response = self._request("post", "/tasks", json=payload)
            created_tasks[task["title"]] = response["task_id"]
            log(f"Created task '{task['title']}' in {task['list']}")

        # Patch a couple tasks to mark them as Done recently for velocity charts.
        done_titles = ["Publish weekly usage recap", "Synthesize beta feedback"]
        for title in done_titles:
            task_id = created_tasks.get(title) or existing.get(title, {}).get("task_id")
            if not task_id:
                continue
            self._request(
                "patch",
                f"/tasks/{task_id}",
                json={"status": "Done"},
            )

    def seed_worklogs(self, task_titles: Iterable[str], task_map: Dict[str, dict], user_map: Dict[str, uuid.UUID]) -> None:
        assert self.tenant_id is not None
        entries = [
            ("Wireframe assistant feedback flow", "cecilia.collins@example.com", 150),
            ("QA autopilot guardrails", "marco.igwe@example.com", 95),
            ("Tag transcripts for retraining", "marco.igwe@example.com", 80),
            ("Synthesize beta feedback", "avery.liang@example.com", 60),
        ]
        with self.db_conn.cursor() as cur:
            for title, email, minutes in entries:
                task = task_map.get(title)
                user_id = user_map.get(email)
                if not task or not user_id:
                    continue
                cur.execute(
                    "DELETE FROM tr_worklog WHERE tenant_id = %s AND task_id = %s AND user_id = %s",
                    (self.tenant_id, uuid.UUID(task["task_id"]), user_id),
                )
                cur.execute(
                    """
                    INSERT INTO tr_worklog (worklog_id, tenant_id, task_id, user_id, minutes_spent, logged_at, notes, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    """,
                    (
                        uuid.uuid4(),
                        self.tenant_id,
                        uuid.UUID(task["task_id"]),
                        user_id,
                        minutes,
                        APPROX_NOW - timedelta(days=2),
                        "Demo workload entry",
                    ),
                )
                log(f"Logged {minutes} minutes for '{title}' by {email}")

    # -------------------- Preferences --------------------
    def seed_preferences(self, model_slug: str, task_lookup: Dict[str, dict], user_map: Dict[str, uuid.UUID]) -> None:
        models = self._request("get", "/preferences/models")
        model = next((m for m in models if m["slug"] == model_slug), None)
        if not model:
            payload = {
                "slug": model_slug,
                "name": "Assistant Router",
                "base_type": "routing",
                "status": "active",
                "description": "Routes workspace automations based on feedback signals.",
            }
            model = self._request("post", "/preferences/models", json=payload)
            log("Created preference model")
        model_id = model["model_id"]

        variants = self._request("get", f"/preferences/models/{model_id}/variants")
        variant = next((v for v in variants if v["key"] == "beta"), None)
        if not variant:
            payload = {
                "model_id": model_id,
                "key": "beta",
                "name": "Beta Assistant",
                "rollout_rate": 0.35,
                "status": "ramping",
                "metrics_json": {"confidence": 0.72},
            }
            variant = self._request("post", "/preferences/variants", json=payload)
            log("Created preference variant 'beta'")
        variant_id = variant["variant_id"]

        rollouts = self._request("get", f"/preferences/models/{model_id}/rollouts")
        rollout = rollouts[0] if rollouts else None
        if not rollout:
            payload = {
                "model_id": model_id,
                "variant_id": variant_id,
                "stage": "monitor",
                "target_rate": 0.6,
                "current_rate": 0.45,
                "safety_status": "healthy",
            }
            rollout = self._request("post", "/preferences/rollouts", json=payload)
            log("Created preference rollout")

        # Update rollout guardrail metrics for nicer dashboard rendering.
        evaluation_ts = (APPROX_NOW - timedelta(hours=6)).isoformat()
        guardrail_payload = {
            "stage": "monitor",
            "current_rate": 0.58,
            "target_rate": 0.6,
            "safety_status": "healthy",
            "guardrail_metrics": {
                "total_feedback": 42,
                "positive": 33,
                "negative": 9,
                "last_feedback_at": evaluation_ts,
            },
            "metadata_json": {
                "guardrail_evaluation": {
                    "negative_ratio": 0.214,
                    "evaluated_at": evaluation_ts,
                }
            },
        }
        self._request("patch", f"/preferences/rollouts/{rollout['rollout_id']}", json=guardrail_payload)

        existing_feedback = self._request("get", "/preferences/feedback", params={"model_id": model_id})
        if existing_feedback:
            log("Preference feedback already present; skipping feedback seeding")
            return

        feedback_items = [
            ("Wireframe assistant feedback flow", "cecilia.collins@example.com", 1),
            ("Wireframe assistant feedback flow", "marco.igwe@example.com", 1),
            ("QA autopilot guardrails", "marco.igwe@example.com", -1),
            ("Synthesize beta feedback", "avery.liang@example.com", 1),
            ("Tag transcripts for retraining", "marco.igwe@example.com", -1),
            ("Publish weekly usage recap", "cecilia.collins@example.com", 1),
        ]
        for title, email, rating in feedback_items:
            task = task_lookup.get(title)
            payload = {
                "model_id": model_id,
                "variant_id": variant_id if rating > 0 else None,
                "task_id": task["task_id"] if task else None,
                "user_id": str(user_map.get(email)) if user_map.get(email) else None,
                "source": "seed_demo",
                "signal_type": "thumbs",
                "rating": rating,
                "metadata_json": {
                    "task_title": title,
                    "submitted_by": email,
                },
            }
            self._request("post", "/preferences/feedback", json=payload)
        log("Seeded preference feedback")

    # -------------------- Orchestration --------------------
    def run(self) -> None:
        self.ensure_tenant()
        if not self.tenant_id:
            raise RuntimeError("Failed to resolve tenant ID")

        self.dedupe_spaces()
        self.apply_space_definitions()

        user_map = self.upsert_users()
        space = self.ensure_space("workspace", "Workspace Hub")
        lists_to_seed = ["Sprint Backlog", "Ready for Review"]
        list_map: Dict[str, dict] = {}
        status_map: Dict[str, Dict[str, str]] = {}
        for list_name in lists_to_seed:
            lst = self.ensure_list(space["slug"], space["space_id"], list_name)
            list_map[list_name] = lst
            status_map[lst["list_id"]] = self.fetch_status_names(lst["list_id"])

        self.seed_tasks(space["slug"], list_map, status_map, user_map)

        # Reload tasks to get IDs for workload & preference seeding.
        task_lookup = self._fetch_existing_tasks(space["slug"])
        self.seed_worklogs(task_lookup.keys(), task_lookup, user_map)
        self.seed_preferences("assistant-router", task_lookup, user_map)
        self.seed_notifications()
        self.seed_ai_jobs()

        log("Seeding complete. Refresh the frontend to see the demo workspace.")

    def dedupe_spaces(self) -> None:
        assert self.tenant_id is not None
        with self.db_conn.cursor() as cur:
            cur.execute(
                """
                SELECT space_id, slug, name, created_at
                FROM tr_space
                WHERE tenant_id = %s
                ORDER BY created_at ASC
                """,
                (self.tenant_id,),
            )
            rows = cur.fetchall()

        canonical_by_slug = {item["slug"]: item for item in SPACE_DEFINITIONS}
        canonical_by_name = {item["name"]: item for item in SPACE_DEFINITIONS}
        seen_slugs: set[str] = set()

        for space_id, slug, name, _created_at in rows:
            target = canonical_by_slug.get(slug) or canonical_by_name.get(name)
            canonical_slug = target["slug"] if target else slug
            normalized_key = (canonical_slug or "").strip().lower() or (name or "").strip().lower()

            if normalized_key and normalized_key in seen_slugs:
                with self.db_conn.cursor() as cur:
                    cur.execute("DELETE FROM tr_space WHERE space_id = %s", (space_id,))
                    log(f"Removed duplicate space '{name}' ({slug})")
                continue

            if normalized_key:
                seen_slugs.add(normalized_key)
            if slug != canonical_slug:
                with self.db_conn.cursor() as cur:
                    cur.execute(
                        "UPDATE tr_space SET slug = %s, updated_at = NOW() WHERE space_id = %s",
                        (canonical_slug, space_id),
                    )
                    log(f"Renamed space slug {slug} → {canonical_slug}")

            if target and name != target["name"]:
                with self.db_conn.cursor() as cur:
                    cur.execute(
                        "UPDATE tr_space SET name = %s, updated_at = NOW() WHERE space_id = %s",
                        (target["name"], space_id),
                    )

    def apply_space_definitions(self) -> None:
        assert self.tenant_id is not None
        for definition in SPACE_DEFINITIONS:
            space = self.ensure_space(definition["slug"], definition["name"])
            if definition.get("color") and space.get("color") != definition["color"]:
                self._request(
                    "patch",
                    f"/spaces/{space['slug']}",
                    json={"color": definition["color"]},
                )

    def seed_notifications(self) -> None:
        assert self.tenant_id is not None
        events = [
            {
                "event_type": "task.completed",
                "title": "Sprint review updated",
                "body": "Cecilia marked Sprint Review as complete.",
                "cta_path": "/tasks",
                "payload": {"task_id": "demo-sprint-review"},
            },
            {
                "event_type": "insight.weekly_digest",
                "title": "Weekly digest ready",
                "body": "Your weekly automation digest is ready for review.",
                "cta_path": "/insights",
                "payload": {},
            },
        ]
        with self.db_conn.cursor() as cur:
            for event in events:
                cur.execute(
                    """
                    SELECT 1
                    FROM tr_notification
                    WHERE tenant_id = %s AND event_type = %s AND title = %s
                    LIMIT 1
                    """,
                    (self.tenant_id, event["event_type"], event["title"]),
                )
                if cur.fetchone():
                    log(f"Skipping notification '{event['title']}' (already present)")
                    continue
                self._request("post", "/notifications", json=event, ok_statuses=(200, 201))

    def seed_ai_jobs(self) -> None:
        assert self.tenant_id is not None
        jobs = [
            {
                "prompt_id": "demo-summary",
                "status": "succeeded",
                "metadata_json": {"summary": "Authored project summary for Q2 initiative."},
                "result_json": {"document_id": "demo-summary-1"},
            },
            {
                "prompt_id": "demo-rewrite",
                "status": "queued",
                "metadata_json": {"summary": "Rewrite onboarding FAQ"},
            },
        ]
        with self.db_conn.cursor() as cur:
            for job in jobs:
                cur.execute(
                    """
                    SELECT 1
                    FROM tr_ai_job
                    WHERE tenant_id = %s AND coalesce(prompt_id, '') = coalesce(%s, '')
                    LIMIT 1
                    """,
                    (self.tenant_id, job.get("prompt_id")),
                )
                if cur.fetchone():
                    log(f"Skipping AI job seed for prompt '{job.get('prompt_id')}' (already present)")
                    continue
                self._request("post", "/ai/jobs", json=job, ok_statuses=(200, 201))


def parse_args() -> Config:
    parser = argparse.ArgumentParser(description="Seed the taskR dev stack with demo data.")
    parser.add_argument("--api", default=os.environ.get("TASKR_API", "http://localhost:8010"), help="taskR API base URL")
    parser.add_argument("--tenant", default=os.environ.get("TASKR_TENANT", "demo"), help="Tenant slug to seed")
    parser.add_argument(
        "--db",
        default=os.environ.get("TR_DATABASE_URL", "postgresql://taskr:taskr@localhost:5432/taskr"),
        help="Postgres connection string",
    )
    args = parser.parse_args()
    headers = {"x-tenant-id": args.tenant}
    return Config(api_base=args.api, tenant_slug=args.tenant, headers=headers, db_url=args.db)


def main() -> None:
    config = parse_args()
    try:
        seeder = Seeder(config)
        seeder.run()
    except ApiError as exc:
        warn(str(exc))
        sys.exit(1)
    except Exception as exc:  # pragma: no cover - defensive logging
        warn(f"Unexpected error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
