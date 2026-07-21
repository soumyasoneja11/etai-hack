"""P0-3 regression: signup is invite-gated (403) and rate-limited (429)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from shared.rate_limit import SlidingWindowRateLimiter


# ---------------------------------------------------------------------------
# Rate limiter unit tests
# ---------------------------------------------------------------------------

def test_rate_limiter_blocks_after_max_hits():
    limiter = SlidingWindowRateLimiter(max_hits=3, window_sec=1000)
    assert limiter.hit("k") is True   # 1
    assert limiter.hit("k") is True   # 2
    assert limiter.hit("k") is True   # 3
    assert limiter.hit("k") is False  # 4 → blocked


def test_rate_limiter_is_per_key():
    limiter = SlidingWindowRateLimiter(max_hits=1, window_sec=1000)
    assert limiter.hit("a") is True
    assert limiter.hit("a") is False
    assert limiter.hit("b") is True  # different key unaffected


def test_rate_limiter_window_expiry(monkeypatch):
    import shared.rate_limit as rl

    clock = {"t": 0.0}
    monkeypatch.setattr(rl.time, "monotonic", lambda: clock["t"])

    limiter = SlidingWindowRateLimiter(max_hits=1, window_sec=10)
    assert limiter.hit("k") is True
    assert limiter.hit("k") is False
    clock["t"] = 11.0  # advance past the window
    assert limiter.hit("k") is True


# ---------------------------------------------------------------------------
# Endpoint-level tests (skip if heavy service deps aren't installed)
# ---------------------------------------------------------------------------

@pytest.fixture
def signup_app(monkeypatch):
    main = pytest.importorskip("ingestion_detection.main")
    from fastapi.testclient import TestClient

    # Deterministic limits + clean limiter state per test.
    main._signup_ip_limiter.reset()
    main._signup_email_limiter.reset()

    # Fake GoTrue admin so no network/Supabase is required.
    fake_user = SimpleNamespace(id="new-user", email="invitee@example.com")
    fake_admin = SimpleNamespace(
        auth=SimpleNamespace(
            admin=SimpleNamespace(create_user=lambda _payload: SimpleNamespace(user=fake_user))
        )
    )
    monkeypatch.setattr(main, "get_supabase_admin", lambda: fake_admin)

    return main, TestClient(main.app, raise_server_exceptions=False)


def test_signup_disabled_without_configured_invite(signup_app, monkeypatch):
    main, client = signup_app
    monkeypatch.setattr(main.settings, "signup_invite_token", "")

    resp = client.post(
        "/api/v1/auth/signup",
        json={"email": "a@example.com", "password": "pw"},
    )
    assert resp.status_code == 403


def test_signup_rejects_bad_invite(signup_app, monkeypatch):
    main, client = signup_app
    monkeypatch.setattr(main.settings, "signup_invite_token", "secret-invite")

    resp = client.post(
        "/api/v1/auth/signup",
        json={"email": "a@example.com", "password": "pw", "invite_token": "wrong"},
    )
    assert resp.status_code == 403


def test_signup_succeeds_with_valid_invite(signup_app, monkeypatch):
    main, client = signup_app
    monkeypatch.setattr(main.settings, "signup_invite_token", "secret-invite")

    resp = client.post(
        "/api/v1/auth/signup",
        json={"email": "a@example.com", "password": "pw", "invite_token": "secret-invite"},
    )
    assert resp.status_code == 200
    assert resp.json()["data"]["role"] == "user"


def test_signup_rate_limited_after_n_attempts(signup_app, monkeypatch):
    main, client = signup_app
    monkeypatch.setattr(main.settings, "signup_invite_token", "secret-invite")
    monkeypatch.setattr(main._signup_ip_limiter, "max_hits", 3)

    # First 3 attempts pass the IP throttle (bad invite → 403).
    for _ in range(3):
        r = client.post("/api/v1/auth/signup", json={"email": "a@x.com", "password": "pw"})
        assert r.status_code == 403
    # 4th attempt from same IP is throttled.
    r = client.post("/api/v1/auth/signup", json={"email": "a@x.com", "password": "pw"})
    assert r.status_code == 429
