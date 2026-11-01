"""The founder's control panel over people: who runs which wedding, and how
each of them is doing.

The founder's question is never "how many tasks exist" — it is "is Isha
drowning, and is anything about to go wrong at the Udaipur wedding?"  So every
manager comes back with the same handful of honest numbers: what they carry,
what is late, what vendors have flagged, and when their next wedding starts.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..timeutil import utc_iso
from ..models import (
    ClientTicket,
    Lead,
    LeadStage,
    MilestoneStatus,
    Staff,
    TaskStage,
    TimeLog,
    VendorUpdate,
    Wedding,
    WeddingStatus,
)
from ..services.auth import normalise_role

router = APIRouter(prefix="/api/managers", tags=["6 · Founder"])

ACTIVE = (WeddingStatus.PLANNING, WeddingStatus.EXECUTION)


def _is_live(w: Wedding, today: date) -> bool:
    return w.day1_date <= today <= w.day3_date and w.status != WeddingStatus.CANCELLED


def _open_delays(weddings: list[Wedding]) -> list[VendorUpdate]:
    """The latest word from each vendor, where that word is bad news."""
    out = []
    for w in weddings:
        for c in w.contracts:
            if c.updates and c.updates[0].status in ("Delayed", "Blocked"):
                out.append(c.updates[0])
    return out


def manager_metrics(db: Session, m: Staff) -> dict:
    today = date.today()
    weddings = db.query(Wedding).filter(Wedding.planner_id == m.id).all()
    active = [w for w in weddings if w.status in ACTIVE]
    completed = [w for w in weddings if w.status == WeddingStatus.COMPLETED]
    live = [w for w in weddings if _is_live(w, today)]

    # the couple's own to-dos are theirs to tick, not the manager's to be late on
    tasks = [t for w in active for t in w.tasks if not t.for_client]
    open_tasks = [t for t in tasks if t.stage != TaskStage.DONE]
    overdue = [t for t in open_tasks if t.is_overdue]
    done = [t for t in tasks if t.stage == TaskStage.DONE]
    due_week = [
        t for t in open_tasks
        if t.due_date and today <= t.due_date <= today + timedelta(days=7)
    ]
    blocked = [t for t in open_tasks if t.stage == TaskStage.BLOCKED]

    upcoming = sorted(
        (w for w in active if w.day3_date >= today), key=lambda w: w.day1_date
    )
    nxt = upcoming[0] if upcoming else None

    overdue_payments = [
        ms for w in active for ms in w.milestones
        if ms.status != MilestoneStatus.PAID and ms.due_date < today
    ]
    delays = _open_delays(active)

    open_leads = (
        db.query(Lead)
        .filter(Lead.owner_id == m.id, Lead.stage.notin_([LeadStage.WON, LeadStage.LOST]))
        .count()
    )
    since = today - timedelta(days=30)
    hours_30 = sum(
        t.hours for t in db.query(TimeLog).filter(
            TimeLog.staff_id == m.id, TimeLog.log_date >= since
        )
    )
    last_done = max((t.completed_at for t in done if t.completed_at), default=None)

    ids = [w.id for w in weddings]
    lead_ids = [x.id for x in db.query(Lead.id).filter(Lead.owner_id == m.id)]
    tickets = [
        t for t in db.query(ClientTicket).filter(ClientTicket.status != "Resolved").all()
        if t.assigned_to_id == m.id or t.wedding_id in ids or t.lead_id in lead_ids
    ]
    complaints = [t for t in tickets if t.kind == "Complaint"]
    unanswered = [t for t in tickets if t.awaiting == "planner"]
    rated = [
        t.rating for t in db.query(ClientTicket).filter(ClientTicket.rating.isnot(None)).all()
        if t.assigned_to_id == m.id or t.wedding_id in ids
    ]

    # Health is about the work, not the person: late tasks and vendor
    # trouble are what turn into a bad wedding day.
    # Fixed costs per problem, not a ratio: five late tasks are five late
    # tasks whether the manager carries forty or four hundred.
    score = (
        100
        - min(50, 5 * len(overdue))
        - 10 * len(delays)
        - 8 * len(overdue_payments)
        - 5 * len(blocked)
        - 8 * len(complaints)
    )
    score = max(0, min(100, score))
    health = "On track" if score >= 80 else "Needs attention" if score >= 55 else "At risk"

    load = len(active)
    workload = "Light" if load <= 2 else "Balanced" if load <= 4 else "Heavy"

    return {
        "id": m.id,
        "name": m.name,
        "title": m.title,
        "role": normalise_role(m.role),
        "email": m.email,
        "phone": m.phone,
        "city": m.city,
        "joined_on": m.joined_on.isoformat() if m.joined_on else None,
        "active": m.active,
        "hourly_cost": m.hourly_cost,
        "weddings_total": len(weddings),
        "weddings_active": len(active),
        "weddings_completed": len(completed),
        "weddings_live": len(live),
        "live": [{"id": w.id, "code": w.code, "couple_name": w.couple_name} for w in live],
        "tasks_total": len(tasks),
        "tasks_done": len(done),
        "tasks_open": len(open_tasks),
        "tasks_overdue": len(overdue),
        "tasks_due_week": len(due_week),
        "tasks_blocked": len(blocked),
        "completion_pct": round(100 * len(done) / len(tasks), 1) if tasks else 0.0,
        "payments_overdue": len(overdue_payments),
        "payments_overdue_amount": round(sum(p.amount for p in overdue_payments), 2),
        "vendor_delays": len(delays),
        "open_leads": open_leads,
        "queries_open": len(tickets),
        "queries_unanswered": len(unanswered),
        "complaints_open": len(complaints),
        "client_rating": round(sum(rated) / len(rated), 1) if rated else None,
        "hours_30d": round(hours_30, 1),
        "last_activity": last_done.isoformat() if last_done else None,
        "health_score": score,
        "health": health,
        "workload": workload,
        "next_event": (
            {
                "wedding_id": nxt.id,
                "code": nxt.code,
                "couple_name": nxt.couple_name,
                "day1_date": nxt.day1_date.isoformat(),
                "venue": nxt.venue,
                "days_to_go": (nxt.day1_date - today).days,
            }
            if nxt else None
        ),
    }


def _wedding_row(w: Wedding, today: date) -> dict:
    total = len(w.tasks)
    done = sum(1 for t in w.tasks if t.stage == TaskStage.DONE)
    return {
        "id": w.id,
        "code": w.code,
        "couple_name": w.couple_name,
        "status": w.status.value,
        "venue": w.venue,
        "city": w.city,
        "day1_date": w.day1_date.isoformat(),
        "days_to_go": (w.day1_date - today).days,
        "guest_count": w.guest_count,
        "progress_pct": round(100 * done / total, 1) if total else 0.0,
        "task_overdue": sum(1 for t in w.tasks if t.is_overdue and not t.for_client),
        "live": _is_live(w, today),
        "manager_id": w.planner_id,
        "manager": w.planner.name if w.planner else None,
        "assigned_at": w.assigned_at.isoformat() if w.assigned_at else None,
    }


@router.get("")
def list_managers(db: Session = Depends(get_db)):
    """Every manager with their load and how it is going, plus the weddings
    nobody has been given yet."""
    today = date.today()
    staff = db.query(Staff).filter(Staff.active.is_(True)).order_by(Staff.name).all()
    managers = [s for s in staff if normalise_role(s.role) == "Manager"]
    rows = [manager_metrics(db, m) for m in managers]

    open_weddings = (
        db.query(Wedding)
        .filter(Wedding.status.in_(ACTIVE))
        .order_by(Wedding.day1_date)
        .all()
    )
    unassigned = [w for w in open_weddings if not w.planner_id]

    return {
        "count": len(rows),
        "managers": rows,
        "totals": {
            "managers": len(rows),
            "active_weddings": len(open_weddings),
            "unassigned": len(unassigned),
            "overdue_tasks": sum(r["tasks_overdue"] for r in rows),
            "vendor_delays": sum(r["vendor_delays"] for r in rows),
            "at_risk": sum(1 for r in rows if r["health"] == "At risk"),
            "complaints_open": db.query(ClientTicket).filter(
                ClientTicket.kind == "Complaint", ClientTicket.status != "Resolved").count(),
            "live_now": sum(r["weddings_live"] for r in rows),
        },
        "unassigned": [_wedding_row(w, today) for w in unassigned],
        # every open wedding, for the founder's assignment board
        "assignments": [_wedding_row(w, today) for w in open_weddings],
    }


@router.get("/{manager_id}")
def manager_detail(manager_id: int, db: Session = Depends(get_db)):
    """One manager in full: their weddings, what is late, what they finished."""
    m = db.get(Staff, manager_id)
    if not m:
        raise HTTPException(404, "No such manager")
    today = date.today()
    weddings = (
        db.query(Wedding)
        .filter(Wedding.planner_id == m.id)
        .order_by(Wedding.day1_date)
        .all()
    )
    active = [w for w in weddings if w.status in ACTIVE]

    overdue = sorted(
        (t for w in active for t in w.tasks if t.is_overdue and not t.for_client),
        key=lambda t: t.due_date,
    )
    recent = sorted(
        (t for w in weddings for t in w.tasks if t.completed_at),
        key=lambda t: t.completed_at,
        reverse=True,
    )[:10]
    delays = _open_delays(active)

    def task_row(t):
        return {
            "id": t.id,
            "title": t.title,
            "stage": t.stage.value,
            "phase": t.phase.value,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "days_late": (today - t.due_date).days if t.due_date and t.due_date < today else 0,
            "completed_at": utc_iso(t.completed_at),
            "wedding_id": t.wedding_id,
            "wedding_code": t.wedding.code,
            "couple_name": t.wedding.couple_name,
        }

    return {
        **manager_metrics(db, m),
        "weddings": [_wedding_row(w, today) for w in weddings],
        "overdue_tasks": [task_row(t) for t in overdue[:25]],
        "recently_done": [task_row(t) for t in recent],
        "delays": [
            {
                "vendor": u.vendor.name if u.vendor else None,
                "category": u.contract.category,
                "status": u.status,
                "message": u.message,
                "expected_by": u.expected_by.isoformat() if u.expected_by else None,
                "couple_name": u.wedding.couple_name,
                "wedding_id": u.wedding_id,
                "created_at": utc_iso(u.created_at),
            }
            for u in delays
        ],
        "generated_at": datetime.utcnow().isoformat(),
    }
