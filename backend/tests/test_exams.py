"""Summary sheets, past-paper banks, predicted questions and mock exams (AI replaced by fakes)."""

import json

import pymupdf
import pytest

from .test_study_and_projects import FAKE_LESSON, FAKE_PRACTICE, _upload

FAKE_SHEET = {
    "bigIdea": "Cells release energy from glucose in linked stages.",
    "sections": [{"heading": "Glycolysis", "points": ["Glucose splits into two pyruvate.", "Net 2 ATP."]}],
    "keyTerms": [{"term": "ATP", "definition": "The cell's energy currency."}],
    "rules": ["Glucose → 2 pyruvate + 2 ATP"],
    "mistakes": ["Thinking glycolysis needs oxygen."],
    "quickCheck": [{"question": "Where does glycolysis happen?", "answer": "In the cytoplasm."}],
}
FAKE_PAPER = {
    "year": "2023",
    "questions": [
        {"number": "1", "text": "Explain glycolysis.", "marks": 10, "topic": "Glycolysis"},
        {"number": "2", "text": "Describe the Krebs cycle.", "marks": 10, "topic": "Krebs cycle"},
    ],
}
FAKE_ANALYSIS = {
    "overview": "Two long questions per paper.",
    "topics": [
        {
            "name": "Glycolysis",
            "summary": "Steps and yield.",
            "papersAppeared": 2,
            "questionCount": 2,
            "totalMarks": 20,
            "trend": "steady",
            "priority": "high",
            "sampleQuestions": ["Explain glycolysis."],
        }
    ],
    "predicted": [
        {"question": "Explain the energy yield of glycolysis.", "topic": "Glycolysis", "marks": 10, "likelihood": "high", "reason": "Asked in 2 of 2 papers."}
    ],
}
FAKE_MOCK = {
    "questions": [
        {
            "id": "q1",
            "type": "mcq",
            "topic": "Glycolysis",
            "question": "Where does glycolysis happen?",
            "marks": 2,
            "options": ["Cytoplasm", "Nucleus", "Mitochondria", "Ribosome"],
            "correctIndex": 0,
            "explanation": "It happens in the cytoplasm.",
            "modelAnswer": "",
            "markingPoints": [],
        },
        {
            "id": "q2",
            "type": "short",
            "topic": "Krebs cycle",
            "question": "Describe the Krebs cycle.",
            "marks": 6,
            "options": [],
            "correctIndex": 0,
            "explanation": "A cycle in the mitochondria.",
            "modelAnswer": "Acetyl-CoA enters, CO2 is released, NADH and FADH2 are made.",
            "markingPoints": ["Acetyl-CoA enters", "CO2 released", "NADH made"],
        },
    ]
}

calls: list[str] = []


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    from app.ai import groq

    def fake_chat(system, user, *, max_tokens, effort, response_format=None):
        name = response_format["json_schema"]["name"] if response_format else "text"
        calls.append(name)
        if name == "marking":
            items = json.loads(user)
            return json.dumps({"marks": [{"id": i["id"], "awarded": 4, "feedback": "Good, but missing NADH."} for i in items]})
        return json.dumps(
            {
                "guided_lesson": FAKE_LESSON,
                "practice_pack": FAKE_PRACTICE,
                "summary_sheet": FAKE_SHEET,
                "past_paper": FAKE_PAPER,
                "exam_analysis": FAKE_ANALYSIS,
                "mock_exam": FAKE_MOCK,
            }[name]
        )

    monkeypatch.setattr(groq, "_chat", fake_chat)


def _guide(client) -> str:
    doc_id = _upload(client)
    gid = client.post("/api/guides", json={"documentId": doc_id, "pageStart": 1, "pageEnd": 3}).json()["guideId"]
    assert client.get(f"/api/guides/{gid}").json()["status"] == "ready"
    return gid


def test_summary_sheet_and_pdf(client):
    gid = _guide(client)
    calls.clear()
    sheet = client.get(f"/api/guides/{gid}/summary").json()
    assert sheet["bigIdea"].startswith("Cells") and sheet["keyTerms"][0]["term"] == "ATP"
    client.get(f"/api/guides/{gid}/summary")
    assert calls.count("summary_sheet") == 1  # made once, then kept

    r = client.get(f"/api/guides/{gid}/summary.pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"]
    pdf = pymupdf.open(stream=r.content, filetype="pdf")
    assert pdf.page_count == 1 and "Big idea" in pdf[0].get_text()


def _bank(client, guide_id: str | None = None) -> str:
    papers = [
        ("papers", ("2022.txt", b"Q1 Explain glycolysis (10 marks). Q2 Describe the Krebs cycle (10 marks).", "text/plain")),
        ("papers", ("2023.txt", b"Q1 Explain glycolysis (10 marks). Q2 Krebs cycle (10 marks).", "text/plain")),
    ]
    r = client.post("/api/exams/banks", data={"course": "BIO 201", "guideIds": guide_id or ""}, files=papers)
    assert r.status_code == 202, r.text
    return r.json()["bankId"]


def test_past_paper_bank_and_predictions(client, make_client):
    gid = _guide(client)
    bank_id = _bank(client, gid)
    bank = client.get(f"/api/exams/banks/{bank_id}").json()
    assert bank["status"] == "ready" and bank["paperCount"] == 2 and bank["guideIds"] == [gid]
    assert bank["papers"][0]["year"] == "2023" and bank["papers"][0]["questionCount"] == 2
    assert bank["topics"][0]["name"] == "Glycolysis" and bank["predicted"][0]["likelihood"] == "high"
    assert any(b["bankId"] == bank_id for b in client.get("/api/exams/banks").json())

    # Private to the owner; members only.
    assert make_client().get(f"/api/exams/banks/{bank_id}").status_code == 404
    from fastapi.testclient import TestClient

    from app.main import app

    guest = TestClient(app)
    guest.post("/api/auth/guest")
    assert guest.get("/api/exams/banks").json()["error"]["code"] == "SIGN_UP_REQUIRED"

    # Validation
    assert client.post("/api/exams/banks", data={"course": "X"}, files=[("papers", ("e.txt", b"", "text/plain"))]).status_code == 422


def test_timed_mock_exam_with_topic_breakdown(client):
    bank_id = _bank(client)
    r = client.post("/api/exams/mocks", json={"bankId": bank_id, "mode": "exam", "questionCount": 6, "durationMinutes": 20})
    assert r.status_code == 202
    mock_id = r.json()["mockId"]
    m = client.get(f"/api/exams/mocks/{mock_id}").json()
    assert m["status"] == "ready" and m["questions"] == []  # nothing visible before starting

    m = client.post(f"/api/exams/mocks/{mock_id}/start").json()
    assert m["status"] == "in_progress" and 0 < m["remainingSeconds"] <= 1200
    assert "correctIndex" not in m["questions"][0] and "modelAnswer" not in m["questions"][1]
    assert client.get(f"/api/exams/mocks/{mock_id}/check/q1").status_code == 403  # no hints in exam mode

    r = client.post(f"/api/exams/mocks/{mock_id}/submit", json={"answers": {"q1": 0, "q2": "Acetyl-CoA enters and CO2 is released."}})
    res = r.json()["result"]
    assert res["score"] == 6 and res["total"] == 8 and res["percent"] == 75
    assert res["topics"][0] == {"topic": "Krebs cycle", "awarded": 4, "available": 6, "lost": 2, "percent": 67}
    assert r.json()["questions"][0]["correctIndex"] == 0  # revealed after submitting
    # Submitting twice keeps the first result.
    again = client.post(f"/api/exams/mocks/{mock_id}/submit", json={"answers": {"q1": 3}}).json()["result"]
    assert again["score"] == 6


def test_practice_test_from_a_study_space(client):
    gid = _guide(client)
    mock_id = client.post("/api/exams/mocks", json={"guideId": gid, "mode": "practice", "questionCount": 4, "durationMinutes": 10}).json()["mockId"]
    client.post(f"/api/exams/mocks/{mock_id}/start")
    hint = client.get(f"/api/exams/mocks/{mock_id}/check/q1").json()
    assert hint["correctIndex"] == 0 and hint["explanation"]
    assert client.post("/api/exams/mocks", json={"mode": "exam"}).status_code == 400
