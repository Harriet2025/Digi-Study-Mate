"""Study rooms (shared study spaces, leaderboards) and live quiz battles."""

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..social.service import (
    answer_battle,
    battle_state,
    battle_summary,
    create_battle,
    create_room,
    join_battle,
    join_room,
    leave_room,
    my_battles,
    my_rooms,
    room_detail,
    save_share,
    set_leaderboard_visibility,
    share_guide,
    start_battle,
)

router = APIRouter(prefix="/api", tags=["social"])


class RoomBody(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    course: str | None = Field(default=None, max_length=200)


class CodeBody(BaseModel):
    code: str = Field(min_length=4, max_length=12)


@router.get("/rooms")
def rooms(request: Request, db: Session = Depends(get_db)) -> list[dict]:
    return my_rooms(db, request.state.user)


@router.post("/rooms", status_code=201)
def new_room(body: RoomBody, request: Request, db: Session = Depends(get_db)) -> dict:
    room = create_room(db, request.state.user, name=body.name, course=body.course)
    return room_detail(db, request.state.user, room.id)


@router.post("/rooms/join")
def join(body: CodeBody, request: Request, db: Session = Depends(get_db)) -> dict:
    room = join_room(db, request.state.user, body.code)
    return room_detail(db, request.state.user, room.id)


@router.get("/rooms/{room_id}")
def room(room_id: str, request: Request, db: Session = Depends(get_db)) -> dict:
    return room_detail(db, request.state.user, room_id)


class ShareBody(BaseModel):
    guideId: str = Field(min_length=36, max_length=36)


@router.post("/rooms/{room_id}/shares")
def share(room_id: str, body: ShareBody, request: Request, db: Session = Depends(get_db)) -> dict:
    share_guide(db, request.state.user, room_id, body.guideId)
    return room_detail(db, request.state.user, room_id)


@router.post("/rooms/{room_id}/shares/{share_id}/save")
def save(room_id: str, share_id: str, request: Request, db: Session = Depends(get_db)) -> dict:
    """Copies the shared study space into your library (your own private copy)."""
    return {"guideId": save_share(db, request.state.user, room_id, share_id)}


class VisibilityBody(BaseModel):
    onLeaderboard: bool


@router.put("/rooms/{room_id}/leaderboard")
def visibility(room_id: str, body: VisibilityBody, request: Request, db: Session = Depends(get_db)) -> dict:
    set_leaderboard_visibility(db, request.state.user, room_id, body.onLeaderboard)
    return room_detail(db, request.state.user, room_id)


@router.delete("/rooms/{room_id}/membership", status_code=204)
def leave(room_id: str, request: Request, db: Session = Depends(get_db)) -> Response:
    leave_room(db, request.state.user, room_id)
    return Response(status_code=204)


# --- Battles -----------------------------------------------------------------


class BattleBody(BaseModel):
    guideId: str = Field(min_length=36, max_length=36)
    roomId: str | None = Field(default=None, min_length=36, max_length=36)
    secondsPerQuestion: int = Field(default=20, ge=10, le=60)


@router.post("/battles", status_code=201)
def new_battle(body: BattleBody, request: Request, db: Session = Depends(get_db)) -> dict:
    battle = create_battle(db, request.state.user, guide_id=body.guideId, room_id=body.roomId, seconds=body.secondsPerQuestion)
    return battle_summary(battle)


@router.get("/battles")
def battles(request: Request, db: Session = Depends(get_db)) -> list[dict]:
    return my_battles(db, request.state.user)


@router.post("/battles/{code}/join")
def join_a_battle(code: str, request: Request, db: Session = Depends(get_db)) -> dict:
    join_battle(db, request.state.user, code)
    return battle_state(db, request.state.user, code)


@router.post("/battles/{code}/start")
def start(code: str, request: Request, db: Session = Depends(get_db)) -> dict:
    start_battle(db, request.state.user, code)
    return battle_state(db, request.state.user, code)


@router.get("/battles/{code}")
def state(code: str, request: Request, db: Session = Depends(get_db)) -> dict:
    """Polled about once a second by every player; the phase is worked out from the shared clock."""
    return battle_state(db, request.state.user, code)


class AnswerBody(BaseModel):
    index: int = Field(ge=0, le=50)
    choice: int = Field(ge=0, le=10)


@router.post("/battles/{code}/answer")
def answer(code: str, body: AnswerBody, request: Request, db: Session = Depends(get_db)) -> dict:
    return answer_battle(db, request.state.user, code, body.index, body.choice)
