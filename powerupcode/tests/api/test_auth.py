import pytest

from api.routers.auth import _hash_password, _verify_password


def test_hash_round_trip() -> None:
    hashed = _hash_password("correct horse battery staple")
    assert _verify_password("correct horse battery staple", hashed)


def test_hash_rejects_wrong_password() -> None:
    hashed = _hash_password("correct horse battery staple")
    assert not _verify_password("wrong password", hashed)


def test_hash_is_salted() -> None:
    a = _hash_password("same-password")
    b = _hash_password("same-password")
    assert a != b
    assert _verify_password("same-password", a)
    assert _verify_password("same-password", b)


def test_verify_handles_malformed_hash() -> None:
    assert not _verify_password("anything", "not-a-bcrypt-hash")


@pytest.mark.asyncio
async def test_register_validates_username_length(client) -> None:
    res = await client.post(
        "/api/auth/register",
        json={"email": "x@y.com", "username": "ab", "password": "validpass123"},
    )
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_login_requires_credentials(client) -> None:
    res = await client.post("/api/auth/login", json={})
    assert res.status_code == 422
