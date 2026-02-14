from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterable

logger = logging.getLogger(__name__)

_MIGRATIONS_APPLIED = False


def apply_migrations(
    *,
    db_url: str | None = None,
    migrations_dir: Path | None = None,
) -> None:
    """
    Apply the SQL migrations in services/api/migrations against the configured database.

    The API historically required `scripts/migrate.sh` to be run manually. Running the same SQL
    statements here ensures new tables—including notifications, AI jobs, and analytics events—exist
    whenever the test harness or FastAPI app boots. The files themselves are idempotent thanks to
    `IF NOT EXISTS`, so re-running is safe.
    """

    global _MIGRATIONS_APPLIED
    if _MIGRATIONS_APPLIED:
        return

    db_url = db_url or os.getenv("TR_DATABASE_URL") or os.getenv("DATABASE_URL")
    if db_url is None:
        # Fall back to settings if imported lazily to avoid circular import at module load.
        try:
            from app.core.config import settings  # type: ignore
        except Exception:  # pragma: no cover - import guard
            logger.debug("Skipping migration auto-run; database URL not resolved yet.")
            return
        db_url = settings.database_url

    if not db_url.lower().startswith("postgresql"):
        logger.debug("Skipping migrations for non-Postgres database URL: %s", db_url)
        return

    migrations_path = migrations_dir or Path(__file__).resolve().parents[2] / "migrations"
    sql_files: Iterable[Path] = sorted(migrations_path.glob("*.sql"))

    try:
        import psycopg  # type: ignore
    except Exception as exc:  # pragma: no cover - dependency guard
        logger.warning("psycopg not available; unable to auto-apply migrations: %s", exc)
        return

    try:
        with psycopg.connect(db_url, autocommit=True) as conn:
            with conn.cursor() as cur:
                for sql_file in sql_files:
                    contents = sql_file.read_text(encoding="utf-8").strip()
                    if not contents:
                        continue
                    cur.execute(contents)
        _MIGRATIONS_APPLIED = True
        logger.info("Database migrations applied automatically from %s", migrations_path)
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("Failed to auto-apply database migrations.")
