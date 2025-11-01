from __future__ import annotations

import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TESTS_DIR.parents[3]
TOOLFRONT_CLIENT_PATH = (REPO_ROOT / ".." / "toolfront_registry_client").resolve()
COMMON_AUTH_PATH = (REPO_ROOT / "packages" / "common_auth" / "src").resolve()
COMMON_EVENTS_PATH = (REPO_ROOT / "packages" / "common_events" / "src").resolve()
DOC_INGEST_PATH = (REPO_ROOT / "packages" / "doc_ingest" / "src").resolve()
COMMON_BILLING_PATH = (REPO_ROOT / "packages" / "common_billing" / "src").resolve()

if TOOLFRONT_CLIENT_PATH.exists():
    sys.path.insert(0, str(TOOLFRONT_CLIENT_PATH))
if COMMON_AUTH_PATH.exists():
    sys.path.insert(0, str(COMMON_AUTH_PATH))
if COMMON_EVENTS_PATH.exists():
    sys.path.insert(0, str(COMMON_EVENTS_PATH))
if DOC_INGEST_PATH.exists():
    sys.path.insert(0, str(DOC_INGEST_PATH))
if COMMON_BILLING_PATH.exists():
    sys.path.insert(0, str(COMMON_BILLING_PATH))
