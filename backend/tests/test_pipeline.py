"""End-to-end API tests with Groq and ElevenLabs replaced by fakes."""

import json

import pytest

from app.defense.service import score_answer
from app.ingestion.chunk import chunk_pages
from app.ingestion.clean import CleanOptions, clean_pages, is_page_number, normalize_line
from app.ingestion.types import ExtractedPage, RawLine, RawPage

from .conftest import FIXTURES

# ---------------------------------------------------------------------------
# Fakes for the external services
# ---------------------------------------------------------------------------


def silent_mp3(seconds: float) -> bytes:
    """Silent MPEG-1 Layer III frames (32 kbps, 32 kHz, mono, 36 ms each)."""
    frames = max(1, round(seconds / 0.036))
    frame = b"\xff\xfb\x18\xc4" + b"\x00" * 140
    return frame * frames


FAKE_SCRIPT = {
    "lines": [
        {"speaker": "Alex", "text": "Welcome! Today: data versus information.", "type": "dialogue"},
        {"speaker": "Sam", "text": "Hmm… aren't they the same thing?", "type": "dialogue"},
        {"speaker": "Alex", "text": "Quick checkpoint! Is a list of unlabeled dates data or information?", "type": "quiz_checkpoint"},
        {"speaker": "Sam", "text": "Data, because there's no context.", "type": "dialogue"},
    ]
}
FAKE_QUESTIONS = {
    "overallWeaknesses": ["Claims lack evidence."],
    "questions": [
        {
            "question": f"Question {i}?",
            "category": "logical_gap",
            "targetsWeakness": "A gap.",
            "sourceReference": "Page 1",
            "rubric": {
                "idealAnswerSummary": "Ideal.",
                "keyPoints": [
                    {"point": "Core idea", "importance": "core", "technicalDetail": "detail"},
                    {"point": "Supporting idea", "importance": "supporting", "technicalDetail": "detail"},
                ],
                "redFlags": ["Hand-waving"],
                "followUpQuestion": "Why?",
            },
        }
        for i in range(1, 6)
    ],
}
FAKE_EVALUATION = {
    "keyPointResults": [{"keyPointId": "q1-k1", "status": "covered", "evidence": "because", "comment": "Good."}],
    "missingTechnicalDetails": ["Supporting idea detail"],
    "misconceptions": [],
    "strengths": ["Clear"],
    "feedback": "Nice start.",
    "improvedAnswerOutline": ["Define", "Explain"],
}


@pytest.fixture(autouse=True)
def fake_services(monkeypatch):
    from app.ai import groq
    from app.tts import elevenlabs

    def fake_chat(system, user, *, max_tokens, effort, response_format=None):
        if response_format is None:
            return "Great question! Data are raw facts. Okay, let's jump back in."
        name = response_format["json_schema"]["name"]
        schema = response_format["json_schema"]["schema"]
        assert schema["additionalProperties"] is False  # Groq strict mode requirement
        return json.dumps({"audio_script": FAKE_SCRIPT, "defense_question_set": FAKE_QUESTIONS, "answer_evaluation": FAKE_EVALUATION}[name])

    monkeypatch.setattr(groq, "_chat", fake_chat)
    monkeypatch.setattr(groq, "groq_transcribe", lambda audio, filename, prompt=None: "What is a primary key?")
    monkeypatch.setattr("app.ask.service.groq_transcribe", lambda audio, filename, prompt=None: "What is a primary key?")
    monkeypatch.setattr(elevenlabs, "synthesize", lambda text, speaker, **kw: silent_mp3(len(text) * 0.05))


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_normalize_and_page_numbers():
    assert normalize_line("  Glycolysis") == "- Glycolysis"
    assert normalize_line("ﬁrst ﬂoor") == "first floor"
    assert normalize_line("Introduction ........ 5") == "Introduction 5"
    assert all(is_page_number(s) for s in ["12", "Page 3 of 10", "- 4 -", "iv"])
    assert not is_page_number("Chapter 1")


def test_running_headers_removed_but_headings_kept():
    pages = [
        RawPage(
            n,
            [
                RawLine("BIOL 101 - Lecture Notes", True, y=760),
                RawLine(f"{n}.0 {['Glycolysis', 'Krebs Cycle', 'Electron Transport', 'Chemiosmosis', 'Fermentation'][n - 1]}", True, y=720),
                RawLine(f"Body text unique to page {n} about infor-", True, y=700),
                RawLine(f"mation flow in {'abcde'[n - 1]}-section.", False, y=686),
                RawLine(str(n), True, y=30),
            ],
        )
        for n in range(1, 6)
    ]
    opts = CleanOptions(join_wrapped_lines=True, page_number_edge_lines=2, repeat_scope="edges")
    cleaned = clean_pages(pages, opts)
    assert cleaned[0].text == "1.0 Glycolysis\n\nBody text unique to page 1 about information flow in a-section."


def test_chunking_respects_limits():
    pages = [ExtractedPage(n, "\n\n".join(f"Sentence {n}-{i} " * 40 for i in range(6))) for n in range(1, 9)]
    chunks = chunk_pages(pages)
    assert chunks and all(c.token_count <= 1000 for c in chunks)
    assert chunks[0].page_start == 1 and chunks[-1].page_end == 8


def test_scoring():
    assert score_answer([{"importance": "core", "status": "covered"}, {"importance": "supporting", "status": "covered"}]) == (100, "excellent")
    assert score_answer(
        [{"importance": "core", "status": "missing"}, {"importance": "important", "status": "covered"},
         {"importance": "important", "status": "covered"}, {"importance": "supporting", "status": "covered"}]
    ) == (63, "partial")


# ---------------------------------------------------------------------------
# API tests
# ---------------------------------------------------------------------------


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok", "database": "ok"}


def test_upload_validation_errors(client):
    r = client.post("/api/upload", files={"file": ("notes.pdf", b"hello", "application/pdf")})
    assert r.status_code == 415 and r.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"
    r = client.post("/api/upload", files={"file": ("deck.ppt", b"x", "application/vnd.ms-powerpoint")})
    assert r.status_code == 415
    r = client.post("/api/upload")
    assert r.status_code == 400 and r.json()["error"]["code"] == "INVALID_REQUEST"


def test_full_flow(client):
    # 1. Upload
    pdf = (FIXTURES / "sample.pdf").read_bytes()
    r = client.post("/api/upload", files={"file": ("sample.pdf", pdf, "application/pdf")})
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["pageCount"] == 6 and doc["chunkCount"] >= 1
    assert any(d["documentId"] == doc["documentId"] for d in client.get("/api/documents").json())

    # 2. Episode: script + audio + manifest
    r = client.post("/api/episodes", json={"documentId": doc["documentId"], "pageStart": 1, "pageEnd": 2, "targetMinutes": 3})
    assert r.status_code == 201, r.text
    manifest = r.json()
    segs = manifest["segments"]
    assert len(segs) == 4 and segs[2]["type"] == "quiz_checkpoint" and segs[2]["pauseAfterSec"] == 3.0
    assert segs[0]["pauseAfterSec"] == 0.3 and segs[1]["startSec"] == pytest.approx(segs[0]["endSec"] + 0.3, abs=0.01)
    assert client.get(segs[0]["url"]).headers["content-type"] == "audio/mpeg"
    assert client.get(f"/api/episodes/{manifest['scriptId']}").json()["totalDurationSec"] == manifest["totalDurationSec"]
    assert client.get("/api/episodes/00000000-0000-0000-0000-000000000000").status_code == 404

    # 3. Interrupt & Ask
    r = client.post(
        "/api/ask",
        files={"audio": ("q.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 2000, "audio/webm")},
        data={"context": json.dumps({"transcript": "Alex: hi", "lectureTitle": "BCP 202"})},
    )
    assert r.status_code == 200, r.text
    assert r.json()["question"] == "What is a primary key?" and r.json()["audio"]["mimeType"] == "audio/mpeg"

    # 4. Defense questions (rubrics hidden) and grading
    r = client.post("/api/defense/questions", json={"documentId": doc["documentId"]})
    assert r.status_code == 201, r.text
    qs = r.json()
    assert len(qs["questions"]) == 5 and "rubric" not in qs["questions"][0]

    r = client.post("/api/defense/evaluate", json={"setId": qs["setId"], "questionId": "q1", "answer": "Because data needs context to mean something."})
    assert r.status_code == 200, r.text
    ev = r.json()
    # q1-k1 (core) covered = 3/4 weight; q1-k2 (supporting) skipped by the model → counted missing.
    assert ev["score"] == 75 and ev["grade"] == "good" and ev["keyPointResults"][1]["status"] == "missing"
    assert ev["rubric"]["keyPoints"][0]["id"] == "q1-k1"


def test_defense_request_validation(client):
    r = client.post("/api/defense/questions", json={})
    assert r.status_code == 400
    r = client.post("/api/defense/evaluate", content=b"hi", headers={"content-type": "text/plain"})
    assert r.status_code == 415
