"""P1-7 regression: JWT verification is strict about alg, issuer, expiry, keys.

- a token signed with an unexpected algorithm is rejected;
- issuer is validated;
- exp/nbf honour a small clock-skew leeway;
- a token signed by a rotated key (new kid) succeeds via JWKS refetch, without
  a process restart.
"""

from __future__ import annotations

import time

import pytest
from fastapi import HTTPException
from jose import jwt

import shared.auth as auth
from shared.supabase_config import supabase_settings

ISSUER = "https://proj.supabase.co/auth/v1"
SECRET = "unit-test-hs256-secret"


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    auth._jwks_cache.reset()
    yield
    auth._jwks_cache.reset()


@pytest.fixture
def hs256(monkeypatch):
    monkeypatch.setattr(supabase_settings, "supabase_jwt_algorithms", "HS256")
    monkeypatch.setattr(supabase_settings, "supabase_jwt_secret", SECRET)
    monkeypatch.setattr(supabase_settings, "supabase_issuer", ISSUER)
    monkeypatch.setattr(supabase_settings, "supabase_jwt_leeway_sec", 10)
    monkeypatch.setattr(supabase_settings, "supabase_jwks_url", "")


def _hs_token(secret=SECRET, alg="HS256", *, iss=ISSUER, exp_delta=3600, aud="authenticated"):
    now = int(time.time())
    claims = {"sub": "user-1", "aud": aud, "iss": iss, "exp": now + exp_delta, "iat": now}
    return jwt.encode(claims, secret, algorithm=alg)


def test_valid_hs256_token_accepted(hs256):
    payload = auth._decode_token(_hs_token())
    assert payload["sub"] == "user-1"


def test_unexpected_algorithm_rejected(hs256):
    # Only HS256 is configured; a HS512-signed token must be refused up front.
    token = _hs_token(alg="HS512")
    with pytest.raises(HTTPException) as exc:
        auth._decode_token(token)
    assert exc.value.status_code == 401
    assert "algorithm" in str(exc.value.detail).lower()


def test_wrong_issuer_rejected(hs256):
    token = _hs_token(iss="https://evil.example.com/auth/v1")
    with pytest.raises(HTTPException) as exc:
        auth._decode_token(token)
    assert exc.value.status_code == 401


def test_expired_within_leeway_accepted(hs256):
    # exp 5s in the past, leeway 10s -> still valid.
    payload = auth._decode_token(_hs_token(exp_delta=-5))
    assert payload["sub"] == "user-1"


def test_expired_beyond_leeway_rejected(hs256):
    with pytest.raises(HTTPException) as exc:
        auth._decode_token(_hs_token(exp_delta=-60))
    assert exc.value.status_code == 401


def test_wrong_secret_rejected(hs256):
    token = _hs_token(secret="a-different-secret")
    with pytest.raises(HTTPException) as exc:
        auth._decode_token(token)
    assert exc.value.status_code == 401


# ---------------------------------------------------------------------------
# Asymmetric (RS256) key-rotation / kid-miss refetch
# ---------------------------------------------------------------------------

def _rsa_keypair():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from jose import jwk

    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = priv.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    pub_pem = (
        priv.public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode()
    )
    return priv_pem, pub_pem, jwk


def _public_jwk(pub_pem, jwk, kid: str) -> dict:
    d = jwk.construct(pub_pem, algorithm="RS256").to_dict()
    # jose returns bytes for n/e in some versions — normalize to str.
    d = {k: (v.decode() if isinstance(v, bytes) else v) for k, v in d.items()}
    d["kid"] = kid
    d["use"] = "sig"
    d["alg"] = "RS256"
    return d


def test_rotated_key_new_kid_succeeds_without_restart(monkeypatch):
    pytest.importorskip("cryptography")

    priv_pem, pub_pem, jwk = _rsa_keypair()
    new_jwk = _public_jwk(pub_pem, jwk, kid="key-new")
    old_jwks = {"keys": [{"kty": "RSA", "kid": "key-old", "use": "sig", "alg": "RS256", "n": "x", "e": "AQAB"}]}
    new_jwks = {"keys": [new_jwk]}

    calls = {"n": 0}

    def fake_fetch():
        calls["n"] += 1
        # First fetch returns the stale keyset (missing the new kid);
        # the kid-miss forces a second fetch that returns the rotated key.
        return old_jwks if calls["n"] == 1 else new_jwks

    monkeypatch.setattr(auth, "_fetch_jwks_raw", fake_fetch)
    monkeypatch.setattr(supabase_settings, "supabase_jwt_algorithms", "RS256")
    monkeypatch.setattr(supabase_settings, "supabase_jwks_url", "https://proj.supabase.co/jwks")
    monkeypatch.setattr(supabase_settings, "supabase_issuer", ISSUER)
    monkeypatch.setattr(supabase_settings, "supabase_jwt_secret", "")

    now = int(time.time())
    token = jwt.encode(
        {"sub": "user-2", "aud": "authenticated", "iss": ISSUER, "exp": now + 3600, "iat": now},
        priv_pem,
        algorithm="RS256",
        headers={"kid": "key-new"},
    )

    payload = auth._decode_token(token)
    assert payload["sub"] == "user-2"
    assert calls["n"] == 2  # proves a refetch happened on the kid-miss


def test_unknown_kid_rejected(monkeypatch):
    pytest.importorskip("cryptography")
    priv_pem, pub_pem, jwk = _rsa_keypair()
    only_other = {"keys": [{"kty": "RSA", "kid": "some-other", "use": "sig", "alg": "RS256", "n": "x", "e": "AQAB"}]}

    monkeypatch.setattr(auth, "_fetch_jwks_raw", lambda: only_other)
    monkeypatch.setattr(supabase_settings, "supabase_jwt_algorithms", "RS256")
    monkeypatch.setattr(supabase_settings, "supabase_jwks_url", "https://proj.supabase.co/jwks")
    monkeypatch.setattr(supabase_settings, "supabase_issuer", ISSUER)

    now = int(time.time())
    token = jwt.encode(
        {"sub": "u", "aud": "authenticated", "iss": ISSUER, "exp": now + 3600, "iat": now},
        priv_pem,
        algorithm="RS256",
        headers={"kid": "not-present"},
    )
    with pytest.raises(HTTPException) as exc:
        auth._decode_token(token)
    assert exc.value.status_code == 401
