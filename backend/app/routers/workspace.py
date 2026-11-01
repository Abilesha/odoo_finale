"""A manager's own day: their weddings, their countdowns, their checklist.

Everything here is already scoped by `scope_weddings` — a manager sees the
weddings the founder assigned them and nothing else.  The founder can open the
same screens and sees every wedding.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..timeutil import utc_iso
from ..models import (
    ClientTicket,
    Lead,
    LeadStage,
    MilestoneStatus,
    QuoteRequest,
    QuoteStatus,
    RFQStatus,
    Staff,
    TaskStage,
    VendorBill,
    VendorContract,
    VendorUpdate,
    Wedding,
    WeddingStatus,
)
from ..services.auth import (
    check_wedding,
    current_user,
    scope_weddings,
    sees_all_weddings,
    user_payload,
)
from ..services.finance import evaluate_bill
from ..services.runsheet import board

router = APIRouter(prefix="/api/my", tags=["3 · Weddings & Plan"])
updates_router = APIRouter(prefix="/api/vendor-updates", tags=["3 · Weddings & Plan"])

ACTIVE = (WeddingStatus.PLANNING, WeddingStatus.EXECUTION)

#: When each of the three days usually starts, if the run sheet is not built
#: yet.  Once it is, the first slot of the day is used instead.
DAY_EVENTS = [
    (1, "Mehendi", time(11, 0)),
    (2, "Sangeet", time(18, 30)),
    (3, "Wedding & Reception", time(9, 0)),
]


def _my_weddings(db: Session, user: Staff, active_only: bool = True) -> list[Wedding]:
    q = scope_weddings(db.query(Wedding), user)
    if active_only:
        q = q.filter(Wedding.status.in_(ACTIVE))
    return q.order_by(Wedding.day1_date).all()


def _events(w: Wedding) -> list[dict]:
    """The three days as moments in time, for the countdown timers."""
    dates = {1: w.day1_date, 2: w.day2_date, 3: w.day3_date}
    out = []
    for day, name, default in DAY_EVENTS:
        slots = [i for i in w.runsheet if i.day_number == day]
        start = min((i.start_time for i in slots), default=default)
        out.append({
            "day": day,
            "name": name,
            "date": dates[day].isoformat(),
            "starts_at": datetime.combine(dates[day], start).isoformat(),
        })
    return out


def _task_row(t, today: date) -> dict:
    if t.stage == TaskStage.DONE:
        bucket = "finished"
    elif (t.is_overdue and not t.for_client) or t.stage == TaskStage.BLOCKED:
        bucket = "pending"
    else:
        bucket = "upcoming"
    return {
        "id": t.id,
        "title": t.title,
        "phase": t.phase.value,
        "stage": t.stage.value,
        "owner": t.owner.name if t.owner else None,
        "owner_id": t.owner_id,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "days_left": (t.due_date - today).days if t.due_date else None,
        "overdue": t.is_overdue,
        "notes": t.notes,
        "bucket": bucket,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "wedding_id": t.wedding_id,
        "wedding_code": t.wedding.code,
        "couple_name": t.wedding.couple_name,
        "for_client": bool(t.for_client),
    }


def _update_row(u: VendorUpdate) -> dict:
    return {
        "id": u.id,
        "vendor": u.vendor.name if u.vendor else None,
        "vendor_id": u.vendor_id,
        "category": u.contract.category if u.contract else None,
        "status": u.status,
        "progress_pct": u.progress_pct,
        "message": u.message,
        "expected_by": u.expected_by.isoformat() if u.expected_by else None,
        "created_at": utc_iso(u.created_at),
        "acknowledged": u.acknowledged_at is not None,
        "wedding_id": u.wedding_id,
        "wedding_code": u.wedding.code if u.wedding else None,
        "couple_name": u.wedding.couple_name if u.wedding else None,
    }


@router.get("/overview")
def overview(db: Session = Depends(get_db), user: Staff = Depends(current_user)):
    """Everything a manager needs on one screen when they open the app."""
    today = date.today()
    now = datetime.now()
    weddings = _my_weddings(db, user)
    ids = [w.id for w in weddings]

    # ---- the next three days that matter -----------------------------------
    events = []
    for w in weddings:
        if w.day3_date < today:
            continue
        moments = _events(w)
        upcoming = [m for m in moments if datetime.fromisoformat(m["starts_at"]) > now]
        events.append({
            "wedding_id": w.id,
            "code": w.code,
            "couple_name": w.couple_name,
            "venue": w.venue,
            "city": w.city,
            "theme": w.theme,
            "guest_count": w.guest_count,
            "status": w.status.value,
            "day1_date": w.day1_date.isoformat(),
            "day3_date": w.day3_date.isoformat(),
            "days_to_go": (w.day1_date - today).days,
            "live": w.day1_date <= today <= w.day3_date,
            "events": moments,
            "next_moment": upcoming[0] if upcoming else None,
            "progress_pct": round(
                100 * sum(1 for t in w.tasks if t.stage == TaskStage.DONE) / len(w.tasks), 1
            ) if w.tasks else 0.0,
            "task_overdue": sum(1 for t in w.tasks if t.is_overdue and not t.for_client),
        })

    # ---- live today --------------------------------------------------------
    live = []
    for w in weddings:
        if w.day1_date <= today <= w.day3_date and w.runsheet:
            b = board(db, w, None)
            live.append({
                "wedding_id": w.id,
                "code": w.code,
                "couple_name": w.couple_name,
                "venue": w.venue,
                "active_day": b["active_day"],
                "progress_pct": b["progress_pct"],
                "completed_slots": b["completed_slots"],
                "total_slots": b["total_slots"],
                "alerts": b["alerts"][:4],
                "server_time": b["server_time"],
            })

    # ---- checklist ---------------------------------------------------------
    tasks = [_task_row(t, today) for w in weddings for t in w.tasks]
    pending = sorted(
        (t for t in tasks if t["bucket"] == "pending"),
        key=lambda t: t["due_date"] or "9999",
    )
    upcoming_tasks = sorted(
        (t for t in tasks if t["bucket"] == "upcoming" and t["due_date"]
         and t["days_left"] is not None and t["days_left"] <= 14),
        key=lambda t: t["due_date"],
    )
    finished_recent = sorted(
        (t for t in tasks if t["bucket"] == "finished" and t["completed_at"]
         and t["completed_at"] >= (now - timedelta(days=14)).isoformat()),
        key=lambda t: t["completed_at"],
        reverse=True,
    )

    # ---- money in ----------------------------------------------------------
    payments = sorted(
        (
            {
                "id": m.id,
                "wedding_id": w.id,
                "couple_name": w.couple_name,
                "code": w.code,
                "kind": m.kind.value,
                "amount": m.amount,
                "due_date": m.due_date.isoformat(),
                "status": m.status.value,
                "overdue": m.is_overdue,
                "days_left": (m.due_date - today).days,
                "client_reference": m.client_reference,
            }
            for w in weddings for m in w.milestones
            if m.status != MilestoneStatus.PAID
        ),
        key=lambda p: p["due_date"],
    )

    # ---- money out ---------------------------------------------------------
    bills = [
        evaluate_bill(db, b)
        for b in db.query(VendorBill).join(VendorContract)
        .filter(VendorContract.wedding_id.in_(ids or [0]), VendorBill.paid_at.is_(None))
        .all()
    ]

    # ---- quotes in flight --------------------------------------------------
    rfqs = []
    for r in db.query(QuoteRequest).filter(QuoteRequest.wedding_id.in_(ids or [0])):
        received = sum(1 for q in r.quotes if q.status != QuoteStatus.PENDING and not q.declined)
        waiting = sum(1 for q in r.quotes if q.status == QuoteStatus.PENDING)
        if r.status == RFQStatus.AWARDED:
            stage = "Decided"
        elif r.awaiting_couple:
            stage = "With the couple"
        elif waiting and not received:
            stage = "Waiting on vendors"
        else:
            stage = "Ready to compare"
        rfqs.append({
            "id": r.id,
            "title": r.title,
            "category": r.category,
            "wedding_id": r.wedding_id,
            "couple_name": r.wedding.couple_name,
            "status": r.status.value,
            "stage": stage,
            "received": received,
            "waiting": waiting,
            "invited": len(r.quotes),
            "chosen_by_name": r.chosen_by_name,
        })

    # ---- agreements --------------------------------------------------------
    lq = db.query(Lead).filter(Lead.stage.notin_([LeadStage.WON, LeadStage.LOST]))
    if not sees_all_weddings(user):
        lq = lq.filter(Lead.owner_id == user.id)
    agreements = []
    for lead in lq.all():
        ag = lead.agreement
        agreements.append({
            "lead_id": lead.id,
            "couple_name": lead.couple_name,
            "stage": lead.stage.value,
            "agreement": None if not ag else {
                "signed": ag.is_signed,
                "sent_at": ag.sent_at.isoformat(),
                "signed_at": ag.signed_at.isoformat() if ag.signed_at else None,
                "signer_name": ag.signer_name,
                "sign_url": f"/sign/{ag.token}",
                "quoted_fee": ag.quoted_fee,
            },
        })

    # ---- what vendors are saying ------------------------------------------
    updates = (
        db.query(VendorUpdate)
        .filter(VendorUpdate.wedding_id.in_(ids or [0]))
        .order_by(VendorUpdate.created_at.desc())
        .limit(30)
        .all()
    )
    update_rows = [_update_row(u) for u in updates]
    # bad news first, and bad news nobody has read yet before that
    update_rows.sort(key=lambda u: (
        u["acknowledged"],
        u["status"] not in ("Delayed", "Blocked"),
    ))

    from .tickets import _row as _ticket_row, _scoped as _tickets_for

    open_tickets = [
        _ticket_row(t) for t in _tickets_for(db, user).filter(ClientTicket.status != "Resolved")
    ]
    open_tickets.sort(key=lambda r: (r["awaiting"] != "planner", r["kind"] != "Complaint", -r["waiting_hours"]))

    return {
        "me": user_payload(user),
        "sees_all": sees_all_weddings(user),
        "client_queries": open_tickets[:6],
        "today": today.isoformat(),
        "server_time": now.isoformat(timespec="seconds"),
        "stats": {
            "weddings_active": len(weddings),
            "live_now": len(live),
            "tasks_open": sum(1 for t in tasks if t["bucket"] != "finished"),
            "tasks_pending": len(pending),
            "tasks_due_14d": len(upcoming_tasks),
            "tasks_finished": sum(1 for t in tasks if t["bucket"] == "finished"),
            "payments_due": round(sum(p["amount"] for p in payments), 2),
            "payments_overdue": sum(1 for p in payments if p["overdue"]),
            "bills_to_pay": len(bills),
            "quotes_open": sum(1 for r in rfqs if r["stage"] != "Decided"),
            "vendor_alerts": sum(
                1 for u in update_rows
                if u["status"] in ("Delayed", "Blocked") and not u["acknowledged"]
            ),
            "client_queries": sum(1 for r in open_tickets if r["awaiting"] == "planner"),
            "complaints_open": sum(1 for r in open_tickets if r["kind"] == "Complaint"),
            "payments_reported": sum(1 for w in weddings for m in w.milestones
                                     if m.client_reference and m.status != MilestoneStatus.PAID),
        },
        "events": events,
        "live": live,
        "tasks": {
            "pending": pending[:12],
            "upcoming": upcoming_tasks[:12],
            "finished": finished_recent[:8],
        },
        "payments": payments[:12],
        "bills": bills[:10],
        "rfqs": rfqs,
        "agreements": agreements,
        "vendor_updates": update_rows[:12],
    }


@router.get("/tasks")
def my_tasks(
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """The checklist across every wedding I run, bucketed into pending
    (late or stuck), upcoming and finished."""
    today = date.today()
    if wedding_id:
        weddings = [check_wedding(user, db.get(Wedding, wedding_id))]
    else:
        weddings = _my_weddings(db, user)
    rows = [_task_row(t, today) for w in weddings for t in w.tasks]
    rows.sort(key=lambda t: (t["due_date"] or "9999", t["id"]))
    counts = {b: sum(1 for r in rows if r["bucket"] == b) for b in ("pending", "upcoming", "finished")}
    return {
        "counts": {**counts, "all": len(rows)},
        "tasks": rows,
        "weddings": [
            {"id": w.id, "code": w.code, "couple_name": w.couple_name} for w in weddings
        ],
    }


@router.get("/payments")
def my_payments(db: Session = Depends(get_db), user: Staff = Depends(current_user)):
    """Money in from couples and money out to vendors, for my weddings."""
    today = date.today()
    weddings = _my_weddings(db, user, active_only=False)
    ids = [w.id for w in weddings]
    milestones = sorted(
        (
            {
                "id": m.id,
                "wedding_id": w.id,
                "couple_name": w.couple_name,
                "code": w.code,
                "kind": m.kind.value,
                "percent": m.percent,
                "amount": m.amount,
                "due_date": m.due_date.isoformat(),
                "status": m.status.value,
                "overdue": m.is_overdue,
                "paid_at": m.paid_at.isoformat() if m.paid_at else None,
                "reference": m.reference,
                "days_left": (m.due_date - today).days,
                "client_reference": m.client_reference,
                "client_reported_at": m.client_reported_at.isoformat() if m.client_reported_at else None,
            }
            for w in weddings for m in w.milestones
        ),
        key=lambda p: p["due_date"],
    )
    bills = [
        evaluate_bill(db, b)
        for b in db.query(VendorBill).join(VendorContract)
        .filter(VendorContract.wedding_id.in_(ids or [0]))
        .all()
    ]
    received = sum(m["amount"] for m in milestones if m["status"] == "Paid")
    due = sum(m["amount"] for m in milestones if m["status"] != "Paid")
    return {
        "summary": {
            "received": round(received, 2),
            "due": round(due, 2),
            "overdue": round(sum(m["amount"] for m in milestones if m["overdue"]), 2),
            "bills_open": sum(1 for b in bills if not b.get("paid_at")),
            "bills_payable": round(
                sum(b["net_payable"] for b in bills if b.get("payable")), 2
            ),
            "bills_blocked": sum(1 for b in bills if b["match_status"] == "Blocked"),
        },
        "milestones": milestones,
        "bills": bills,
    }


@updates_router.get("")
def list_updates(
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    q = scope_weddings(db.query(VendorUpdate).join(Wedding), user)
    if wedding_id:
        q = q.filter(VendorUpdate.wedding_id == wedding_id)
    return [_update_row(u) for u in q.order_by(VendorUpdate.created_at.desc()).limit(100)]


@updates_router.post("/{update_id}/ack")
def acknowledge(
    update_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    """'Seen it, on it.'  The vendor sees that their manager read the update."""
    u = db.get(VendorUpdate, update_id)
    if not u:
        raise HTTPException(404, "Update not found")
    check_wedding(user, u.wedding)
    if u.acknowledged_at is None:
        u.acknowledged_at = datetime.utcnow()
        db.commit()
    return {"ok": True, "detail": f"Marked as seen — {u.vendor.name} will see that."}
