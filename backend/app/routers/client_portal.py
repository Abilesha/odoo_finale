"""The couple's portal.

A couple signs in and sees their own wedding as it comes together: where they
are in the journey, a countdown, the timeline, what they still have to do,
what they have paid, who their vendors are, the schedule for the three days,
their service agreement — and a place to ask a question or raise a
complaint that their planner has to answer.

Everything is scoped to the signed-in couple.  They see their wedding the
way a client should: what they pay the agency and never what the agency pays
its vendors, the plan for the day and never which vendor is running late
(that is the planner's problem to solve, not the bride's to watch).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..timeutil import utc_iso
from ..models import (
    ClientAccount,
    ClientTicket,
    Lead,
    LeadStage,
    MilestoneStatus,
    QuoteStatus,
    RFQStatus,
    Staff,
    Task,
    TaskPhase,
    TaskStage,
    TicketMessage,
    Wedding,
    WeddingStatus,
)
from ..schemas import (
    AgreementSign,
    ClientProfileIn,
    EnquiryIn,
    PaymentReportIn,
    TicketIn,
    TicketRateIn,
    TicketReplyIn,
)
from ..services.auth import (
    client_payload,
    create_client_token,
    current_client,
    hash_password,
    normalise_role,
    verify_password,
)
from .leads import record_signature
from .workspace import _events

router = APIRouter(prefix="/api/client", tags=["8 · Couple portal"])
enquiry_router = APIRouter(prefix="/api/enquire", tags=["8 · Couple portal"])

DAY_NAMES = {1: "Mehendi", 2: "Sangeet", 3: "Wedding & Reception"}

#: The couple's journey, in order.  Every screen hangs off where they are in it.
JOURNEY = [
    ("enquiry", "Enquiry"),
    ("meeting", "First meeting"),
    ("agreement", "Agreement"),
    ("booked", "Booked"),
    ("planning", "Planning"),
    ("wedding", "The wedding"),
    ("complete", "Married"),
]


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _wedding(client: ClientAccount) -> Wedding | None:
    return client.lead.wedding if client.lead else None


class NotBooked(Exception):
    """The couple has not been booked yet — not an error, just early."""


def _need_wedding(client: ClientAccount) -> Wedding:
    w = _wedding(client)
    if not w:
        raise NotBooked()
    return w


def _not_booked(client: ClientAccount) -> dict:
    return {
        "booked": False,
        "planner": _planner_card(_planner(client)),
        "detail": "Your wedding file opens once your agreement is signed and the booking is confirmed.",
    }


def booked_only(fn):
    """Wedding screens answer "not booked yet" plainly instead of failing —
    a couple who has only enquired is early, not wrong."""
    import functools
    import inspect

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except NotBooked:
            return _not_booked(kwargs["c"])

    wrapper.__signature__ = inspect.signature(fn)
    return wrapper


def _planner(client: ClientAccount) -> Staff | None:
    w = _wedding(client)
    if w and w.planner:
        return w.planner
    return client.lead.owner if client.lead else None


def _planner_card(p: Staff | None) -> dict | None:
    if not p:
        return None
    return {"name": p.name, "title": p.title or "Wedding Manager",
            "phone": p.phone, "email": p.email, "city": p.city}


def _stage(lead: Lead, w: Wedding | None) -> str:
    today = date.today()
    if w:
        if w.status == WeddingStatus.COMPLETED or w.day3_date < today:
            return "complete"
        if w.day1_date <= today <= w.day3_date or w.status == WeddingStatus.EXECUTION:
            return "wedding"
        done = sum(1 for t in w.tasks if t.stage == TaskStage.DONE)
        return "planning" if done else "booked"
    if lead.agreement:
        return "agreement"
    if lead.stage in (LeadStage.MEETING, LeadStage.CONTACTED):
        return "meeting"
    return "enquiry"


def _progress(w: Wedding) -> float:
    planner = [t for t in w.tasks if not t.for_client]
    if not planner:
        return 0.0
    return round(100 * sum(1 for t in planner if t.stage == TaskStage.DONE) / len(planner), 1)


def _money(w: Wedding) -> dict:
    extras = [co for co in w.change_orders if co.billed_to_client]
    extras_total = round(sum(co.client_amount for co in extras), 2)
    paid = round(sum(m.amount for m in w.milestones if m.status == MilestoneStatus.PAID), 2)
    total = round(w.package_value + extras_total, 2)
    return {
        "package_value": w.package_value,
        "extras_total": extras_total,
        "total": total,
        "paid": paid,
        "outstanding": round(max(total - paid, 0), 2),
        "paid_pct": round(100 * paid / total, 1) if total else 0.0,
    }


def _ticket_row(t: ClientTicket, with_messages: bool = False) -> dict:
    row = {
        "id": t.id,
        "kind": t.kind,
        "topic": t.topic,
        "subject": t.subject,
        "status": t.status,
        "priority": t.priority,
        "awaiting": t.awaiting,
        "created_at": utc_iso(t.created_at),
        "updated_at": utc_iso(t.updated_at),
        "resolved_at": utc_iso(t.resolved_at),
        "rating": t.rating,
        "rating_note": t.rating_note,
        "assigned_to": t.assigned_to.name if t.assigned_to else None,
        "message_count": len(t.messages),
        "last_message": t.messages[-1].body[:140] if t.messages else None,
    }
    if with_messages:
        row["messages"] = [
            {"id": m.id, "author_kind": m.author_kind, "author_name": m.author_name,
             "body": m.body, "created_at": utc_iso(m.created_at)}
            for m in t.messages
        ]
    return row


def _own_ticket(db: Session, client: ClientAccount, ticket_id: int) -> ClientTicket:
    t = db.get(ClientTicket, ticket_id)
    if not t or t.client_id != client.id:
        raise HTTPException(404, "Not found")
    return t


def _least_loaded_manager(db: Session) -> Staff | None:
    """A new enquiry goes to whichever manager is carrying least — so nobody
    is buried and nobody is idle, and the enquiry is owned from second one."""
    managers = [
        s for s in db.query(Staff).filter(Staff.active.is_(True)).all()
        if normalise_role(s.role) == "Manager"
    ]
    if not managers:
        return db.query(Staff).filter(Staff.active.is_(True)).order_by(Staff.id).first()

    def load(m: Staff) -> int:
        weddings = db.query(Wedding).filter(
            Wedding.planner_id == m.id,
            Wedding.status.in_((WeddingStatus.PLANNING, WeddingStatus.EXECUTION)),
        ).count()
        leads = db.query(Lead).filter(
            Lead.owner_id == m.id, Lead.stage.notin_((LeadStage.WON, LeadStage.LOST))
        ).count()
        return weddings * 2 + leads

    return min(managers, key=lambda m: (load(m), m.id))


# --------------------------------------------------------------------------
# The online enquiry — public
# --------------------------------------------------------------------------
@enquiry_router.post("", status_code=201)
def enquire(payload: EnquiryIn, db: Session = Depends(get_db)):
    """The multi-step enquiry from the website.

    One submission does three things: the enquiry lands in the pipeline with
    an owner (so it cannot be forgotten — the brief's first scene), the
    couple gets their own login, and they are signed straight in to watch it
    move.
    """
    if db.query(ClientAccount).filter(ClientAccount.email == payload.email).first():
        raise HTTPException(409, "You already have an account with that email — sign in instead")

    owner = _least_loaded_manager(db)
    events = [e for e in payload.events if e][:10]
    services = [s for s in payload.services if s][:20]
    lead = Lead(
        partner_a=payload.partner_a.strip(),
        partner_b=payload.partner_b.strip(),
        phone=payload.phone.strip(),
        email=payload.email,
        rough_date=payload.rough_date,
        guest_count=payload.guest_count,
        theme=(payload.theme or "").strip() or None,
        max_budget=payload.max_budget,
        preferred_city=payload.preferred_city.strip(),
        package_interest=payload.package_interest,
        source=payload.source,
        stage=LeadStage.NEW,
        owner_id=owner.id if owner else None,
        events_wanted=", ".join(events) or None,
        services_wanted=", ".join(services) or None,
        notes=(payload.notes or "").strip() or "Enquiry made online by the couple.",
    )
    db.add(lead)
    db.flush()
    client = ClientAccount(
        lead_id=lead.id,
        name=payload.your_name.strip(),
        email=payload.email,
        phone=payload.phone.strip(),
        password_hash=hash_password(payload.password),
        last_login_at=datetime.utcnow(),
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return {
        "token": create_client_token(client),
        "user": client_payload(client),
        "planner": _planner_card(owner),
        "detail": (
            f"Thank you — {owner.name if owner else 'your planner'} will call you within a day."
        ),
    }


# --------------------------------------------------------------------------
# Account
# --------------------------------------------------------------------------
class ClientPasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.patch("/me")
def update_me(payload: ClientProfileIn, c: ClientAccount = Depends(current_client),
              db: Session = Depends(get_db)):
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(c, k, v.strip())
    db.commit()
    return {**client_payload(c), "detail": "Saved."}


@router.post("/change-password")
def change_password(payload: ClientPasswordIn, c: ClientAccount = Depends(current_client),
                    db: Session = Depends(get_db)):
    if not verify_password(payload.current_password, c.password_hash):
        raise HTTPException(401, "Your current password is not correct")
    c.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "detail": "Password changed."}


# --------------------------------------------------------------------------
# Overview
# --------------------------------------------------------------------------
@router.get("/overview")
def overview(c: ClientAccount = Depends(current_client), db: Session = Depends(get_db)):
    lead = c.lead
    w = _wedding(c)
    today = date.today()
    now = datetime.now()
    stage = _stage(lead, w)
    idx = [k for k, _ in JOURNEY].index(stage)
    ag = lead.agreement

    out: dict = {
        "me": client_payload(c),
        "couple_name": lead.couple_name,
        "stage": stage,
        "journey": [
            {"key": k, "label": label,
             "state": "done" if i < idx else "current" if i == idx else "upcoming"}
            for i, (k, label) in enumerate(JOURNEY)
        ],
        "planner": _planner_card(_planner(c)),
        "enquiry": {
            "rough_date": lead.rough_date.isoformat() if lead.rough_date else None,
            "guest_count": lead.guest_count,
            "city": lead.preferred_city,
            "theme": lead.theme,
            "events": lead.events_wanted,
            "services": lead.services_wanted,
            "package": lead.package_interest.value,
            "received_at": lead.created_at.isoformat(),
        },
        "agreement": None if not ag else {
            "signed": ag.is_signed,
            "sent_at": ag.sent_at.isoformat(),
            "signed_at": ag.signed_at.isoformat() if ag.signed_at else None,
        },
        "wedding": None,
        "actions": [],
    }

    actions = out["actions"]
    if ag and not ag.is_signed:
        actions.append({"kind": "sign", "title": "Sign your service agreement",
                        "detail": "Read it and sign on this screen — it takes two minutes.",
                        "to": "/agreement", "urgent": True})

    open_tickets = (
        db.query(ClientTicket)
        .filter(ClientTicket.client_id == c.id, ClientTicket.status != "Resolved")
        .all()
    )
    answered = [t for t in open_tickets if t.awaiting == "couple"]
    for t in answered[:2]:
        actions.append({"kind": "reply", "title": f"Your planner replied: {t.subject}",
                        "detail": t.messages[-1].body[:120] if t.messages else "",
                        "to": f"/help?ticket={t.id}", "urgent": False})

    if w:
        moments = _events(w)
        upcoming = [m for m in moments if datetime.fromisoformat(m["starts_at"]) > now]
        mine = [t for t in w.tasks if t.for_client and t.stage != TaskStage.DONE]
        due_soon = sorted((t for t in mine if t.due_date), key=lambda t: t.due_date)
        money = _money(w)
        next_payment = next(
            (m for m in sorted(w.milestones, key=lambda m: m.due_date)
             if m.status != MilestoneStatus.PAID), None,
        )
        live = w.day1_date <= today <= w.day3_date

        out["wedding"] = {
            "id": w.id,
            "code": w.code,
            "status": w.status.value,
            "venue": w.venue,
            "city": w.city,
            "theme": w.theme,
            "guest_count": w.guest_count,
            "day1_date": w.day1_date.isoformat(),
            "day3_date": w.day3_date.isoformat(),
            "days_to_go": (w.day1_date - today).days,
            "live": live,
            "active_day": next((d for d, dt in ((1, w.day1_date), (2, w.day2_date), (3, w.day3_date)) if dt == today), None),
            "events": moments,
            "next_moment": upcoming[0] if upcoming else None,
            "planning_pct": _progress(w),
            "your_tasks_open": len(mine),
            "your_tasks_overdue": sum(1 for t in mine if t.is_overdue),
            "vendors_confirmed": len(w.contracts),
            "money": money,
            "next_payment": None if not next_payment else {
                "id": next_payment.id,
                "kind": next_payment.kind.value,
                "amount": next_payment.amount,
                "due_date": next_payment.due_date.isoformat(),
                "overdue": next_payment.is_overdue,
                "reported": bool(next_payment.client_reference),
            },
        }

        for r in w.rfqs:
            if r.awaiting_couple:
                actions.insert(0, {
                    "kind": "choose", "title": f"Choose your {r.category.lower()}",
                    "detail": f"Your planner has shortlisted {len(r.shortlist_ids) or 'the best'} options for you.",
                    "to": f"/choose/{r.choice_token}", "external": True, "urgent": True,
                })
        for t in due_soon[:3]:
            actions.append({
                "kind": "task", "title": t.title,
                "detail": ("Overdue — " if t.is_overdue else "Due ") + t.due_date.strftime("%d %b"),
                "to": "/checklist", "urgent": t.is_overdue,
            })
        if next_payment and not next_payment.client_reference and (next_payment.due_date - today).days <= 21:
            actions.append({
                "kind": "pay", "title": f"{next_payment.kind.value} due {next_payment.due_date.strftime('%d %b')}",
                "detail": f"₹{next_payment.amount:,.0f}",
                "to": "/payments", "urgent": next_payment.is_overdue,
            })

    out["open_tickets"] = len(open_tickets)
    return out


# --------------------------------------------------------------------------
# Timeline
# --------------------------------------------------------------------------
@router.get("/timeline")
def timeline(c: ClientAccount = Depends(current_client)):
    """Everything that has happened and will happen, on one line: the
    enquiry, the agreement, payments, vendors confirmed, each planning phase,
    the couple's own to-dos and the three days."""
    lead = c.lead
    w = _wedding(c)
    today = date.today()
    items: list[dict] = []

    def add(when, title, kind, detail=None, done=None, icon="•"):
        d = when.date() if isinstance(when, datetime) else when
        if d is None:
            return
        items.append({
            "date": d.isoformat(),
            "title": title,
            "kind": kind,
            "detail": detail,
            "state": ("done" if (done if done is not None else d < today)
                      else "today" if d == today else "upcoming"),
            "icon": icon,
        })

    add(lead.created_at, "Enquiry received", "milestone",
        f"{lead.owner.name if lead.owner else 'The Royal Knot'} took it on", True, "✎")
    ag = lead.agreement
    if ag:
        add(ag.sent_at, "Service agreement sent", "milestone", None, True, "✉")
        if ag.signed_at:
            add(ag.signed_at, "You signed the agreement", "milestone",
                f"Signed by {ag.signer_name}", True, "✍")

    if w:
        for m in w.milestones:
            paid = m.status == MilestoneStatus.PAID
            add(m.paid_at or m.due_date,
                f"{m.kind.value} {'received' if paid else 'due'}", "payment",
                f"₹{m.amount:,.0f} · {m.percent:.0f}%", paid, "₹")

        by_day = defaultdict(list)
        for ct in w.contracts:
            by_day[ct.signed_on].append(ct.category)
        for d, cats in sorted(by_day.items()):
            add(d, f"{len(cats)} vendor{'s' if len(cats) > 1 else ''} confirmed", "vendor",
                ", ".join(sorted(cats)), d <= today, "◎")

        planner_tasks = [t for t in w.tasks if not t.for_client and t.due_date]
        labels = {
            TaskPhase.VENUE: "Venue locked in",
            TaskPhase.DESIGN: "Design finalised",
            TaskPhase.VENDORS: "Every vendor booked",
            TaskPhase.BIG_DAY: "Ready for the big days",
            TaskPhase.CLOSEOUT: "Wedding file closed",
        }
        for phase, label in labels.items():
            rows = [t for t in planner_tasks if t.phase == phase]
            if not rows:
                continue
            if phase == TaskPhase.BIG_DAY:
                rows = [t for t in rows if t.due_date < w.day1_date] or rows
            done = all(t.stage == TaskStage.DONE for t in rows)
            add(max(t.due_date for t in rows), label, "phase",
                f"{sum(1 for t in rows if t.stage == TaskStage.DONE)} of {len(rows)} steps done",
                done, "❖")

        for t in w.tasks:
            if t.for_client and t.due_date:
                add(t.due_date, t.title, "you",
                    "Done" if t.stage == TaskStage.DONE else "Your to-do",
                    t.stage == TaskStage.DONE, "☑")

        for day, dt in ((1, w.day1_date), (2, w.day2_date), (3, w.day3_date)):
            add(dt, f"Day {day} · {DAY_NAMES[day]}", "event", w.venue, None, "♥")

    items.sort(key=lambda i: (i["date"], {"milestone": 0, "payment": 1, "vendor": 2,
                                          "phase": 3, "you": 4, "event": 5}[i["kind"]]))
    return {
        "today": today.isoformat(),
        "items": items,
        "has_wedding": bool(w),
    }


# --------------------------------------------------------------------------
# Checklist
# --------------------------------------------------------------------------
def _ctask(t: Task) -> dict:
    today = date.today()
    return {
        "id": t.id,
        "title": t.title,
        "phase": t.phase.value,
        "stage": t.stage.value,
        "done": t.stage == TaskStage.DONE,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "days_left": (t.due_date - today).days if t.due_date else None,
        "overdue": t.is_overdue,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
    }


@router.get("/checklist")
@booked_only
def checklist(c: ClientAccount = Depends(current_client)):
    w = _need_wedding(c)
    yours = sorted((t for t in w.tasks if t.for_client), key=lambda t: (t.due_date or date.max))
    theirs = [t for t in w.tasks if not t.for_client]
    phases = []
    for p in TaskPhase:
        rows = sorted((t for t in theirs if t.phase == p), key=lambda t: (t.due_date or date.max))
        if not rows:
            continue
        done = sum(1 for t in rows if t.stage == TaskStage.DONE)
        phases.append({
            "phase": p.value,
            "done": done,
            "total": len(rows),
            "pct": round(100 * done / len(rows)),
            "tasks": [_ctask(t) for t in rows],
        })
    return {
        "booked": True,
        "yours": [_ctask(t) for t in yours],
        "yours_done": sum(1 for t in yours if t.stage == TaskStage.DONE),
        "planner_pct": _progress(w),
        "phases": phases,
        "planner": _planner_card(_planner(c)),
    }


class ToggleIn(BaseModel):
    done: bool


@router.patch("/tasks/{task_id}")
def toggle_task(task_id: int, payload: ToggleIn, c: ClientAccount = Depends(current_client),
                db: Session = Depends(get_db)):
    """The couple ticks off their own to-dos — only theirs."""
    w = _wedding(c)
    if not w:
        raise HTTPException(404, "Not found")
    t = db.get(Task, task_id)
    if not t or t.wedding_id != w.id or not t.for_client:
        raise HTTPException(404, "Not found")
    t.stage = TaskStage.DONE if payload.done else TaskStage.TO_PLAN
    t.completed_at = datetime.utcnow() if payload.done else None
    db.commit()
    return {**_ctask(t), "detail": f"{'Done' if payload.done else 'Reopened'}: {t.title}"}


# --------------------------------------------------------------------------
# Payments
# --------------------------------------------------------------------------
@router.get("/payments")
@booked_only
def payments(c: ClientAccount = Depends(current_client)):
    w = _need_wedding(c)
    today = date.today()
    return {
        "booked": True,
        "summary": _money(w),
        "milestones": [
            {
                "id": m.id,
                "kind": m.kind.value,
                "percent": m.percent,
                "amount": m.amount,
                "due_date": m.due_date.isoformat(),
                "days_left": (m.due_date - today).days,
                "status": m.status.value,
                "overdue": m.is_overdue,
                "paid_at": m.paid_at.isoformat() if m.paid_at else None,
                "reference": m.reference,
                "client_reference": m.client_reference,
                "client_reported_at": utc_iso(m.client_reported_at),
            }
            for m in sorted(w.milestones, key=lambda m: m.due_date)
        ],
        # extras the couple is billed for — never what the vendor charged the agency
        "extras": [
            {"id": co.id, "description": co.description, "quantity": co.quantity,
             "unit": co.unit.value, "unit_price": co.client_unit_price,
             "amount": co.client_amount, "raised_at": co.raised_at.isoformat()}
            for co in w.change_orders if co.billed_to_client
        ],
        "bank": {
            "name": "The Royal Knot Events Pvt Ltd",
            "note": "Pay by bank transfer and add the UTR here — your planner confirms it against the bank.",
        },
    }


@router.post("/payments/{milestone_id}/report")
def report_payment(milestone_id: int, payload: PaymentReportIn,
                   c: ClientAccount = Depends(current_client), db: Session = Depends(get_db)):
    """'We've paid — here is the reference.'  It does not mark the payment
    received; the manager confirms it against the bank first."""
    w = _wedding(c)
    if not w:
        raise HTTPException(404, "Not found")
    m = next((x for x in w.milestones if x.id == milestone_id), None)
    if not m:
        raise HTTPException(404, "Not found")
    if m.status == MilestoneStatus.PAID:
        raise HTTPException(409, "This one is already marked as received")
    m.client_reference = payload.reference.strip()
    m.client_reported_at = datetime.utcnow()
    db.commit()
    who = w.planner.name if w.planner else "your planner"
    return {"ok": True, "detail": f"Thank you — {who} will confirm it against the bank."}


# --------------------------------------------------------------------------
# Vendors
# --------------------------------------------------------------------------
@router.get("/vendors")
@booked_only
def vendors(c: ClientAccount = Depends(current_client)):
    """Who is doing what at their wedding.  Never the agreed price — under a
    full-service package the couple pays the agency, and the agency's cost is
    the agency's business."""
    w = _need_wedding(c)
    rows = []
    for ct in sorted(w.contracts, key=lambda x: x.category):
        v = ct.vendor
        status = ct.work_status or "Confirmed"
        rows.append({
            "category": ct.category,
            "name": v.name if v else "—",
            "city": v.city if v else None,
            "rating": v.quality_rating if v else None,
            "on_time_pct": v.on_time_pct if v else None,
            "contact_person": v.contact_person if v else None,
            "confirmed_on": ct.signed_on.isoformat() if ct.signed_on else None,
            "progress_pct": ct.progress_pct,
            # a delay is the planner's to fix — the couple hears it is in hand
            "status": ("In hand" if status in ("Delayed", "Blocked") else status),
        })
    decisions = []
    for r in w.rfqs:
        if r.awaiting_couple:
            state, to = "Your choice", f"/choose/{r.choice_token}"
        elif r.status == RFQStatus.AWARDED:
            winner = next((q for q in r.quotes if q.status == QuoteStatus.AWARDED), None)
            state, to = (f"Chose {winner.vendor.name}" if winner else "Decided"), (
                f"/choose/{r.choice_token}" if r.choice_token else None)
        else:
            state, to = "Collecting quotes", None
        decisions.append({
            "id": r.id,
            "category": r.category,
            "title": r.title,
            "state": state,
            "to": to,
            "invited": len(r.quotes),
            "chosen_by_you": r.chosen_by_name,
        })
    return {"booked": True, "vendors": rows, "decisions": decisions}


# --------------------------------------------------------------------------
# The three days
# --------------------------------------------------------------------------
@router.get("/schedule")
@booked_only
def schedule(c: ClientAccount = Depends(current_client)):
    """The run sheet as the couple should see it: what happens, when and
    where — done, happening now or coming up by the clock.  Not which vendor
    is late; the planner is already on that."""
    w = _need_wedding(c)
    now = datetime.now()
    dates = {1: w.day1_date, 2: w.day2_date, 3: w.day3_date}
    days = {}
    for day in (1, 2, 3):
        slots = sorted((i for i in w.runsheet if i.day_number == day), key=lambda i: i.start_time)
        rows = []
        for idx, i in enumerate(slots):
            start = datetime.combine(dates[day], i.start_time)
            nxt = slots[idx + 1].start_time if idx + 1 < len(slots) else None
            end = datetime.combine(dates[day], i.end_time or nxt or time(23, 59))
            state = "done" if now >= end else "now" if start <= now < end else "upcoming"
            rows.append({
                "id": i.id,
                "start_time": i.start_time.strftime("%H:%M"),
                "end_time": i.end_time.strftime("%H:%M") if i.end_time else None,
                "title": i.title,
                "location": i.location,
                "state": state,
            })
        days[str(day)] = {"name": DAY_NAMES[day], "date": dates[day].isoformat(), "slots": rows}
    today = date.today()
    return {
        "booked": True,
        "published": bool(w.runsheet),
        "publish_by": (w.day1_date - timedelta(days=21)).isoformat(),
        "venue": w.venue,
        "active_day": next((d for d, dt in dates.items() if dt == today), None),
        "server_time": now.strftime("%H:%M"),
        "days": days,
        "planner": _planner_card(_planner(c)),
    }


# --------------------------------------------------------------------------
# Service agreement
# --------------------------------------------------------------------------
@router.get("/agreement")
def agreement(c: ClientAccount = Depends(current_client)):
    lead = c.lead
    ag = lead.agreement
    if not ag:
        return {"sent": False, "planner": _planner_card(_planner(c))}
    return {
        "sent": True,
        "couple_name": lead.couple_name,
        "body": ag.body,
        "package_type": ag.package_type.value,
        "quoted_fee": ag.quoted_fee,
        "sent_at": ag.sent_at.isoformat(),
        "signed": ag.is_signed,
        "signed_at": utc_iso(ag.signed_at),
        "signer_name": ag.signer_name,
        "signature_png": ag.signature_png,
        "signer_ip": ag.signer_ip,
    }


@router.post("/agreement/sign")
def sign(payload: AgreementSign, request: Request,
         c: ClientAccount = Depends(current_client), db: Session = Depends(get_db)):
    """Sign inside the portal — the same audit trail as the phone link."""
    ag = c.lead.agreement
    if not ag:
        raise HTTPException(404, "Your planner has not sent the agreement yet")
    return record_signature(db, ag, payload, request)


# --------------------------------------------------------------------------
# Queries and complaints
# --------------------------------------------------------------------------
@router.get("/tickets")
def my_tickets(c: ClientAccount = Depends(current_client), db: Session = Depends(get_db)):
    rows = (
        db.query(ClientTicket)
        .filter(ClientTicket.client_id == c.id)
        .order_by(ClientTicket.updated_at.desc())
        .all()
    )
    return {
        "tickets": [_ticket_row(t) for t in rows],
        "planner": _planner_card(_planner(c)),
    }


@router.post("/tickets", status_code=201)
def raise_ticket(payload: TicketIn, c: ClientAccount = Depends(current_client),
                 db: Session = Depends(get_db)):
    w = _wedding(c)
    planner = _planner(c)
    urgent = payload.urgent or payload.kind == "Complaint"
    t = ClientTicket(
        client_id=c.id,
        lead_id=c.lead_id,
        wedding_id=w.id if w else None,
        kind=payload.kind,
        topic=payload.topic,
        subject=payload.subject.strip(),
        priority="Urgent" if urgent else "Normal",
        assigned_to_id=planner.id if planner else None,
    )
    db.add(t)
    db.flush()
    db.add(TicketMessage(ticket_id=t.id, author_kind="client", author_name=c.name,
                         body=payload.message.strip()))
    db.commit()
    db.refresh(t)
    who = planner.name if planner else "your planner"
    return {
        **_ticket_row(t, True),
        "detail": (f"Complaint logged — {who} and the founder have both been told."
                   if payload.kind == "Complaint" else f"Sent to {who}."),
    }


@router.get("/tickets/{ticket_id}")
def ticket(ticket_id: int, c: ClientAccount = Depends(current_client),
           db: Session = Depends(get_db)):
    return _ticket_row(_own_ticket(db, c, ticket_id), True)


@router.post("/tickets/{ticket_id}/messages", status_code=201)
def reply(ticket_id: int, payload: TicketReplyIn, c: ClientAccount = Depends(current_client),
          db: Session = Depends(get_db)):
    t = _own_ticket(db, c, ticket_id)
    db.add(TicketMessage(ticket_id=t.id, author_kind="client", author_name=c.name,
                         body=payload.message.strip()))
    # replying to a resolved ticket reopens it — the couple is not happy yet
    if t.status == "Resolved":
        t.status, t.resolved_at, t.rating, t.rating_note = "Open", None, None, None
    t.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(t)
    return _ticket_row(t, True)


@router.post("/tickets/{ticket_id}/rate")
def rate(ticket_id: int, payload: TicketRateIn, c: ClientAccount = Depends(current_client),
         db: Session = Depends(get_db)):
    t = _own_ticket(db, c, ticket_id)
    if t.status != "Resolved":
        raise HTTPException(400, "You can rate it once your planner has resolved it")
    t.rating = payload.rating
    t.rating_note = (payload.note or "").strip() or None
    db.commit()
    return {**_ticket_row(t, True), "detail": "Thank you for telling us."}
