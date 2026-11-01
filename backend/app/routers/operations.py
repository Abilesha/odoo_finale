"""Scene 4 — the live big-day board."""
from __future__ import annotations

from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import RunSheetItem, RunSheetStatus, Staff, Wedding
from ..schemas import RunSheetItemIn, RunSheetItemUpdate, RunSheetStatusIn
from ..services.auth import check_wedding, current_user
from ..services.runsheet import board, check_in, generate_runsheet

router = APIRouter(prefix="/api/runsheet", tags=["4 · Big Day"])


@router.get("/{wedding_id}")
def get_board(
    wedding_id: int,
    simulate: str | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """The live board.

    `simulate` accepts an ISO timestamp so a demo can jump the clock to
    11:05 on the wedding morning and show the late alerts firing, without
    waiting for a real wedding to run late.
    """
    wedding = check_wedding(user, db.get(Wedding, wedding_id))

    now = None
    if simulate:
        try:
            now = datetime.fromisoformat(simulate)
        except ValueError as exc:
            raise HTTPException(400, "simulate must be an ISO timestamp") from exc

    return board(db, wedding, now)


@router.post("/{wedding_id}/generate")
def build_runsheet(
    wedding_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    wedding = check_wedding(user, db.get(Wedding, wedding_id))
    created = generate_runsheet(db, wedding)
    return {
        "created": created,
        "detail": f"{created} run-sheet slots created across 3 days."
        if created
        else "A run sheet already exists for this wedding.",
    }


@router.post("/{wedding_id}/items", status_code=201)
def add_item(
    wedding_id: int,
    payload: RunSheetItemIn,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    wedding = check_wedding(user, db.get(Wedding, wedding_id))

    data = payload.model_dump()
    data["start_time"] = time.fromisoformat(data["start_time"])
    if data.get("end_time"):
        data["end_time"] = time.fromisoformat(data["end_time"])

    item = RunSheetItem(wedding_id=wedding_id, sequence=len(wedding.runsheet), **data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "title": item.title}


item_router = APIRouter(prefix="/api/runsheet-items", tags=["4 · Big Day"])


@item_router.post("/{item_id}/checkin")
def vendor_check_in(
    item_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    """'The DJ has arrived.'  One tap on a phone at the venue."""
    item = db.get(RunSheetItem, item_id)
    if not item:
        raise HTTPException(404, "Run-sheet slot not found")
    check_wedding(user, item.wedding)
    check_in(db, item)
    return {
        "ok": True,
        "status": item.status.value,
        "checked_in_at": item.checked_in_at.strftime("%H:%M"),
        "detail": f"{item.vendor.name if item.vendor else 'Vendor'} checked in for "
        f"'{item.title}'.",
    }


@item_router.patch("/{item_id}/status")
def set_item_status(
    item_id: int,
    payload: RunSheetStatusIn,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    item = db.get(RunSheetItem, item_id)
    if not item:
        raise HTTPException(404, "Run-sheet slot not found")
    check_wedding(user, item.wedding)
    try:
        item.status = RunSheetStatus(payload.status)
    except ValueError as exc:
        raise HTTPException(400, f"Unknown status '{payload.status}'") from exc
    if item.status == RunSheetStatus.ARRIVED and item.checked_in_at is None:
        item.checked_in_at = datetime.now()
    db.commit()
    return {"ok": True, "status": item.status.value}


@item_router.patch("/{item_id}")
def edit_item(
    item_id: int,
    payload: RunSheetItemUpdate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Move a slot, rename it, hand it to another vendor or owner."""
    item = db.get(RunSheetItem, item_id)
    if not item:
        raise HTTPException(404, "Run-sheet slot not found")
    check_wedding(user, item.wedding)
    data = payload.model_dump(exclude_unset=True)
    try:
        for key in ("start_time", "end_time"):
            if data.get(key):
                data[key] = time.fromisoformat(data[key])
    except ValueError as exc:
        raise HTTPException(400, "Times look like 14:30") from exc
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    return {"ok": True, "detail": f"'{item.title}' updated."}
