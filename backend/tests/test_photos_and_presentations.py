"""Photos of slides as study material, and presentations from a topic, points and files (AI faked)."""

import io

import pytest
from PIL import Image

from .test_study_and_projects import fakes  # noqa: F401  (autouse: chat AI replaced by fakes)

read_calls: list[int] = []


@pytest.fixture(autouse=True)
def fake_vision(monkeypatch):
    from app.ingestion import images

    def fake_read(jpeg: bytes, prompt: str, **kw) -> str:
        read_calls.append(len(jpeg))
        assert jpeg[:2] == b"\xff\xd8"  # converted to JPEG before sending
        return "Lecture 4: Glycolysis\n- Glucose splits into two pyruvate\n- Net gain of 2 ATP"

    monkeypatch.setattr(images, "groq_read_image", fake_read)



def _photo(color=(240, 240, 240), size=(2400, 1800), fmt="PNG") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, fmt)
    return buf.getvalue()


def test_upload_photos_of_slides(client):
    read_calls.clear()
    files = [("photos", (f"slide{i}.png", _photo(), "image/png")) for i in range(3)]
    r = client.post("/api/upload/photos", data={"title": "BIO lecture photos"}, files=files)
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["sourceType"] == "images" and doc["pageCount"] == 3 and doc["filename"] == "BIO lecture photos"
    assert len(read_calls) == 3 and max(read_calls) < 400_000  # shrunk before sending

    # A study space can be made from the photos like any other document.
    gid = client.post("/api/guides", json={"documentId": doc["documentId"]}).json()["guideId"]
    assert client.get(f"/api/guides/{gid}").json()["status"] == "ready"

    bad = client.post("/api/upload/photos", files=[("photos", ("x.png", b"not an image", "image/png"))])
    assert bad.status_code == 415
    too_many = client.post("/api/upload/photos", files=[("photos", (f"{i}.png", _photo(size=(10, 10)), "image/png")) for i in range(21)])
    assert too_many.status_code == 400


def test_presentation_from_just_a_topic(client):
    r = client.post("/api/projects", data={"title": "Renewable energy in Ghana", "slideCount": "8", "durationMinutes": "10"})
    assert r.status_code == 202, r.text
    p = client.get(f"/api/projects/{r.json()['projectId']}").json()
    assert p["status"] == "ready"
    assert p["walkthroughStatus"] == "ready" and p["walkthrough"]["slides"][0]["sayItLikeThis"]
    assert p["defense"]["likelyQuestions"] and p["downloadUrl"]


def test_presentation_with_points_and_files_including_a_photo(client):
    read_calls.clear()
    files = [
        ("resources", ("brief.txt", b"Present the stages of cellular respiration for 10 minutes.", "text/plain")),
        ("resources", ("notes-photo.jpg", _photo(fmt="JPEG"), "image/jpeg")),
    ]
    r = client.post(
        "/api/projects",
        data={"title": "Cellular respiration", "instructions": "Include one real-world example.", "slideCount": "8", "durationMinutes": "10"},
        files=files,
    )
    assert r.status_code == 202, r.text
    assert len(read_calls) == 1
    p = client.get(f"/api/projects/{r.json()['projectId']}").json()
    assert p["status"] == "ready" and "brief.txt" in p["sourceFilename"] and "notes-photo.jpg" in p["sourceFilename"]

    too_many = [("resources", (f"{i}.txt", b"notes", "text/plain")) for i in range(7)]
    assert client.post("/api/projects", data={"title": "x"}, files=too_many).status_code == 400


def test_walkthrough_for_an_older_presentation(client):
    from app.db import _session_factory
    from app.models import Project

    pid = client.post("/api/projects", data={"title": "Old one", "instructions": "A presentation about cells and energy."}).json()["projectId"]
    with _session_factory()() as db:  # simulate a presentation made before walkthroughs existed
        db.get(Project, pid).walkthrough = None
        db.commit()
    assert client.get(f"/api/projects/{pid}").json()["walkthroughStatus"] == "missing"
    client.post(f"/api/projects/{pid}/walkthrough")
    p = client.get(f"/api/projects/{pid}").json()
    assert p["walkthroughStatus"] == "ready" and p["walkthrough"]["overview"]
