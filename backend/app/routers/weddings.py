"""The spine: weddings, their generated task plan and staged payments."""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..timeutil import utc_iso
from ..models import (
    MilestoneStatus,
    PaymentMilestone,
    Staff,
    Task,
    TaskPhase,
    TaskStage,
    VendorUpdate,
    Wedding,
    WeddingStatus,
)
from ..schemas import (
    AssignIn,
    MilestoneUpdate,
    TaskCreate,
    TaskUpdate,
    WeddingCreate,
    WeddingUpdate,
)
from ..services.auth import (
    CAP_SEASON,
    CAP_TEAM,
    caps_for,
    check_wedding,
    current_user,
    normalise_role,
    scope_weddings,
)
from ..services.finance import wedding_pnl
from ..services.planning import generate_plan

router = APIRouter(prefix="/api/weddings", tags=["3 · Weddings & Plan"])


def _summary(w: Wedding) -> dict:
    done = sum(1 for t in w.tasks if t.stage == TaskStage.DONE)
    overdue = sum(1 for t in w.tasks if t.is_overdue)
    return {
        "id": w.id,
        "code": w.code,
        "couple_name": w.couple_name,
        "package_type": w.package_type.value,
        "status": w.status.value,
        "city": w.city,
        "venue": w.venue,
        "theme": w.theme,
        "day1_date": w.day1_date.isoformat(),
        "day2_date": w.day2_date.isoformat(),
        "day3_date": w.day3_date.isoformat(),
        "guest_count": w.guest_count,
        "actual_guest_count": w.actual_guest_count,
        "package_value": w.package_value,
        "budget_cap": w.budget_cap,
        "planner": w.planner.name if w.planner else None,
        "planner_id": w.planner_id,
        "manager": w.planner.name if w.planner else None,
        "manager_id": w.planner_id,
        "assigned_at": w.assigned_at.isoformat() if w.assigned_at else None,
        "assignment_note": w.assignment_note,
        "task_total": len(w.tasks),
        "task_done": done,
        "task_overdue": overdue,
        "progress_pct": round(100.0 * done / len(w.tasks), 1) if w.tasks else 0.0,
        "contract_count": len(w.contracts),
        "days_to_go": (w.day1_date - datetime.now().date()).days,
    }


@router.get("")
def list_weddings(
    manager_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Every wedding for the founder; only their own for a manager."""
    q = scope_weddings(db.query(Wedding), user)
    if manager_id:
        q = q.filter(Wedding.planner_id == manager_id)
    rows = [_summary(w) for w in q.order_by(Wedding.day1_date).all()]
    return {"count": len(rows), "weddings": rows}


@router.post("", status_code=201)
def create_wedding(
    payload: WeddingCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    data = payload.model_dump()
    # A manager who opens a wedding runs it; only the founder hands one to
    # somebody else.
    if CAP_TEAM not in caps_for(user.role):
        data["planner_id"] = user.id
    day1 = data.pop("day1_date")
    seq = db.query(Wedding).count() + 1
    wedding = Wedding(
        code=f"RK-{day1.year}-{seq:03d}",
        day1_date=day1,
        day2_date=day1 + timedelta(days=1),
        day3_date=day1 + timedelta(days=2),
        **data,
    )
    if wedding.planner_id:
        wedding.assigned_at = datetime.utcnow()
    db.add(wedding)
    db.commit()
    db.refresh(wedding)
    generate_plan(db, wedding)
    return _summary(wedding)


@router.get("/{wedding_id}")
def get_wedding(
    wedding_id: int,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    w = check_wedding(user, db.get(Wedding, wedding_id))

    # A manager settles vendor bills but has no business seeing what the
    # agency earns on the wedding, so the figures are left out of the
    # response entirely rather than merely hidden by the browser.
    may_see_money = CAP_SEASON in caps_for(user.role)

    return {
        **_summary(w),
        "pnl": wedding_pnl(db, w) if may_see_money else None,
        "milestones": [_milestone(m) for m in sorted(w.milestones, key=lambda m: m.due_date)],
        "contracts": [
            {
                "id": c.id,
                "vendor": c.vendor.name if c.vendor else None,
                "vendor_id": c.vendor_id,
                "category": c.category,
                "agreed_amount": c.agreed_amount,
                "advance_paid": c.advance_paid,
                "bill_count": len(c.bills),
                "settled": any(b.paid_at for b in c.bills),
                "progress_pct": c.progress_pct,
                "work_status": c.work_status,
                "latest_update": _update(c.updates[0]) if c.updates else None,
            }
            for c in w.contracts
        ],
    }


#: Fields only the founder may change — who runs the wedding and what the
#: client is paying.  A manager edits everything about running it.
FOUNDER_FIELDS = {"planner_id", "package_value", "budget_cap", "couple_name"}


@router.patch("/{wedding_id}")
def update_wedding(
    wedding_id: int,
    payload: WeddingUpdate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Edit the wedding file.  Moving day one moves all three days."""
    w = check_wedding(user, db.get(Wedding, wedding_id))
    data = payload.model_dump(exclude_unset=True)

    locked = FOUNDER_FIELDS & data.keys()
    if locked and CAP_TEAM not in caps_for(user.role):
        raise HTTPException(
            403, f"Only the founder can change {', '.join(sorted(locked))}."
        )

    if "planner_id" in data:
        _assign(db, w, data.pop("planner_id"), None)

    if "day1_date" in data:
        day1 = data.pop("day1_date")
        w.day1_date = day1
        w.day2_date = day1 + timedelta(days=1)
        w.day3_date = day1 + timedelta(days=2)

    for key, value in data.items():
        setattr(w, key, value)
    db.commit()
    db.refresh(w)
    return {**_summary(w), "detail": f"{w.couple_name} updated."}


def _assign(db: Session, w: Wedding, manager_id: int | None, note: str | None) -> None:
    previous = w.planner_id
    if manager_id is not None:
        manager = db.get(Staff, manager_id)
        if not manager or not manager.active:
            raise HTTPException(404, "No such manager")
    w.planner_id = manager_id
    w.assigned_at = datetime.utcnow() if manager_id else None
    w.assignment_note = (note or "").strip() or None
    # The open work moves with the wedding — otherwise the old manager keeps
    # getting reminded about a wedding they no longer run.
    if previous != manager_id:
        for t in w.tasks:
            if t.stage != TaskStage.DONE and t.owner_id in (previous, None):
                t.owner_id = manager_id
        # and so does the big day: the slots the old manager was answerable for
        for slot in w.runsheet:
            if previous is not None and slot.owner_id == previous:
                slot.owner_id = manager_id


@router.post("/{wedding_id}/assign")
def assign_manager(
    wedding_id: int,
    payload: AssignIn,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """The founder hands a wedding to a manager."""
    if CAP_TEAM not in caps_for(user.role):
        raise HTTPException(403, "Only the founder assigns weddings")
    w = db.get(Wedding, wedding_id)
    if not w:
        raise HTTPException(404, "Wedding not found")
    _assign(db, w, payload.manager_id, payload.note)
    db.commit()
    db.refresh(w)
    who = w.planner.name if w.planner else "nobody"
    moved = sum(1 for t in w.tasks if t.stage != TaskStage.DONE and t.owner_id == w.planner_id)
    return {
        **_summary(w),
        "detail": f"{w.couple_name} is now run by {who}. "
                  f"{moved} open task(s) moved with it.",
    }


@router.post("/{wedding_id}/generate-plan")
def regenerate_plan(
    wedding_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    w = check_wedding(user, db.get(Wedding, wedding_id))
    return generate_plan(db, w)


@router.patch("/{wedding_id}/status")
def set_status(
    wedding_id: int,
    status: WeddingStatus,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    w = check_wedding(user, db.get(Wedding, wedding_id))
    w.status = status
    db.commit()
    return _summary(w)


# ---- Vendor progress -----------------------------------------------------
def _update(u: VendorUpdate) -> dict:
    return {
        "id": u.id,
        "contract_id": u.contract_id,
        "vendor_id": u.vendor_id,
        "vendor": u.vendor.name if u.vendor else None,
        "category": u.contract.category if u.contract else None,
        "wedding_id": u.wedding_id,
        "wedding_code": u.wedding.code if u.wedding else None,
        "couple_name": u.wedding.couple_name if u.wedding else None,
        "status": u.status,
        "progress_pct": u.progress_pct,
        "message": u.message,
        "expected_by": u.expected_by.isoformat() if u.expected_by else None,
        "created_at": utc_iso(u.created_at),
        "acknowledged_at": utc_iso(u.acknowledged_at),
    }


@router.get("/{wedding_id}/vendor-updates")
def vendor_updates(
    wedding_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    w = check_wedding(user, db.get(Wedding, wedding_id))
    rows = (
        db.query(VendorUpdate)
        .filter(VendorUpdate.wedding_id == w.id)
        .order_by(VendorUpdate.created_at.desc())
        .all()
    )
    return [_update(u) for u in rows]


# ---- Tasks ----------------------------------------------------------------
def _task(t: Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "phase": t.phase.value,
        "stage": t.stage.value,
        "owner": t.owner.name if t.owner else None,
        "owner_id": t.owner_id,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "overdue": t.is_overdue,
        "notes": t.notes,
        "sequence": t.sequence,
        "wedding_id": t.wedding_id,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "for_client": bool(t.for_client),
    }


@router.get("/{wedding_id}/tasks")
def list_tasks(
    wedding_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    """The board, grouped into the four stages To Plan → Done."""
    w = check_wedding(user, db.get(Wedding, wedding_id))

    rows = [_task(t) for t in sorted(w.tasks, key=lambda t: (t.sequence, t.id))]
    by_stage = {s.value: [r for r in rows if r["stage"] == s.value] for s in TaskStage}
    by_phase = {p.value: [r for r in rows if r["phase"] == p.value] for p in TaskPhase}
    return {
        "wedding_id": wedding_id,
        "wedding_code": w.code,
        "total": len(rows),
        "done": len(by_stage[TaskStage.DONE.value]),
        "overdue": sum(1 for r in rows if r["overdue"]),
        "tasks": rows,
        "by_stage": by_stage,
        "by_phase": by_phase,
    }


@router.post("/{wedding_id}/tasks", status_code=201)
def add_task(
    wedding_id: int,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Add something to the checklist that the template did not think of."""
    w = check_wedding(user, db.get(Wedding, wedding_id))
    last = max((t.sequence for t in w.tasks), default=0)
    task = Task(
        wedding_id=w.id,
        title=payload.title.strip(),
        phase=payload.phase,
        stage=TaskStage.TO_PLAN,
        owner_id=payload.owner_id or w.planner_id or user.id,
        due_date=payload.due_date,
        notes=payload.notes,
        sequence=last + 1,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _task(task)


task_router = APIRouter(prefix="/api/tasks", tags=["3 · Weddings & Plan"])


@task_router.delete("/{task_id}")
def delete_task(
    task_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    check_wedding(user, task.wedding)
    db.delete(task)
    db.commit()
    return {"ok": True, "detail": "Removed from the checklist."}


@task_router.patch("/{task_id}")
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    check_wedding(user, task.wedding)
    data = payload.model_dump(exclude_unset=True)
    if data.get("stage") == TaskStage.DONE:
        task.completed_at = datetime.utcnow()
    elif "stage" in data:
        task.completed_at = None
    for key, value in data.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return _task(task)


# ---- Milestones -----------------------------------------------------------
def _milestone(m: PaymentMilestone) -> dict:
    return {
        "id": m.id,
        "wedding_id": m.wedding_id,
        "kind": m.kind.value,
        "percent": m.percent,
        "amount": m.amount,
        "due_date": m.due_date.isoformat(),
        "status": m.status.value,
        "overdue": m.is_overdue,
        "paid_at": m.paid_at.isoformat() if m.paid_at else None,
        "reference": m.reference,
        "client_reference": m.client_reference,
    }


milestone_router = APIRouter(prefix="/api/milestones", tags=["3 · Weddings & Plan"])


@milestone_router.patch("/{milestone_id}")
def update_milestone(
    milestone_id: int,
    payload: MilestoneUpdate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    m = db.get(PaymentMilestone, milestone_id)
    if not m:
        raise HTTPException(404, "Milestone not found")
    check_wedding(user, m.wedding)
    data = payload.model_dump(exclude_unset=True)
    if data.get("status") == MilestoneStatus.PAID and m.paid_at is None:
        m.paid_at = datetime.utcnow()
        # the couple's own UTR, once confirmed, is the receipt reference
        m.reference = data.get("reference") or m.client_reference or f"RCPT-{m.id:05d}"
    for key, value in data.items():
        setattr(m, key, value)
    db.commit()
    db.refresh(m)
    return _milestone(m)


# ---- Staff ----------------------------------------------------------------
staff_router = APIRouter(prefix="/api/staff", tags=["Reference"])


@staff_router.get("")
def list_staff(include_inactive: bool = False, db: Session = Depends(get_db)):
    """The team.  Feeds every owner picker, and the founder's account screen."""
    q = db.query(Staff)
    if not include_inactive:
        q = q.filter(Staff.active.is_(True))
    return [
        {
            "id": s.id,
            "name": s.name,
            "role": normalise_role(s.role),
            "title": s.title,
            "email": s.email,
            "phone": s.phone,
            "city": s.city,
            "joined_on": s.joined_on.isoformat() if s.joined_on else None,
            "hourly_cost": s.hourly_cost,
            "active": s.active,
        }
        for s in q.order_by(Staff.active.desc(), Staff.name).all()
    ]
