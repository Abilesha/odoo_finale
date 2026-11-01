"""Scene 3 — the instant wedding plan.

When a deposit lands, a complete plan must exist in seconds: 25+ tasks with an
owner and a stage, plus the three staged payments.  Nobody copies a checklist
from the last wedding.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy.orm import Session

from ..models import (
    MilestoneKind,
    MilestoneStatus,
    PackageType,
    PaymentMilestone,
    Staff,
    Task,
    TaskPhase,
    TaskStage,
    TaskTemplateItem,
    Wedding,
)

# --------------------------------------------------------------------------
# The master checklist.  (phase, title, offset_days, role)
# offset_days is relative to day 1 of the wedding (the Mehendi).
# --------------------------------------------------------------------------
FULL_SERVICE_TEMPLATE: list[tuple[TaskPhase, str, int, str]] = [
    # --- Venue -----------------------------------------------------------
    (TaskPhase.VENUE, "Shortlist 3 palace/resort venues matching theme", -150, "Planner"),
    (TaskPhase.VENUE, "Site visit and capacity check for 400+ guests", -140, "Planner"),
    (TaskPhase.VENUE, "Negotiate venue rate card and blackout dates", -135, "Lead Planner"),
    (TaskPhase.VENUE, "Block venue and pay venue retainer", -130, "Lead Planner"),
    (TaskPhase.VENUE, "Confirm guest-room inventory for outstation guests", -120, "Coordinator"),
    (TaskPhase.VENUE, "Obtain venue NOC, sound licence and permits", -45, "Coordinator"),
    # --- Design ----------------------------------------------------------
    (TaskPhase.DESIGN, "Lock theme mood board with couple", -120, "Designer"),
    (TaskPhase.DESIGN, "Approve colour palette and floral direction", -110, "Designer"),
    (TaskPhase.DESIGN, "Produce 3D floor plan for Mehendi, Sangeet, Reception", -95, "Designer"),
    (TaskPhase.DESIGN, "Design invitation suite and signage", -90, "Designer"),
    (TaskPhase.DESIGN, "Approve stage, mandap and entrance renders", -70, "Designer"),
    (TaskPhase.DESIGN, "Finalise lighting and sound plot", -40, "Designer"),
    # --- Vendors ---------------------------------------------------------
    (TaskPhase.VENDORS, "Float RFQ to 3 caterers with per-plate scope", -100, "Planner"),
    (TaskPhase.VENDORS, "Compare caterer quotes and award", -90, "Lead Planner"),
    (TaskPhase.VENDORS, "Float RFQ to decorators and award", -85, "Planner"),
    (TaskPhase.VENDORS, "Book photography and cinematography team", -80, "Planner"),
    (TaskPhase.VENDORS, "Book makeup artists for both families", -75, "Coordinator"),
    (TaskPhase.VENDORS, "Book DJ, live band and dhol/drummers", -70, "Coordinator"),
    (TaskPhase.VENDORS, "Book mehendi artists and tent/furniture rental", -60, "Coordinator"),
    (TaskPhase.VENDORS, "Arrange guest transport and valet", -50, "Coordinator"),
    (TaskPhase.VENDORS, "Release vendor advances and record in system", -40, "Lead Planner"),
    (TaskPhase.VENDORS, "Collect vendor insurance and ID documents", -30, "Coordinator"),
    # --- Big day ---------------------------------------------------------
    (TaskPhase.BIG_DAY, "Publish minute-by-minute run sheet for all 3 days", -21, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Confirm final guest headcount with both families", -14, "Coordinator"),
    (TaskPhase.BIG_DAY, "Share run sheet and call-sheet with every vendor", -10, "Coordinator"),
    (TaskPhase.BIG_DAY, "Full rehearsal / practice run at venue", -2, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Vendor load-in and venue handover check", -1, "Coordinator"),
    (TaskPhase.BIG_DAY, "Day 1 Mehendi — execute run sheet", 0, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Day 2 Sangeet — execute run sheet", 1, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Day 3 Wedding and Reception — execute run sheet", 2, "Lead Planner"),
    # --- Close-out -------------------------------------------------------
    (TaskPhase.CLOSEOUT, "Venue de-rig, strike and damage inspection", 3, "Coordinator"),
    (TaskPhase.CLOSEOUT, "Reconcile actual headcount and raise change orders", 4, "Lead Planner"),
    (TaskPhase.CLOSEOUT, "Match vendor bills against contracts and settle", 10, "Lead Planner"),
    (TaskPhase.CLOSEOUT, "Raise final client invoice including additions", 7, "Lead Planner"),
    (TaskPhase.CLOSEOUT, "Collect couple feedback and vendor ratings", 14, "Planner"),
]

DAY_OF_TEMPLATE: list[tuple[TaskPhase, str, int, str]] = [
    (TaskPhase.VENDORS, "Collect vendor list and contracts from couple", -30, "Coordinator"),
    (TaskPhase.VENDORS, "Verify every vendor booking and arrival window", -21, "Coordinator"),
    (TaskPhase.VENDORS, "Collect vendor contact sheet and emergency numbers", -18, "Coordinator"),
    (TaskPhase.BIG_DAY, "Build minute-by-minute run sheet for all 3 days", -14, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Walk the venue and mark load-in points", -10, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Brief both families on movement cues", -7, "Planner"),
    (TaskPhase.BIG_DAY, "Confirm final headcount for seating", -5, "Coordinator"),
    (TaskPhase.BIG_DAY, "Share call sheet with every vendor", -3, "Coordinator"),
    (TaskPhase.BIG_DAY, "Rehearsal walkthrough with couple", -1, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Day 1 Mehendi — vendor check-in and cue calls", 0, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Day 2 Sangeet — vendor check-in and cue calls", 1, "Lead Planner"),
    (TaskPhase.BIG_DAY, "Day 3 Wedding — vendor check-in and cue calls", 2, "Lead Planner"),
    (TaskPhase.CLOSEOUT, "Post-event clear-up and handover of gifts", 3, "Coordinator"),
    (TaskPhase.CLOSEOUT, "Reconcile extras and raise final invoice", 6, "Lead Planner"),
    (TaskPhase.CLOSEOUT, "Collect feedback and close the file", 10, "Planner"),
]

#: What only the couple can do.  They tick these off in their own portal;
#: the manager owns making sure it happens.  (phase, title, offset_days)
COUPLE_TASKS: list[tuple[TaskPhase, str, int]] = [
    (TaskPhase.DESIGN, "Share your mood board and colour palette", -150),
    (TaskPhase.VENDORS, "Send the first draft of your guest list", -120),
    (TaskPhase.VENDORS, "Attend the menu tasting", -80),
    (TaskPhase.DESIGN, "Approve the décor sketches", -60),
    (TaskPhase.BIG_DAY, "Finish outfit and jewellery trials", -45),
    (TaskPhase.BIG_DAY, "Share the Sangeet song list and performers", -30),
    # the one that becomes "60 unexpected guests" when it is skipped
    (TaskPhase.BIG_DAY, "Confirm the final guest count", -14),
    (TaskPhase.BIG_DAY, "Name the family members for each ritual", -10),
]

#: Staged payment plan from the brief: booking, advance ~1 month before, final after.
MILESTONE_PLAN: list[tuple[MilestoneKind, float, int]] = [
    (MilestoneKind.BOOKING, 25.0, -120),
    (MilestoneKind.ADVANCE, 50.0, -30),
    (MilestoneKind.FINAL, 25.0, 7),
]


def ensure_templates(db: Session) -> None:
    """Load the master checklists into the DB once, so an agency admin can
    edit them later without touching code."""
    if db.query(TaskTemplateItem).count():
        return

    for pkg, rows in (
        (PackageType.FULL_SERVICE, FULL_SERVICE_TEMPLATE),
        (PackageType.DAY_OF, DAY_OF_TEMPLATE),
    ):
        for seq, (phase, title, offset, role) in enumerate(rows):
            db.add(
                TaskTemplateItem(
                    package_type=pkg,
                    phase=phase,
                    title=title,
                    offset_days=offset,
                    default_role=role,
                    sequence=seq,
                )
            )
    db.commit()


def _pick_owner(db: Session, job_title: str, wedding: Wedding | None = None) -> Staff | None:
    """Give the task to whoever is answerable for it.

    The wedding's manager first: the founder assigned them this wedding, so
    every task on it is theirs until they hand one on.  A wedding nobody has
    been given yet falls back to whoever does that job (matched on `title`,
    never on the access level), then to any manager — because every task must
    have an owner, and an unowned task is exactly how things get forgotten.
    """
    if wedding is not None and wedding.planner_id:
        manager = db.get(Staff, wedding.planner_id)
        if manager and manager.active:
            return manager
    owner = (
        db.query(Staff)
        .filter(Staff.title == job_title, Staff.active.is_(True))
        .first()
    )
    if owner:
        return owner
    return (
        db.query(Staff)
        .filter(Staff.role.in_(("Manager", "Planner")), Staff.active.is_(True))
        .order_by(Staff.id)
        .first()
    )


def generate_plan(db: Session, wedding: Wedding) -> dict:
    """Materialise the full plan for one wedding.  Idempotent: calling it
    twice does not duplicate tasks."""
    ensure_templates(db)

    if wedding.tasks:
        return {
            "created_tasks": 0,
            "created_milestones": 0,
            "detail": "Plan already exists for this wedding.",
        }

    items = (
        db.query(TaskTemplateItem)
        .filter(TaskTemplateItem.package_type == wedding.package_type)
        .order_by(TaskTemplateItem.sequence)
        .all()
    )

    anchor: date = wedding.day1_date
    created_tasks = 0
    for item in items:
        db.add(
            Task(
                wedding_id=wedding.id,
                title=item.title,
                phase=item.phase,
                stage=TaskStage.TO_PLAN,
                owner_id=(o.id if (o := _pick_owner(db, item.default_role, wedding)) else None),
                due_date=anchor + timedelta(days=item.offset_days),
                sequence=item.sequence,
            )
        )
        created_tasks += 1

    manager = _pick_owner(db, "Lead Planner", wedding)
    for i, (phase, title, offset) in enumerate(COUPLE_TASKS):
        db.add(
            Task(
                wedding_id=wedding.id,
                title=title,
                phase=phase,
                stage=TaskStage.TO_PLAN,
                owner_id=manager.id if manager else None,
                due_date=anchor + timedelta(days=offset),
                sequence=900 + i,
                for_client=True,
            )
        )
        created_tasks += 1

    created_milestones = 0
    if not wedding.milestones:
        for kind, pct, offset in MILESTONE_PLAN:
            db.add(
                PaymentMilestone(
                    wedding_id=wedding.id,
                    kind=kind,
                    percent=pct,
                    amount=round(wedding.package_value * pct / 100.0, 2),
                    due_date=anchor + timedelta(days=offset),
                    status=MilestoneStatus.DUE,
                )
            )
            created_milestones += 1

    db.commit()
    return {
        "created_tasks": created_tasks,
        "created_milestones": created_milestones,
        "detail": f"Generated {created_tasks} tasks and {created_milestones} payment milestones.",
    }
