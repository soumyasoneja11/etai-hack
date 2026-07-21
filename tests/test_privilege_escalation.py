"""P0-2 regression: role must be read from app_metadata, not user_metadata.

Supabase ``user_metadata`` is user-writable via ``auth.updateUser({data:{...}})``,
so a role stored there can be self-assigned. ``require_admin`` must therefore
key off the server-controlled ``app_metadata`` claim.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import shared.auth as auth


def _request() -> SimpleNamespace:
    return SimpleNamespace(headers={"Authorization": "Bearer test-token"})


def _run(coro):
    return asyncio.run(coro)


def test_self_assigned_user_metadata_role_is_rejected(monkeypatch):
    """A user who set user_metadata.role='admin' still fails require_admin."""
    payload = {
        "sub": "attacker",
        "email": "attacker@example.com",
        "user_metadata": {"role": "admin"},  # user-writable — must be ignored
        "app_metadata": {},
    }
    monkeypatch.setattr(auth, "_decode_token", lambda _t: payload)

    with pytest.raises(HTTPException) as exc:
        _run(auth.require_admin(_request()))
    assert exc.value.status_code == 403


def test_app_metadata_admin_is_allowed(monkeypatch):
    """A genuine admin (role in app_metadata) passes require_admin."""
    payload = {
        "sub": "real-admin",
        "email": "admin@example.com",
        "user_metadata": {},
        "app_metadata": {"role": "admin"},  # server-only claim
    }
    monkeypatch.setattr(auth, "_decode_token", lambda _t: payload)

    result = _run(auth.require_admin(_request()))
    assert result is payload


def test_regular_user_is_rejected(monkeypatch):
    payload = {"sub": "user", "app_metadata": {"role": "user"}}
    monkeypatch.setattr(auth, "_decode_token", lambda _t: payload)

    with pytest.raises(HTTPException) as exc:
        _run(auth.require_admin(_request()))
    assert exc.value.status_code == 403


def test_scoped_context_reads_role_from_app_metadata():
    ctx = auth.ScopedContext(
        {"sub": "u", "app_metadata": {"role": "admin"}, "user_metadata": {"role": "user"}},
        "tok",
    )
    assert ctx.role == "admin"
    assert ctx.user_id == "u"
