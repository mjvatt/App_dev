"""Integration tests for the friends + friend-leaderboard flow."""
from httpx import AsyncClient


async def _register(client: AsyncClient, email: str, username: str) -> str:
    res = await client.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": "validpass123"},
    )
    assert res.status_code == 201
    return res.cookies.get("puc_access") or ""


async def _login(client: AsyncClient, email: str) -> None:
    """Replace the active session cookie jar with this user's session."""
    client.cookies.clear()
    res = await client.post(
        "/api/auth/login",
        json={"email": email, "password": "validpass123"},
    )
    assert res.status_code == 200


async def test_send_accept_and_friends_appear(integration_client: AsyncClient) -> None:
    await _register(integration_client, "alice@example.com", "alice")
    await _register(integration_client, "bob@example.com", "bob")

    # Alice (currently logged in as bob — last register) sends a request.
    await _login(integration_client, "alice@example.com")
    sent = await integration_client.post(
        "/api/friends/request", json={"username": "bob"}
    )
    assert sent.status_code == 201

    # Bob should see it as incoming.
    await _login(integration_client, "bob@example.com")
    reqs = (await integration_client.get("/api/friends/requests")).json()
    assert len(reqs["incoming"]) == 1
    friendship_id = reqs["incoming"][0]["friendship_id"]
    assert reqs["incoming"][0]["other"]["username"] == "alice"

    # Bob accepts.
    accept = await integration_client.post(f"/api/friends/{friendship_id}/accept")
    assert accept.status_code == 200

    # Both Bob and Alice now see each other as friends.
    bobs_friends = (await integration_client.get("/api/friends")).json()
    assert any(f["other"]["username"] == "alice" for f in bobs_friends["friends"])

    await _login(integration_client, "alice@example.com")
    alices_friends = (await integration_client.get("/api/friends")).json()
    assert any(f["other"]["username"] == "bob" for f in alices_friends["friends"])


async def test_decline_drops_request(integration_client: AsyncClient) -> None:
    await _register(integration_client, "carol@example.com", "carol")
    await _register(integration_client, "dave@example.com", "dave")

    await _login(integration_client, "carol@example.com")
    await integration_client.post("/api/friends/request", json={"username": "dave"})

    await _login(integration_client, "dave@example.com")
    reqs = (await integration_client.get("/api/friends/requests")).json()
    fid = reqs["incoming"][0]["friendship_id"]

    decline = await integration_client.post(f"/api/friends/{fid}/decline")
    assert decline.status_code == 200

    after = (await integration_client.get("/api/friends/requests")).json()
    assert after["incoming"] == []


async def test_duplicate_request_rejected(integration_client: AsyncClient) -> None:
    await _register(integration_client, "edd@example.com", "edddy")
    await _register(integration_client, "fay@example.com", "fayyy")

    await _login(integration_client, "edd@example.com")
    first = await integration_client.post(
        "/api/friends/request", json={"username": "fayyy"}
    )
    assert first.status_code == 201

    second = await integration_client.post(
        "/api/friends/request", json={"username": "fayyy"}
    )
    assert second.status_code == 400
    assert "pending" in second.json()["detail"].lower()


async def test_cannot_friend_yourself(integration_client: AsyncClient) -> None:
    await _register(integration_client, "gigi@example.com", "gigi")
    res = await integration_client.post(
        "/api/friends/request", json={"username": "gigi"}
    )
    assert res.status_code == 400


async def test_friend_leaderboard_includes_self_when_alone(
    integration_client: AsyncClient,
) -> None:
    await _register(integration_client, "alone@example.com", "aloneu")
    board = (await integration_client.get("/api/friends/leaderboard")).json()
    # Even with no friends, the page shouldn't be empty.
    assert len(board["entries"]) >= 1
    assert any(e["is_current_user"] for e in board["entries"])


async def test_search_excludes_self_and_supports_prefix(
    integration_client: AsyncClient,
) -> None:
    await _register(integration_client, "panda1@example.com", "pandaone")
    await _register(integration_client, "panda2@example.com", "pandatwo")

    await _login(integration_client, "panda1@example.com")
    res = (await integration_client.get("/api/friends/search?q=panda")).json()
    usernames = {r["username"] for r in res["results"]}
    assert "pandatwo" in usernames
    assert "pandaone" not in usernames  # caller is excluded
