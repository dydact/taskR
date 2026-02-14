from __future__ import annotations

import sys
import types

import pytest

from app.core import migrations


def _reset_flag() -> None:
    migrations._MIGRATIONS_APPLIED = False  # type: ignore[attr-defined]


@pytest.fixture(autouse=True)
def reset_migrations_flag():
    _reset_flag()
    yield
    _reset_flag()


def test_apply_migrations_executes_sql_files_in_order(monkeypatch, tmp_path):
    sql_files = []
    for idx in range(3):
        path = tmp_path / f"{idx:04}_demo.sql"
        path.write_text(f"-- test {idx}\nSELECT {idx};", encoding="utf-8")
        sql_files.append(path)

    executed: list[str] = []

    class DummyCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, statement: str):
            executed.append(statement.strip())

    class DummyConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return DummyCursor()

    dummy_psycopg = types.SimpleNamespace(connect=lambda *_, **__: DummyConnection())
    monkeypatch.setenv("TR_DATABASE_URL", "postgresql://localhost:5432/taskr")
    monkeypatch.setitem(sys.modules, "psycopg", dummy_psycopg)

    migrations.apply_migrations(migrations_dir=tmp_path)

    assert executed == [file.read_text().strip() for file in sorted(sql_files)]


def test_apply_migrations_is_idempotent(monkeypatch, tmp_path):
    (tmp_path / "0010_once.sql").write_text("SELECT 1;", encoding="utf-8")

    call_count = {"value": 0}

    class DummyCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, statement):
            call_count["value"] += 1

    class DummyConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return DummyCursor()

    dummy_psycopg = types.SimpleNamespace(connect=lambda *_, **__: DummyConnection())
    monkeypatch.setenv("TR_DATABASE_URL", "postgresql://localhost:5432/taskr")
    monkeypatch.setitem(sys.modules, "psycopg", dummy_psycopg)

    migrations.apply_migrations(migrations_dir=tmp_path)
    migrations.apply_migrations(migrations_dir=tmp_path)

    assert call_count["value"] == 1
