"""Study rooms (shared study spaces, weekly leaderboards, badges) and live quiz battles.

These features read across users, so they run unscoped (acting_as(None)) and check membership themselves.
Shared study spaces are *copied* into each member's account, so the private-by-default model holds.
"""

import secrets
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth.scoping import acting_as
from ..errors import AppError
from ..models import (
    Battle,
    BattlePlayer,
    Document,
    DocumentChunk,
    Flashcard,
    GuideResource,
    GuideSection,
    QuizQuestion,
    RoomMember,
    RoomShare,
    StudyEvent,
    StudyGuide,
    StudyRoom,
    User,
    new_uuid,
)
from ..study.service import _streaks

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I
MAX_ROOMS_PER_USER = 20
MAX_MEMBERS = 60
MAX_PLAYERS = 40
COUNTDOWN_SECONDS = 5
REVEAL_SECONDS = 5

#: Leaderboard points per study action (counts from study_events).
POINTS = {"review": 1, "quiz": 5, "chat": 1, "defense": 3, "exam": 10, "battle": 5, "upload": 2, "listen": 0}


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _code(db: Session, model, length: int = 6) -> str:
    for _ in range(20):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(length))
        if db.scalar(select(model).where(model.join_code == code if model is StudyRoom else model.code == code)) is None:
            return code
    raise AppError("BUSY", 503, "Couldn't create a code. Please try again.")


def display_name(user: User) -> str:
    """First name and last initial, e.g. "Ama M."."""
    parts = (user.name or "Student").split()
    return parts[0][:30] + (f" {parts[-1][0]}." if len(parts) > 1 and parts[-1] else "")


# ---------------------------------------------------------------------------
# Rooms
# ---------------------------------------------------------------------------


def _membership(db: Session, room_id: str, user_id: str) -> tuple[StudyRoom, RoomMember]:
    room = db.get(StudyRoom, room_id)
    member = db.get(RoomMember, (room_id, user_id)) if room else None
    if room is None or member is None:
        raise AppError("NOT_FOUND", 404, "That study room doesn't exist, or you're not a member.")
    return room, member


def create_room(db: Session, user: User, *, name: str, course: str | None) -> StudyRoom:
    with acting_as(None):
        if (db.scalar(select(func.count()).select_from(RoomMember).where(RoomMember.user_id == user.id)) or 0) >= MAX_ROOMS_PER_USER:
            raise AppError("TOO_MANY_ROOMS", 400, f"You can be in up to {MAX_ROOMS_PER_USER} study rooms.")
        room = StudyRoom(name=name.strip()[:120], course=(course or "").strip()[:200] or None, join_code=_code(db, StudyRoom), owner_id=user.id)
        room.members = [RoomMember(user_id=user.id)]
        db.add(room)
        db.commit()
        return room


def join_room(db: Session, user: User, code: str) -> StudyRoom:
    with acting_as(None):
        room = db.scalar(select(StudyRoom).where(StudyRoom.join_code == code.strip().upper()))
        if room is None:
            raise AppError("NOT_FOUND", 404, "No study room has that code. Check it and try again.")
        if db.get(RoomMember, (room.id, user.id)) is None:
            if len(room.members) >= MAX_MEMBERS:
                raise AppError("ROOM_FULL", 409, "That study room is full.")
            room.members.append(RoomMember(user_id=user.id))
            db.commit()
        return room


def leave_room(db: Session, user: User, room_id: str) -> None:
    with acting_as(None):
        room, member = _membership(db, room_id, user.id)
        if room.owner_id == user.id:
            db.delete(room)  # the owner leaving closes the room
        else:
            db.delete(member)
        db.commit()


def set_leaderboard_visibility(db: Session, user: User, room_id: str, visible: bool) -> None:
    with acting_as(None):
        _, member = _membership(db, room_id, user.id)
        member.on_leaderboard = visible
        db.commit()


def my_rooms(db: Session, user: User) -> list[dict]:
    with acting_as(None):
        rooms = db.scalars(
            select(StudyRoom).join(RoomMember).where(RoomMember.user_id == user.id).order_by(StudyRoom.created_at.desc())
        ).all()
        return [
            {
                "roomId": r.id,
                "name": r.name,
                "course": r.course,
                "memberCount": len(r.members),
                "shareCount": len(r.shares),
                "isOwner": r.owner_id == user.id,
            }
            for r in rooms
        ]


def _week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


def leaderboard(db: Session, room: StudyRoom) -> list[dict]:
    """This week's points (Monday to Sunday) for members who show on the leaderboard, plus streaks and badges."""
    today = date.today()
    week_start = datetime.combine(_week_start(today), datetime.min.time())
    since = datetime.combine(today - timedelta(days=120), datetime.min.time())
    member_ids = [m.user_id for m in room.members if m.on_leaderboard]
    if not member_ids:
        return []
    rows = db.execute(
        select(StudyEvent.user_id, StudyEvent.kind, StudyEvent.amount, StudyEvent.created_at).where(
            StudyEvent.user_id.in_(member_ids), StudyEvent.created_at >= since
        )
    ).all()
    points: dict[str, int] = defaultdict(int)
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    active: dict[str, set[date]] = defaultdict(set)
    for uid, kind, amount, created in rows:
        if kind != "upload" and (kind != "listen" or amount >= 60):
            active[uid].add(created.date())
        if created >= week_start:
            counts[uid][kind] += 1
            points[uid] += POINTS.get(kind, 0) if kind != "listen" else int(amount // 300)  # 1 point per 5 min listened
    wins = _battle_wins_this_week(db, member_ids, week_start)
    for uid, n in wins.items():
        points[uid] += 20 * n

    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(member_ids)))}
    board = []
    for uid in member_ids:
        current, longest = _streaks(active[uid], today)
        board.append(
            {
                "userId": uid,
                "name": display_name(users[uid]),
                "points": points[uid],
                "streak": current,
                "badges": _badges(current, counts[uid], wins.get(uid, 0)),
            }
        )
    board.sort(key=lambda b: (-b["points"], -b["streak"], b["name"]))
    for i, b in enumerate(board):
        b["rank"] = i + 1
        if i == 0 and b["points"] > 0:
            b["badges"].insert(0, {"id": "top", "label": "Top of the week"})
    return board


def _badges(streak: int, counts: dict[str, int], wins: int) -> list[dict]:
    badges = []
    if streak >= 7:
        badges.append({"id": "streak7", "label": f"{streak}-day streak"})
    elif streak >= 3:
        badges.append({"id": "streak3", "label": f"{streak}-day streak"})
    if wins:
        badges.append({"id": "battle", "label": "Battle winner" if wins == 1 else f"{wins} battle wins"})
    if counts.get("exam", 0) >= 1:
        badges.append({"id": "exam", "label": "Mock exam done"})
    if counts.get("review", 0) >= 50:
        badges.append({"id": "cards", "label": "50+ cards reviewed"})
    return badges


def _battle_wins_this_week(db: Session, member_ids: list[str], week_start: datetime) -> dict[str, int]:
    wins: dict[str, int] = defaultdict(int)
    battles = db.scalars(
        select(Battle).join(BattlePlayer).where(Battle.status == "finished", Battle.started_at >= week_start, BattlePlayer.user_id.in_(member_ids)).distinct()
    ).all()
    for b in battles:
        if len(b.players) >= 2:
            best = max(b.players, key=lambda p: p.score)
            if best.score > 0 and best.user_id in member_ids:
                wins[best.user_id] += 1
    return wins


def room_detail(db: Session, user: User, room_id: str) -> dict:
    with acting_as(None):
        room, me = _membership(db, room_id, user.id)
        users = {u.id: u for u in db.scalars(select(User).where(User.id.in_([m.user_id for m in room.members])))}
        battles = db.scalars(select(Battle).where(Battle.room_id == room.id).order_by(Battle.created_at.desc()).limit(10)).all()
        return {
            "roomId": room.id,
            "name": room.name,
            "course": room.course,
            "joinCode": room.join_code,
            "isOwner": room.owner_id == user.id,
            "onLeaderboard": me.on_leaderboard,
            "members": [
                {"userId": m.user_id, "name": display_name(users[m.user_id]), "isOwner": m.user_id == room.owner_id, "isMe": m.user_id == user.id}
                for m in sorted(room.members, key=lambda m: m.created_at)
            ],
            "shares": [
                {
                    "shareId": s.id,
                    "title": s.title,
                    "sharedBy": display_name(users[s.shared_by]) if s.shared_by in users else "A former member",
                    "isMine": s.shared_by == user.id,
                    "saved": user.id in (s.saved_by or []),
                    "saveCount": len(s.saved_by or []),
                    "createdAt": s.created_at.isoformat() if s.created_at else None,
                }
                for s in room.shares
            ],
            "leaderboard": leaderboard(db, room),
            "battles": [battle_summary(b) for b in battles],
        }


def share_guide(db: Session, user: User, room_id: str, guide_id: str) -> None:
    # The guide must be the sharer's own (checked with the normal per-user scoping).
    guide = db.get(StudyGuide, guide_id)
    if guide is None or guide.status != "ready":
        raise AppError("NOT_FOUND", 404, "That study space doesn't exist or isn't ready yet.")
    with acting_as(None):
        room, _ = _membership(db, room_id, user.id)
        if any(s.guide_id == guide_id for s in room.shares):
            return
        room.shares.insert(0, RoomShare(guide_id=guide_id, shared_by=user.id, title=guide.title, saved_by=[]))
        db.commit()


def save_share(db: Session, user: User, room_id: str, share_id: str) -> str:
    """Copies a shared study space (with its pages, quiz, resources and fresh flashcards) into the member's library."""
    with acting_as(None):
        room, _ = _membership(db, room_id, user.id)
        share = next((s for s in room.shares if s.id == share_id), None)
        if share is None:
            raise AppError("NOT_FOUND", 404, "That shared study space is no longer available.")
        if share.shared_by == user.id:
            return share.guide_id
        new_id = clone_guide(db, share.guide_id, user.id)
        share.saved_by = [*(share.saved_by or []), user.id]
        db.commit()
        return new_id


def _copy(obj, **overrides):
    """A new row of the same type with the same column values, except the primary key and any overrides."""
    cls = type(obj)
    values = {c.key: getattr(obj, c.key) for c in cls.__table__.columns if not c.primary_key or c.key in overrides}
    values.pop("created_at", None)
    values.update(overrides)
    return cls(**values)


def clone_guide(db: Session, guide_id: str, to_user: str) -> str:
    src = db.get(StudyGuide, guide_id)
    if src is None:
        raise AppError("NOT_FOUND", 404, "That study space is no longer available.")
    doc = db.get(Document, src.document_id)
    new_doc = _copy(doc, id=new_uuid(), user_id=to_user)
    db.add(new_doc)
    db.flush()
    for c in db.scalars(select(DocumentChunk).where(DocumentChunk.document_id == doc.id)):
        db.add(_copy(c, document_id=new_doc.id))
    guide = _copy(src, id=new_uuid(), document_id=new_doc.id, user_id=to_user)
    db.add(guide)
    db.flush()
    for s in src.sections:
        db.add(_copy(s, guide_id=guide.id))
    for q in src.quiz_questions:
        db.add(_copy(q, guide_id=guide.id))
    for r in src.resources:
        db.add(_copy(r, guide_id=guide.id))
    now = _utcnow()
    for f in src.flashcards:
        db.add(
            Flashcard(
                guide_id=guide.id, user_id=to_user, front=f.front, back=f.back, source=f.source, due_at=now
            )
        )
    db.flush()
    return guide.id


# ---------------------------------------------------------------------------
# Quiz battles
# ---------------------------------------------------------------------------


def create_battle(db: Session, user: User, *, guide_id: str, room_id: str | None, seconds: int) -> Battle:
    guide = db.get(StudyGuide, guide_id)  # scoped: must be the host's own
    if guide is None or guide.status != "ready":
        raise AppError("NOT_FOUND", 404, "That study space doesn't exist or isn't ready yet.")
    questions = [
        {"question": q.question, "options": q.options, "correctIndex": q.correct_index, "explanation": q.explanation}
        for q in guide.quiz_questions
    ]
    if len(questions) < 3:
        raise AppError("NOT_ENOUGH_QUESTIONS", 409, "This study space needs a quiz before you can battle on it.")
    with acting_as(None):
        if room_id:
            _membership(db, room_id, user.id)
        battle = Battle(
            code=_code(db, Battle),
            host_id=user.id,
            room_id=room_id,
            title=guide.title[:300],
            questions=questions[:10],
            seconds_per_question=seconds,
        )
        battle.players = [BattlePlayer(user_id=user.id, name=display_name(user), answers={})]
        db.add(battle)
        db.commit()
        return battle


def _battle(db: Session, code: str) -> Battle:
    battle = db.scalar(select(Battle).where(Battle.code == code.strip().upper()))
    if battle is None:
        raise AppError("NOT_FOUND", 404, "No battle has that code.")
    return battle


def join_battle(db: Session, user: User, code: str) -> Battle:
    with acting_as(None):
        battle = _battle(db, code)
        if not any(p.user_id == user.id for p in battle.players):
            if battle.status != "lobby":
                raise AppError("ALREADY_STARTED", 409, "This battle has already started. Ask for a rematch!")
            if len(battle.players) >= MAX_PLAYERS:
                raise AppError("BATTLE_FULL", 409, "This battle is full.")
            battle.players.append(BattlePlayer(user_id=user.id, name=display_name(user), answers={}))
            db.commit()
        return battle


def start_battle(db: Session, user: User, code: str) -> Battle:
    with acting_as(None):
        battle = _battle(db, code)
        if battle.host_id != user.id:
            raise AppError("FORBIDDEN", 403, "Only the host can start the battle.")
        if battle.status == "lobby":
            battle.status = "live"
            battle.started_at = _utcnow() + timedelta(seconds=COUNTDOWN_SECONDS)
            db.commit()
        return battle


def _phase(battle: Battle, now: datetime) -> dict:
    """Where the battle is right now, derived from the clock so every player sees the same thing."""
    if battle.status == "lobby" or battle.started_at is None:
        return {"phase": "lobby"}
    elapsed = (now - battle.started_at).total_seconds()
    if elapsed < 0:
        return {"phase": "countdown", "secondsLeft": round(-elapsed, 1)}
    slot = battle.seconds_per_question + REVEAL_SECONDS
    index = int(elapsed // slot)
    if index >= len(battle.questions):
        return {"phase": "finished"}
    within = elapsed - index * slot
    if within < battle.seconds_per_question:
        return {"phase": "question", "index": index, "secondsLeft": round(battle.seconds_per_question - within, 1)}
    return {"phase": "reveal", "index": index, "secondsLeft": round(slot - within, 1)}


def _record_results(db: Session, battle: Battle) -> None:
    if battle.results_recorded:
        return
    battle.status = "finished"
    battle.results_recorded = True
    for p in battle.players:
        if p.answers:
            db.add(StudyEvent(user_id=p.user_id, kind="battle", ref_id=battle.id, amount=1))
    db.commit()


def battle_state(db: Session, user: User, code: str) -> dict:
    with acting_as(None):
        battle = _battle(db, code)
        me = next((p for p in battle.players if p.user_id == user.id), None)
        if me is None:
            raise AppError("NOT_A_PLAYER", 403, "Join the battle first.")
        state = _phase(battle, _utcnow())
        if state["phase"] == "finished":
            _record_results(db, battle)
        players = sorted(battle.players, key=lambda p: -p.score)
        out = {
            **battle_summary(battle),
            **state,
            "isHost": battle.host_id == user.id,
            "secondsPerQuestion": battle.seconds_per_question,
            "players": [
                {"name": p.name, "score": p.score, "isMe": p.user_id == user.id, "answered": str(state.get("index")) in (p.answers or {})}
                for p in players
            ],
        }
        if state["phase"] in ("question", "reveal"):
            i = state["index"]
            q = battle.questions[i]
            mine = (me.answers or {}).get(str(i))
            out["question"] = {"index": i, "text": q["question"], "options": q["options"], "myChoice": mine["choice"] if mine else None}
            if state["phase"] == "reveal":
                counts = [0] * len(q["options"])
                for p in battle.players:
                    a = (p.answers or {}).get(str(i))
                    if a is not None and 0 <= a["choice"] < len(counts):
                        counts[a["choice"]] += 1
                out["question"].update(
                    {"correctIndex": q["correctIndex"], "explanation": q["explanation"], "counts": counts, "myPoints": mine["points"] if mine else 0}
                )
        if state["phase"] == "finished":
            out["review"] = [
                {"question": q["question"], "answer": q["options"][q["correctIndex"]], "myChoice": ((me.answers or {}).get(str(i)) or {}).get("choice")}
                for i, q in enumerate(battle.questions)
            ]
        return out


def answer_battle(db: Session, user: User, code: str, index: int, choice: int) -> dict:
    with acting_as(None):
        battle = _battle(db, code)
        me = next((p for p in battle.players if p.user_id == user.id), None)
        if me is None:
            raise AppError("NOT_A_PLAYER", 403, "Join the battle first.")
        state = _phase(battle, _utcnow())
        if state["phase"] != "question" or state["index"] != index:
            raise AppError("TOO_LATE", 409, "Time's up for that question.")
        if str(index) in (me.answers or {}):
            raise AppError("ALREADY_ANSWERED", 409, "You've already answered this one.")
        q = battle.questions[index]
        if not 0 <= choice < len(q["options"]):
            raise AppError("INVALID_REQUEST", 400, "Pick one of the options.")
        correct = choice == q["correctIndex"]
        # Correct answers earn 500 to 1000 points: faster answers earn more.
        points = round(500 + 500 * state["secondsLeft"] / battle.seconds_per_question) if correct else 0
        me.answers = {**(me.answers or {}), str(index): {"choice": choice, "points": points}}
        me.score += points
        db.commit()
        return {"accepted": True}


def battle_summary(b: Battle) -> dict:
    return {
        "battleId": b.id,
        "code": b.code,
        "title": b.title,
        "status": b.status,
        "questionCount": len(b.questions),
        "playerCount": len(b.players),
        "roomId": b.room_id,
        "createdAt": b.created_at.isoformat() if b.created_at else None,
        "winner": max(b.players, key=lambda p: p.score).name if b.status == "finished" and b.players else None,
    }


def my_battles(db: Session, user: User) -> list[dict]:
    with acting_as(None):
        battles = db.scalars(
            select(Battle).join(BattlePlayer).where(BattlePlayer.user_id == user.id).order_by(Battle.created_at.desc()).limit(20)
        ).all()
        return [battle_summary(b) for b in battles]
