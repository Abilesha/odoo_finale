"""Queries and complaints, from the agency's side.

A manager answers the couples whose wedding or enquiry they own.  The founder
sees every one, with complaints first — a complaint nobody answers is the
review that costs the next three bookings.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..db import get_db
from ..timeutil import utc_iso
from ..models import ClientTicket, Lead, Staff, TicketMessage, Wedding
from ..schemas import TicketReplyIn, TicketUpdateIn
from ..services.auth import current_user, sees_all_weddings

router = APIRouter(prefix="/api/tickets", tags=["8 · Couple portal"])


def _scoped(db: Session, user: Staff):
    q = db.query(ClientTicket)
    if sees_all_weddings(user):
        return q
    mine_w = db.query(Wedding.id).filter(Wedding.planner_id == user.id)
    mine_l = db.query(Lead.id).filter(Lead.owner_id == user.id)
    return q.filter(or_(
        ClientTicket.assigned_to_id == user.id,
        ClientTicket.wedding_id.in_(mine_w),
        ClientTicket.lead_id.in_(mine_l),
    ))


def _get(db: Session, user: Staff, ticket_id: int) -> ClientTicket:
    t = _scoped(db, user).filter(ClientTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Not found")
    return t


def _row(t: ClientTicket, with_messages: bool = False) -> dict:
    now = datetime.utcnow()
    row = {
        "id": t.id,
        "kind": t.kind,
        "topic": t.topic,
        "subject": t.subject,
        "status": t.status,
        "priority": t.priority,
        "awaiting": t.awaiting,
        "couple_name": t.lead.couple_name if t.lead else None,
        "client_name": t.client.name if t.client else None,
        "client_email": t.client.email if t.client else None,
        "client_phone": t.client.phone if t.client else None,
        "wedding_id": t.wedding_id,
        "wedding_code": t.wedding.code if t.wedding else None,
        "lead_id": t.lead_id,
        "assigned_to": t.assigned_to.name if t.assigned_to else None,
        "assigned_to_id": t.assigned_to_id,
        "created_at": utc_iso(t.created_at),
        "updated_at": utc_iso(t.updated_at),
        "resolved_at": utc_iso(t.resolved_at),
        # how long the couple has been waiting on the agency, in hours
        "waiting_hours": (
            round((now - t.updated_at).total_seconds() / 3600, 1)
            if t.awaiting == "planner" else 0
        ),
        "rating": t.rating,
        "rating_note": t.rating_note,
        "last_message": t.messages[-1].body[:160] if t.messages else None,
        "message_count": len(t.messages),
    }
    if with_messages:
        row["messages"] = [
            {"id": m.id, "author_kind": m.author_kind, "author_name": m.author_name,
             "body": m.body, "created_at": utc_iso(m.created_at)}
            for m in t.messages
        ]
    return row


@router.get("")
def list_tickets(
    status: str | None = None,
    kind: str | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    rows = _scoped(db, user).order_by(ClientTicket.updated_at.desc()).all()
    out = [_row(t) for t in rows]
    if status == "open":
        out = [r for r in out if r["status"] != "Resolved"]
    elif status:
        out = [r for r in out if r["status"] == status]
    if kind:
        out = [r for r in out if r["kind"] == kind]
    # what needs the agency first: unanswered complaints, then urgent, then oldest wait
    out.sort(key=lambda r: (
        r["status"] == "Resolved",
        r["awaiting"] != "planner",
        r["kind"] != "Complaint",
        r["priority"] != "Urgent",
        -r["waiting_hours"],
    ))
    all_rows = [_row(t) for t in rows]
    rated = [r["rating"] for r in all_rows if r["rating"]]
    return {
        "tickets": out,
        "counts": {
            "open": sum(1 for r in all_rows if r["status"] != "Resolved"),
            "awaiting_us": sum(1 for r in all_rows if r["awaiting"] == "planner"),
            "complaints_open": sum(
                1 for r in all_rows if r["kind"] == "Complaint" and r["status"] != "Resolved"),
            "resolved": sum(1 for r in all_rows if r["status"] == "Resolved"),
            "avg_rating": round(sum(rated) / len(rated), 1) if rated else None,
        },
    }


@router.get("/{ticket_id}")
def get_ticket(ticket_id: int, db: Session = Depends(get_db),
               user: Staff = Depends(current_user)):
    return _row(_get(db, user, ticket_id), True)


@router.post("/{ticket_id}/messages", status_code=201)
def answer(ticket_id: int, payload: TicketReplyIn, db: Session = Depends(get_db),
           user: Staff = Depends(current_user)):
    t = _get(db, user, ticket_id)
    db.add(TicketMessage(ticket_id=t.id, author_kind="staff", author_name=user.name,
                         staff_id=user.id, body=payload.message.strip()))
    if t.status == "Open":
        t.status = "In Progress"
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return {**_row(t, True), "detail": f"Sent to {t.client.name}."}


@router.patch("/{ticket_id}")
def update(ticket_id: int, payload: TicketUpdateIn, db: Session = Depends(get_db),
           user: Staff = Depends(current_user)):
    t = _get(db, user, ticket_id)
    data = payload.model_dump(exclude_unset=True)
    if "assigned_to_id" in data and not sees_all_weddings(user):
        raise HTTPException(403, "Only the founder hands a query to someone else")
    if data.get("assigned_to_id") is not None:
        if not db.get(Staff, data["assigned_to_id"]):
            raise HTTPException(404, "No such person")
    for k, v in data.items():
        setattr(t, k, v)
    if data.get("status") == "Resolved":
        t.resolved_at = datetime.utcnow()
    elif "status" in data:
        t.resolved_at = None
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return {**_row(t, True), "detail": f"{t.subject} — {t.status.lower()}."}
