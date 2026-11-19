"""Accounts: sign up, log in/out, protection of the API, and Google sign-in."""

from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.auth.service import hash_password, verify_password


def _anon() -> TestClient:
    from app.main import app

    return TestClient(app)


def test_password_hashing():
    stored = hash_password("s3cret-pass")
    assert stored.startswith("scrypt$") and "s3cret-pass" not in stored
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong", stored)
    assert not verify_password("anything", None) and not verify_password("x", "garbage")


def test_api_requires_login(client):
    anon = _anon()
    for path in ("/api/library", "/api/documents", "/api/projects", "/api/insights", "/api/flashcards", "/media/episodes/x/a.mp3"):
        r = anon.get(path)
        assert r.status_code == 401, path
        assert r.json()["error"]["code"] == "UNAUTHENTICATED"
    assert anon.get("/api/auth/me").json() == {"user": None}
    assert anon.get("/api/health").status_code == 200  # public


def test_signup_login_logout(client):
    c = _anon()
    r = c.post("/api/auth/signup", json={"name": " Ama ", "email": "Ama@Example.com", "password": "longenough"})
    assert r.status_code == 201
    assert r.json()["user"]["email"] == "ama@example.com" and r.json()["user"]["name"] == "Ama"
    assert "httponly" in r.headers["set-cookie"].lower() and "samesite=lax" in r.headers["set-cookie"].lower()
    assert c.get("/api/auth/me").json()["user"]["name"] == "Ama"
    assert c.get("/api/library").status_code == 200

    # Duplicate email, weak password, bad email
    assert _anon().post("/api/auth/signup", json={"name": "X", "email": "ama@example.com", "password": "longenough"}).status_code == 409
    assert _anon().post("/api/auth/signup", json={"name": "X", "email": "x@example.com", "password": "short"}).status_code == 400
    assert _anon().post("/api/auth/signup", json={"name": "X", "email": "not-an-email", "password": "longenough"}).status_code == 400

    assert c.post("/api/auth/logout").status_code == 200
    assert c.get("/api/auth/me").json() == {"user": None}
    assert c.get("/api/library").status_code == 401

    bad = _anon().post("/api/auth/login", json={"email": "ama@example.com", "password": "wrong-password"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "BAD_CREDENTIALS"
    unknown = _anon().post("/api/auth/login", json={"email": "nobody@example.com", "password": "whatever1"})
    assert unknown.status_code == 401 and unknown.json()["error"]["code"] == "BAD_CREDENTIALS"

    again = _anon()
    assert again.post("/api/auth/login", json={"email": " AMA@example.com", "password": "longenough"}).status_code == 200
    assert again.get("/api/auth/me").json()["user"]["email"] == "ama@example.com"


def test_login_rate_limit(client):
    c = _anon()
    c.post("/api/auth/signup", json={"name": "Kofi", "email": "kofi@example.com", "password": "longenough"})
    codes = [
        _anon().post("/api/auth/login", json={"email": "kofi@example.com", "password": f"wrong{i}"}).status_code for i in range(11)
    ]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_google_sign_in(client, monkeypatch):
    from app.config import get_settings
    from app.routers import auth as auth_router

    settings = get_settings()
    monkeypatch.setattr(settings, "google_client_id", "client-id.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret")
    assert _anon().get("/api/auth/providers").json() == {"google": True}

    c = _anon()
    r = c.get("/api/auth/google?next=/projects", follow_redirects=False)
    assert r.status_code == 302
    url = urlparse(r.headers["location"])
    query = parse_qs(url.query)
    assert url.netloc == "accounts.google.com"
    assert query["redirect_uri"] == ["http://localhost:3000/api/auth/google/callback"]
    assert query["scope"] == ["openid email profile"]
    state = query["state"][0]

    # A callback with the wrong state is rejected.
    r = c.get("/api/auth/google/callback?code=abc&state=forged", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "/login?error=google_state"

    identity = {"sub": "google-123", "email": "Efua@Gmail.com", "email_verified": True, "name": "Efua", "picture": "https://x/p.png"}
    monkeypatch.setattr(auth_router, "_google_identity", lambda code: identity)
    c.get("/api/auth/google?next=/projects", follow_redirects=False)
    state = parse_qs(urlparse(c.get("/api/auth/google?next=/projects", follow_redirects=False).headers["location"]).query)["state"][0]
    r = c.get(f"/api/auth/google/callback?code=abc&state={state}", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "/projects"
    me = c.get("/api/auth/me").json()["user"]
    assert me["email"] == "efua@gmail.com" and me["hasGoogle"] and not me["hasPassword"] and me["avatarUrl"]

    # Password login for a Google-only account explains what to do.
    r = _anon().post("/api/auth/login", json={"email": "efua@gmail.com", "password": "whatever1"})
    assert r.json()["error"]["code"] == "USE_GOOGLE"

    # Unverified Google emails are refused; open redirects are not followed.
    identity["email_verified"] = False
    state = parse_qs(urlparse(c.get("/api/auth/google?next=//evil.com", follow_redirects=False).headers["location"]).query)["state"][0]
    r = c.get(f"/api/auth/google/callback?code=abc&state={state}", follow_redirects=False)
    assert r.headers["location"] == "/login?error=google_unverified"
    identity["email_verified"] = True
    state = parse_qs(urlparse(c.get("/api/auth/google?next=//evil.com", follow_redirects=False).headers["location"]).query)["state"][0]
    r = c.get(f"/api/auth/google/callback?code=abc&state={state}", follow_redirects=False)
    assert r.headers["location"] == "/library"


def test_google_disabled_by_default(client):
    assert _anon().get("/api/auth/providers").json() == {"google": False}
    assert _anon().get("/api/auth/google", follow_redirects=False).status_code == 404


def _pdf() -> bytes:
    from .conftest import FIXTURES

    return (FIXTURES / "sample.pdf").read_bytes()


def test_guest_trial_then_sign_up_keeps_the_work(client):
    guest = _anon()
    r = guest.post("/api/auth/guest")
    assert r.status_code == 200 and r.json()["user"]["isGuest"] is True
    assert guest.post("/api/auth/guest").json()["user"]["id"] == r.json()["user"]["id"]  # idempotent

    doc = guest.post("/api/upload", files={"file": ("sample.pdf", _pdf(), "application/pdf")})
    assert doc.status_code == 201
    doc_id = doc.json()["documentId"]
    # One upload only, and no audio, projects or defence practice on a trial.
    second = guest.post("/api/upload", files={"file": ("sample.pdf", _pdf(), "application/pdf")})
    assert second.status_code == 403 and second.json()["error"]["code"] == "SIGN_UP_REQUIRED"
    assert guest.post("/api/episodes", json={"documentId": doc_id}).json()["error"]["code"] == "SIGN_UP_REQUIRED"
    assert guest.get("/api/projects").json()["error"]["code"] == "SIGN_UP_REQUIRED"
    assert guest.get("/api/library").json()["error"]["code"] == "SIGN_UP_REQUIRED"
    assert guest.get("/api/insights").status_code == 403
    assert guest.post("/api/defense/questions", json={"documentId": doc_id}).status_code == 403

    # Guests can't log in with a password, and the guest's email is never usable.
    r = guest.post("/api/auth/signup", json={"name": "Yaa", "email": "yaa@example.com", "password": "longenough"})
    assert r.status_code == 201
    me = r.json()["user"]
    assert me["isGuest"] is False and me["email"] == "yaa@example.com"
    assert any(d["documentId"] == doc_id for d in guest.get("/api/documents").json())
    assert guest.get("/api/projects").status_code == 200  # full account now


def test_guest_who_logs_in_merges_into_existing_account(client):
    owner = _anon()
    owner.post("/api/auth/signup", json={"name": "Esi", "email": "esi@example.com", "password": "longenough"})

    guest = _anon()
    guest.post("/api/auth/guest")
    doc_id = guest.post("/api/upload", files={"file": ("sample.pdf", _pdf(), "application/pdf")}).json()["documentId"]
    r = guest.post("/api/auth/login", json={"email": "esi@example.com", "password": "longenough"})
    assert r.status_code == 200 and r.json()["user"]["email"] == "esi@example.com"
    assert any(d["documentId"] == doc_id for d in owner.get("/api/documents").json())


def test_forgot_and_reset_password(client, monkeypatch):
    from app.routers import auth as auth_router

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(auth_router, "send_password_reset", lambda to, name, link: sent.append((to, link)))

    c = _anon()
    c.post("/api/auth/signup", json={"name": "Kwame", "email": "kwame@example.com", "password": "old-password"})
    other_device = _anon()
    other_device.post("/api/auth/login", json={"email": "kwame@example.com", "password": "old-password"})

    # Same answer whether or not the account exists; only real accounts get an email.
    assert _anon().post("/api/auth/forgot", json={"email": "nobody@example.com"}).json() == {"ok": True}
    assert _anon().post("/api/auth/forgot", json={"email": "Kwame@example.com"}).json() == {"ok": True}
    assert len(sent) == 1 and sent[0][0] == "kwame@example.com"
    token = parse_qs(urlparse(sent[0][1]).query)["token"][0]
    assert sent[0][1].startswith("http://localhost:3000/reset-password?token=")

    assert _anon().post("/api/auth/reset", json={"token": token, "password": "short"}).status_code == 400
    r = _anon().post("/api/auth/reset", json={"token": token, "password": "brand-new-password"})
    assert r.status_code == 200
    # The link works once, the old password stops working, and other devices are signed out.
    assert _anon().post("/api/auth/reset", json={"token": token, "password": "another-one"}).json()["error"]["code"] == "RESET_EXPIRED"
    assert _anon().post("/api/auth/login", json={"email": "kwame@example.com", "password": "old-password"}).status_code == 401
    assert _anon().post("/api/auth/login", json={"email": "kwame@example.com", "password": "brand-new-password"}).status_code == 200
    assert other_device.get("/api/library").status_code == 401
