"""Shared test fixtures — an in-memory Supabase double that emulates RLS.

The fake mirrors the subset of the ``supabase-py`` query builder used by the
stores/audit modules and enforces Row Level Security the same way Postgres
would: a *user-scoped* client (one where ``postgrest.auth(token)`` was called)
can only see/insert rows whose ``user_id`` matches the token, while the
*service-role* client (no acting user) bypasses RLS entirely. This lets the
regression tests prove tenant isolation without a live Supabase instance.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest


class _Result:
    def __init__(self, data: list[dict[str, Any]], count: int | None = None) -> None:
        self.data = data
        self.count = count


class _Query:
    def __init__(self, rows: list[dict[str, Any]], acting_user: str | None) -> None:
        self._rows = rows
        self._acting_user = acting_user
        self._op: str | None = None
        self._payload: dict[str, Any] | None = None
        self._filters: list[tuple[str, Any]] = []
        self._order: str | None = None
        self._desc = False
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None
        self._count_mode = False

    # --- builder verbs ---
    def select(self, *_args: Any, count: str | None = None) -> "_Query":
        self._op = "select"
        if count == "exact":
            self._count_mode = True
        return self

    def insert(self, row: dict[str, Any]) -> "_Query":
        self._op = "insert"
        self._payload = row
        return self

    def update(self, changes: dict[str, Any]) -> "_Query":
        self._op = "update"
        self._payload = changes
        return self

    def eq(self, col: str, val: Any) -> "_Query":
        self._filters.append((col, val))
        return self

    def order(self, col: str, desc: bool = False) -> "_Query":
        self._order = col
        self._desc = desc
        return self

    def range(self, start: int, end: int) -> "_Query":
        self._range = (start, end)
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    # --- execution ---
    def _rls_visible(self) -> list[dict[str, Any]]:
        if self._acting_user is not None:
            return [r for r in self._rows if r.get("user_id") == self._acting_user]
        return list(self._rows)

    def execute(self) -> _Result:
        if self._op == "insert":
            row = dict(self._payload or {})
            # Emulate the RLS WITH CHECK insert policy (auth.uid() = user_id).
            if self._acting_user is not None and row.get("user_id") != self._acting_user:
                raise PermissionError(
                    "RLS violation: insert user_id does not match auth.uid()"
                )
            row.setdefault("id", str(uuid4()))
            self._rows.append(row)
            return _Result([dict(row)])

        rows = self._rls_visible()
        for col, val in self._filters:
            rows = [r for r in rows if r.get(col) == val]

        if self._op == "update":
            for r in rows:
                r.update(self._payload or {})
            return _Result([dict(r) for r in rows])

        # select
        count = len(rows) if self._count_mode else None
        if self._order:
            rows = sorted(
                rows,
                key=lambda r: (r.get(self._order) is None, r.get(self._order)),
                reverse=self._desc,
            )
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Result([dict(r) for r in rows], count=count)


class _Postgrest:
    def __init__(self, client: "FakeSupabase") -> None:
        self._client = client

    def auth(self, token: str) -> None:
        # In tests the token *is* the user id, so RLS resolves auth.uid()==token.
        self._client.acting_user = token


class FakeSupabase:
    """Minimal stand-in for a ``supabase.Client``."""

    def __init__(self, db: dict[str, list[dict[str, Any]]], acting_user: str | None = None) -> None:
        self._db = db
        self.acting_user = acting_user
        self.postgrest = _Postgrest(self)

    def table(self, name: str) -> _Query:
        rows = self._db.setdefault(name, [])
        return _Query(rows, self.acting_user)


@pytest.fixture
def db() -> dict[str, list[dict[str, Any]]]:
    """A single shared in-memory database across all clients in a test."""
    return {}


@pytest.fixture
def admin_client(db):
    """Service-role client — bypasses RLS (acting_user=None)."""
    return FakeSupabase(db, acting_user=None)


@pytest.fixture
def user_client_factory(db):
    """Factory producing user-scoped clients for a given user id."""

    def _make(user_id: str) -> FakeSupabase:
        client = FakeSupabase(db)
        client.postgrest.auth(user_id)
        return client

    return _make
