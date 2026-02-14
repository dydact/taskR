from __future__ import annotations

from app.routes.comments import _extract_mentions


def test_extract_mentions_empty() -> None:
    assert _extract_mentions("") == []


def test_extract_mentions_basic() -> None:
    body = "Hi @alpha, please sync with @beta today."
    assert _extract_mentions(body) == ["alpha", "beta"]


def test_extract_mentions_dedupes() -> None:
    body = "@alpha thanks again @alpha."
    assert _extract_mentions(body) == ["alpha"]


def test_extract_mentions_allows_symbols() -> None:
    body = "Assign to @user_name-1 and @user.name"
    assert _extract_mentions(body) == ["user_name-1", "user.name"]
