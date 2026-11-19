"""Study rooms, sharing (as private copies), weekly leaderboards and live quiz battles."""

from datetime import datetime, timedelta

import pytest

from .test_study_and_projects import _upload, fakes  # noqa: F401  (autouse: AI replaced by fakes)


def _ready_guide(client) -> str:
    doc_id = _upload(client)
    gid = client.post("/api/guides", json={"documentId": doc_id, "pageStart": 1, "pageEnd": 3}).json()["guideId"]
    assert client.get(f"/api/guides/{gid}").json()["status"] == "ready"
    return gid


def test_rooms_sharing_and_leaderboard(client, make_client):
    gid = _ready_guide(client)
    room = client.post("/api/rooms", json={"name": "BIO 201 crew", "course": "BIO 201"}).json()
    room_id, code = room["roomId"], room["joinCode"]
    assert len(code) == 6 and room["isOwner"] and len(room["members"]) == 1

    friend = make_client("Kwesi Boateng")
    joined = friend.post("/api/rooms/join", json={"code": code.lower()}).json()
    assert joined["roomId"] == room_id and len(joined["members"]) == 2
    assert {m["name"] for m in joined["members"]} >= {"Kwesi B."}
    assert make_client().get(f"/api/rooms/{room_id}").status_code == 404  # non-members can't see it
    assert friend.post("/api/rooms/join", json={"code": "ZZZZZZ"}).status_code == 404

    # Share a study space; the friend saves a private copy.
    assert friend.post(f"/api/rooms/{room_id}/shares", json={"guideId": gid}).status_code == 404  # not theirs
    room = client.post(f"/api/rooms/{room_id}/shares", json={"guideId": gid}).json()
    share_id = room["shares"][0]["shareId"]
    copy_id = friend.post(f"/api/rooms/{room_id}/shares/{share_id}/save").json()["guideId"]
    assert copy_id != gid
    copy = friend.get(f"/api/guides/{copy_id}").json()
    assert copy["status"] == "ready" and copy["title"] and len(copy["sections"]) > 0
    assert friend.get(f"/api/guides/{gid}").status_code == 404  # still can't open the original
    cards = friend.get(f"/api/flashcards?guideId={copy_id}&due=false").json()["cards"]
    assert cards and all(c["repetitions"] == 0 for c in cards)
    assert friend.post(f"/api/guides/{copy_id}/chat", json={"message": "What is glycolysis?"}).status_code == 200  # pages copied too
    assert friend.get(f"/api/rooms/{room_id}").json()["shares"][0]["saved"] is True

    # Leaderboard: the friend reviews cards and takes a quiz this week.
    friend.post(f"/api/flashcards/{cards[0]['id']}/review", json={"rating": "good"})
    friend.post(f"/api/guides/{copy_id}/quiz", json={"answers": [0] * len(copy["quiz"])})
    board = friend.get(f"/api/rooms/{room_id}").json()["leaderboard"]
    kwesi = next(b for b in board if b["name"] == "Kwesi B.")
    assert kwesi["points"] >= 6  # a card review (1) and a quiz (5) this week
    assert [b["rank"] for b in board] == list(range(1, len(board) + 1))
    assert board == sorted(board, key=lambda b: -b["points"])
    assert any(b["id"] == "top" for b in board[0]["badges"])

    # Hide from the leaderboard; leave; owner leaving closes the room.
    board = friend.put(f"/api/rooms/{room_id}/leaderboard", json={"onLeaderboard": False}).json()["leaderboard"]
    assert all(b["name"] != "Kwesi B." for b in board)
    assert friend.delete(f"/api/rooms/{room_id}/membership").status_code == 204
    assert friend.get(f"/api/rooms/{room_id}").status_code == 404
    assert client.delete(f"/api/rooms/{room_id}/membership").status_code == 204
    assert client.get(f"/api/rooms/{room_id}").status_code == 404


@pytest.fixture
def clock(monkeypatch):
    from app.social import service

    now = {"t": datetime(2026, 11, 19, 12, 0, 0)}
    monkeypatch.setattr(service, "_utcnow", lambda: now["t"])

    def advance(seconds: float):
        now["t"] += timedelta(seconds=seconds)

    return advance


def test_live_quiz_battle(client, make_client, clock):
    gid = _ready_guide(client)
    battle = client.post("/api/battles", json={"guideId": gid, "secondsPerQuestion": 10}).json()
    code = battle["code"]
    rival = make_client("Efua Owusu")
    lobby = rival.post(f"/api/battles/{code}/join").json()
    assert lobby["phase"] == "lobby" and len(lobby["players"]) == 2
    assert rival.post(f"/api/battles/{code}/start").status_code == 403  # only the host starts

    state = client.post(f"/api/battles/{code}/start").json()
    assert state["phase"] == "countdown"
    assert make_client().post(f"/api/battles/{code}/join").json()["error"]["code"] == "ALREADY_STARTED"

    clock(6)  # countdown (5s) over, 1s into question 1
    q = client.get(f"/api/battles/{code}").json()
    assert q["phase"] == "question" and q["question"]["index"] == 0 and "correctIndex" not in q["question"]
    correct = 0  # FAKE_PRACTICE quiz: every correct answer is option 0
    assert client.post(f"/api/battles/{code}/answer", json={"index": 0, "choice": correct}).json() == {"accepted": True}
    assert client.post(f"/api/battles/{code}/answer", json={"index": 0, "choice": 1}).status_code == 409  # once only
    clock(5)
    rival.post(f"/api/battles/{code}/answer", json={"index": 0, "choice": 1})  # wrong

    clock(5)  # into the reveal
    r = rival.get(f"/api/battles/{code}").json()
    assert r["phase"] == "reveal" and r["question"]["correctIndex"] == 0 and sum(r["question"]["counts"]) == 2
    assert r["question"]["myPoints"] == 0
    assert rival.post(f"/api/battles/{code}/answer", json={"index": 0, "choice": 0}).json()["error"]["code"] == "TOO_LATE"

    leader = r["players"][0]
    assert leader["name"] == "Test S." and leader["score"] == 950  # 9s of 10 left → 500 + 450

    clock(15 * 10)  # past the last question
    done = client.get(f"/api/battles/{code}").json()
    assert done["phase"] == "finished" and done["winner"] == "Test S." and len(done["review"]) == done["questionCount"]
    assert any(b["code"] == code for b in rival.get("/api/battles").json())
    assert make_client().get(f"/api/battles/{code}").status_code == 403  # not a player
