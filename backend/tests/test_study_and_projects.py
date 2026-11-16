"""Study spaces (guided lesson, quiz, chat, resources) and Projects (deck → PowerPoint → defense coaching)."""

import io
import json

import pytest

from .conftest import FIXTURES

FAKE_LESSON = {
    "title": "Data, Information and DBMS",
    "overview": "What a DBMS is and why it beats file-based systems.",
    "objectives": ["Explain the difference between data and information", "Compare file-based systems with a DBMS"],
    "sections": [
        {
            "title": "Data vs information",
            "explanation": "**Data** are raw facts; **information** is data with meaning.",
            "analogy": "Ingredients versus a finished meal.",
            "example": "45020 alone is data; 'Student ID 45020' is information.",
            "keyTerms": [{"term": "Data", "definition": "Raw facts."}],
            "diagram": '```mermaid\nflowchart LR\n  A["Data"] --> B["Information"]\n```',
            "diagramCaption": "Data becomes information through context.",
            "checkQuestion": "Is an unlabeled list of dates data or information?",
            "checkAnswer": "Data, because it has no context.",
            "sourcePages": "Pages 1–2",
        },
        {
            "title": "Why a DBMS",
            "explanation": "A DBMS removes duplication.",
            "analogy": "",
            "example": "",
            "keyTerms": [],
            "diagram": "this is not mermaid",
            "diagramCaption": "ignored",
            "checkQuestion": "",
            "checkAnswer": "",
            "sourcePages": "Page 3",
        },
    ],
}
FAKE_PRACTICE = {
    "flashcards": [{"front": "What is data?", "back": "Raw facts."}, {"front": "What is a DBMS?", "back": "Software that manages databases."}],
    "quiz": [
        {"question": f"Q{i}?", "options": ["A", "B", "C", "D"], "correctIndex": i % 4, "explanation": "Because.", "difficulty": "easy"}
        for i in range(8)
    ]
    + [{"question": "Broken (3 options)", "options": ["A", "B", "C"], "correctIndex": 0, "explanation": "", "difficulty": "hard"}],
    "videoSearches": [{"title": "DBMS explained", "query": "what is a dbms", "why": "Visual overview."}],
    "readingTopics": [{"title": "Database normalization", "query": "database normalization", "why": "Next topic."}],
}
FAKE_DECK = {
    "title": "Smart Library System",
    "subtitle": "Design and evaluation",
    "titleNotes": "Introduce yourself and the project.",
    "slides": [
        {"layout": "bullets", "title": "The problem", "subtitle": "", "bullets": ["Books get lost", "Slow checkout"], "columns": [], "steps": [], "stats": [], "quote": "", "speakerNotes": "Explain the pain points."},
        {"layout": "two_column", "title": "Before vs after", "subtitle": "", "bullets": [], "columns": [{"heading": "Before", "bullets": ["Paper logs"]}, {"heading": "After", "bullets": ["RFID tags"]}], "steps": [], "stats": [], "quote": "", "speakerNotes": "Compare."},
        {"layout": "process", "title": "How it works", "subtitle": "", "bullets": [], "columns": [], "steps": [{"label": "Scan", "detail": "RFID read"}, {"label": "Check", "detail": "DB lookup"}, {"label": "Lend", "detail": "Update record"}], "stats": [], "quote": "", "speakerNotes": "Walk through the flow."},
        {"layout": "stats", "title": "Targets", "subtitle": "", "bullets": [], "columns": [], "steps": [], "stats": [{"value": "50%", "label": "faster checkout (target)"}], "quote": "", "speakerNotes": "These are targets."},
        {"layout": "timeline", "title": "Plan", "subtitle": "", "bullets": [], "columns": [], "steps": [{"label": "Week 1", "detail": "Design"}, {"label": "Week 4", "detail": "Build"}], "stats": [], "quote": "", "speakerNotes": "Timeline."},
        {"layout": "quote", "title": "Definition", "subtitle": "ISO 28560", "bullets": [], "columns": [], "steps": [], "stats": [], "quote": "RFID in libraries", "speakerNotes": "Standard."},
        {"layout": "section", "title": "Evaluation", "subtitle": "What we learned", "bullets": [], "columns": [], "steps": [], "stats": [], "quote": "", "speakerNotes": "Transition."},
    ],
    "closingMessage": "Faster, smarter lending",
    "closingNotes": "Thank them and invite questions.",
}
FAKE_DEFENSE = {
    "openingLine": "Good morning, today I'll show how RFID can halve checkout time.",
    "script": [{"slideNumber": 1, "title": "Title", "talkingPoints": "Hello.", "seconds": 30, "transition": "Let's start with the problem."}],
    "closingLine": "That's how we make lending faster.",
    "strategy": ["Keep the architecture slide ready."],
    "likelyQuestions": [{"question": "Why RFID over barcodes?", "why": "Tests justification.", "modelAnswer": "Because…", "tip": "Mention cost."}],
    "weakSpots": ["Cost estimates"],
}
FAKE_QUESTIONS = {
    "overallWeaknesses": ["Needs evidence."],
    "questions": [
        {
            "question": f"Question {i}?",
            "category": "methodology",
            "targetsWeakness": "Gap.",
            "sourceReference": "Slide 3",
            "rubric": {
                "idealAnswerSummary": "Ideal.",
                "keyPoints": [{"point": "Core", "importance": "core", "technicalDetail": "x"}],
                "redFlags": ["Vague"],
                "followUpQuestion": "Why?",
            },
        }
        for i in range(1, 6)
    ],
}

captured_chat_prompts: list[str] = []


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    from app.ai import groq
    from app.tts import elevenlabs

    # 40 silent MP3 frames (MPEG-1 Layer III, 32 kbps, 32 kHz): about 1.4 seconds of audio.
    silent = (bytes([0xFF, 0xFB, 0x18, 0xC4]) + bytes(140)) * 40
    monkeypatch.setattr(elevenlabs, "synthesize", lambda text, speaker, **kw: silent)

    def fake_chat(system, user, *, max_tokens, effort, response_format=None):
        if response_format is None:
            captured_chat_prompts.append(user)
            return "A **DBMS** stores data centrally (p. 2)."
        name = response_format["json_schema"]["name"]
        return json.dumps(
            {
                "guided_lesson": FAKE_LESSON,
                "practice_pack": FAKE_PRACTICE,
                "slide_deck": FAKE_DECK,
                "defense_pack": FAKE_DEFENSE,
                "defense_question_set": FAKE_QUESTIONS,
            }[name]
        )

    monkeypatch.setattr(groq, "_chat", fake_chat)


def _upload(client) -> str:
    pdf = (FIXTURES / "sample.pdf").read_bytes()
    r = client.post("/api/upload", files={"file": ("sample.pdf", pdf, "application/pdf")})
    assert r.status_code == 201, r.text
    return r.json()["documentId"]


def test_study_space_flow(client):
    doc_id = _upload(client)
    r = client.post("/api/guides", json={"documentId": doc_id, "pageStart": 1, "pageEnd": 3, "level": "beginner"})
    assert r.status_code == 202, r.text
    guide_id = r.json()["guideId"]

    g = client.get(f"/api/guides/{guide_id}").json()
    assert g["status"] == "ready" and g["title"] == "Data, Information and DBMS" and g["error"] is None
    assert len(g["sections"]) == 2 and g["objectives"][0].startswith("Explain")
    # Fenced Mermaid is unwrapped; non-Mermaid is dropped.
    assert g["sections"][0]["diagram"].startswith("flowchart LR") and g["sections"][1]["diagram"] is None
    assert g["sections"][1]["diagramCaption"] is None
    # Quiz answers stay hidden; the malformed question is skipped.
    assert len(g["quiz"]) == 8 and "correctIndex" not in g["quiz"][0]
    assert g["flashcardCount"] == 2
    # No YouTube key → search links (no invented URLs), plus encyclopedia and scholar searches.
    kinds = [(r["kind"], r["url"].split("?")[0]) for r in g["resources"]]
    assert ("video_search", "https://www.youtube.com/results") in kinds
    assert ("reading", "https://en.wikipedia.org/w/index.php") in kinds and ("reading", "https://scholar.google.com/scholar") in kinds

    # Quiz: 8 questions with correct answers i % 4; answer 6 of them right.
    answers = [i % 4 for i in range(8)]
    answers[0], answers[1] = 3, 2
    r = client.post(f"/api/guides/{guide_id}/quiz", json={"answers": answers})
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["score"] == 75 and res["rating"] == "Strong" and res["correct"] == 6 and not res["results"][0]["correct"]
    assert client.post(f"/api/guides/{guide_id}/quiz", json={"answers": [0]}).status_code == 400

    # Chat: answer saved with pages; the prompt contains the student's pages.
    r = client.post(f"/api/guides/{guide_id}/chat", json={"message": "What does glycolysis produce?"})
    assert r.status_code == 200, r.text
    assert r.json()["answer"]["content"].startswith("A **DBMS**") and r.json()["answer"]["pages"]
    assert "<material_excerpts>" in captured_chat_prompts[-1] and "[Page" in captured_chat_prompts[-1]
    assert len(client.get(f"/api/guides/{guide_id}").json()["messages"]) == 2

    # Flashcards for the study space appear in the shared review queue.
    deck = client.get(f"/api/flashcards?guideId={guide_id}").json()
    assert deck["stats"]["total"] == 2 and deck["cards"][0]["guideId"] == guide_id and deck["cards"][0]["lessonTitle"]

    # Audio version attached to the study space.
    r = client.post("/api/episodes", json={"documentId": doc_id, "pageStart": 1, "pageEnd": 3, "targetMinutes": 3, "guideId": guide_id})
    assert r.status_code == 202 and r.json()["guideId"] == guide_id

    lib = client.get("/api/library").json()
    entry = next(d for d in lib["documents"] if d["documentId"] == doc_id)
    assert entry["guides"][0]["guideId"] == guide_id and entry["guides"][0]["bestQuizScore"] == 75
    info = client.get("/api/insights").json()
    assert info["totals"]["quizzesTaken"] >= 1 and info["totals"]["questionsAsked"] >= 1

    assert client.delete(f"/api/guides/{guide_id}").status_code == 204
    assert client.get(f"/api/guides/{guide_id}").status_code == 404


def test_retrieval_prefers_relevant_chunks():
    from app.guides.service import retrieve
    from app.models import DocumentChunk

    chunks = [
        DocumentChunk(chunk_index=0, content="Glycolysis splits glucose into pyruvate in the cytoplasm.", page_start=1, page_end=1),
        DocumentChunk(chunk_index=1, content="The Krebs cycle runs in the mitochondria and makes NADH.", page_start=2, page_end=2),
        DocumentChunk(chunk_index=2, content="Fermentation regenerates NAD+ without oxygen.", page_start=3, page_end=3),
        DocumentChunk(chunk_index=3, content="The electron transport chain pumps protons.", page_start=4, page_end=4),
    ]
    top = retrieve(chunks, "Where does the Krebs cycle happen?", k=1)
    assert top[0].page_start == 2


def test_project_flow(client, tmp_path):
    from pptx import Presentation

    brief = b"Course: Information Systems 301\nPresent a 10-minute design of a smart library system. Marking: problem 20%, design 40%, evaluation 40%."
    r = client.post(
        "/api/projects",
        data={"title": "Smart library", "course": "IS 301", "instructions": "Focus on RFID.", "slideCount": "9", "durationMinutes": "10"},
        files={"brief": ("brief.txt", brief, "text/plain")},
    )
    assert r.status_code == 202, r.text
    project_id = r.json()["projectId"]

    p = client.get(f"/api/projects/{project_id}").json()
    assert p["status"] == "ready", p
    assert p["deck"]["title"] == "Smart Library System" and p["defense"]["likelyQuestions"][0]["question"].startswith("Why RFID")
    assert any(x["projectId"] == project_id for x in client.get("/api/projects").json())

    r = client.get(p["downloadUrl"])
    assert r.status_code == 200 and "presentation" in r.headers["content-type"]
    prs = Presentation(io.BytesIO(r.content))
    # Title + 7 content slides + closing; every content slide has speaker notes.
    assert len(prs.slides) == 9
    assert prs.slides[1].notes_slide.notes_text_frame.text == "Explain the pain points."
    texts = " ".join(sh.text_frame.text for sh in prs.slides[3].shapes if sh.has_text_frame)
    assert "Scan" in texts and "DB lookup" in texts

    r = client.post(f"/api/projects/{project_id}/practice")
    assert r.status_code == 200 and r.json()["setId"]
    assert client.post(f"/api/projects/{project_id}/practice").json()["setId"] == r.json()["setId"]  # created once

    assert client.delete(f"/api/projects/{project_id}").status_code == 204


def test_project_validation(client):
    r = client.post("/api/projects", data={"title": "x"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "EMPTY_INPUT"
    r = client.post("/api/projects", data={"title": "x"}, files={"brief": ("brief.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415
    r = client.post("/api/projects", data={"title": "x", "instructions": "y" * 11_000, "slideCount": "9"},
                    files={"brief": ("brief.txt", b"z" * 9_000, "text/plain")})
    assert r.status_code == 413


def test_strict_schema_keeps_fields_named_title():
    """Regression: removing pydantic's "title" annotations must not remove real fields called "title"."""
    from app.ai.groq import _strict_schema
    from app.guides.service import _Lesson

    schema = _strict_schema(_Lesson)
    assert "title" in schema["properties"] and "title" in schema["required"]
    section = schema["$defs"]["_Section"]
    assert "title" in section["properties"] and section["additionalProperties"] is False
