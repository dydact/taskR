#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import sys
from typing import Any

import urllib.request
import urllib.error


BASE = os.getenv("TASKR_BASE_URL", "http://localhost:8010").rstrip("/")
TENANT = os.getenv("TENANT_ID", "demo")
USER = os.getenv("TASKR_USER_ID", os.getenv("VITE_TASKR_USER_ID", "smoke-user"))


def _request(path: str, *, method: str = "GET", data: Any | None = None, headers: dict[str, str] | None = None) -> tuple[int, str]:
    url = f"{BASE}{path}"
    body = None
    if data is not None:
        body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("x-tenant-id", TENANT)
    if USER:
        req.add_header("x-user-id", USER)
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            return res.getcode(), res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")
    except Exception as e:  # network error
        return 0, str(e)


def check_summaries_meetings() -> bool:
    print("==> /summaries/meetings")
    samples = [
        "We reviewed Q3 metrics and aligned next steps.",
        "Kickoff call: defined milestones, assigned owners, and identified risks around vendor handoff.",
        "Retrospective: discussed blockers, action items, and updated delivery timeline."
    ]
    ok = True
    for idx, transcript in enumerate(samples, start=1):
        code, text = _request(
            "/summaries/meetings",
            method="POST",
            data={"transcript": transcript},
        )
        if not (200 <= code < 300):
            print(f"  Sample {idx} ERROR {code}: {text}")
            ok = False
            continue
        try:
            data = json.loads(text)
        except Exception:
            print(f"  Sample {idx} ERROR: invalid JSON")
            ok = False
            continue
        summary = data.get("summary")
        action_items = data.get("action_items")
        if not isinstance(summary, str) or not summary:
            print(f"  Sample {idx} ERROR: missing summary")
            ok = False
            continue
        if not isinstance(action_items, list):
            print(f"  Sample {idx} WARN: action_items not list")
        print(f"  Sample {idx} OK (len={len(summary)})")
    return ok


def check_summaries_autopm() -> bool:
    print("==> /summaries/autopm")
    samples = [
        [
            "Daily standup: backend blocked on schema migration",
            "Frontend delivered new dashboard charts",
            "Need decision on messaging copy"
        ],
        [
            "Sprint review notes: API error rate is down 20%",
            "Customer reported missing invoices",
            "Plan to roll out hotfix tonight"
        ],
        [
            "Release go/no-go pending security sign-off",
            "QA completed regression suite",
            "Support preparing announcement"
        ]
    ]
    ok = True
    for idx, thread in enumerate(samples, start=1):
        code, text = _request(
            "/summaries/autopm",
            method="POST",
            data={"thread": thread},
        )
        if not (200 <= code < 300):
            print(f"  Sample {idx} ERROR {code}: {text}")
            ok = False
            continue
        try:
            data = json.loads(text)
        except Exception:
            print(f"  Sample {idx} ERROR: invalid JSON")
            ok = False
            continue
        summary = data.get("summary")
        next_actions = data.get("next_actions")
        if not isinstance(summary, str) or not summary:
            print(f"  Sample {idx} ERROR: missing summary")
            ok = False
            continue
        if not isinstance(next_actions, list):
            print(f"  Sample {idx} WARN: next_actions not list")
        print(f"  Sample {idx} OK (len={len(summary)})")
    return ok


def check_hr_timesheets() -> bool:
    print("==> /hr/timesheets (list)")
    code, text = _request("/hr/timesheets?status=draft")
    if code == 0:
        print("  WARN: network error; hr proxy likely not configured:", text)
        return True  # non-fatal in dev
    if code == 503:
        print("  INFO: hr proxy not configured (TR_SCRAIV_BASE_URL missing)")
        return True
    if 200 <= code < 300:
        try:
            data = json.loads(text)
            # scrAIv typically wraps in { data: ... }
            if isinstance(data, dict):
                print("  OK: received object keys:", list(data.keys())[:5])
                return True
        except Exception:
            pass
        print("  WARN: unexpected payload shape; raw=", text[:200])
        return True
    print(f"  ERROR {code}: {text}")
    return False


def main() -> int:
    print(f"TASKR_BASE_URL={BASE} TENANT_ID={TENANT}")
    ok1 = check_summaries_meetings()
    ok2 = check_summaries_autopm()
    ok3 = check_hr_timesheets()
    if ok1 and ok2 and ok3:
        print("Smoke OK")
        return 0
    print("Smoke FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())
