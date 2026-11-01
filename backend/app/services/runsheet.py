"""Scene 4 — the big day schedule.

A live run sheet.  The one thing it must do that a paper diary cannot: spot
someone running late *before* the guests notice, not afterwards.

Lateness is derived, never typed.  A slot is late when the clock has passed
its start time plus a grace window and the responsible vendor has not checked
in.  That means the board goes red on its own while the planner is busy.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from ..models import RunSheetItem, RunSheetStatus, Wedding

# A default three-day run sheet.  Times are the real cue points of a North
# Indian wedding, which is what makes the demo land with judges.
DEFAULT_RUNSHEET: list[tuple[int, str, str, str, str, str]] = [
    # (day, start, end, title, location, vendor_category)
    (1, "08:00", "10:00", "Mehendi lawn setup and floral install", "Garden Lawn", "Decorator"),
    (1, "10:00", "11:00", "Mehendi artists arrive and set up stations", "Garden Lawn", "Mehendi Artist"),
    (1, "11:00", "11:30", "Bride's entry for Mehendi", "Garden Lawn", "Photographer"),
    (1, "11:30", "16:00", "Mehendi ceremony and lunch service", "Garden Lawn", "Caterer"),
    (1, "16:00", "17:00", "Dhol and folk performance", "Garden Lawn", "Drummers"),
    (1, "17:00", "18:30", "Clear-up and reset for Sangeet", "Garden Lawn", "Decorator"),
    (2, "09:00", "13:00", "Sangeet stage, truss and lighting rig", "Durbar Hall", "Decorator"),
    (2, "13:00", "15:00", "Sound check and DJ console setup", "Durbar Hall", "DJ"),
    (2, "15:00", "17:00", "Family rehearsal for performances", "Durbar Hall", "Choreographer"),
    (2, "18:00", "19:00", "Guest arrival and welcome drinks", "Durbar Hall", "Caterer"),
    (2, "19:00", "20:30", "Sangeet performances", "Durbar Hall", "DJ"),
    (2, "20:30", "23:30", "Dinner service and open floor", "Durbar Hall", "Caterer"),
    (3, "06:00", "08:00", "Mandap install and floral dressing", "Palace Courtyard", "Decorator"),
    (3, "07:00", "09:30", "Bridal hair and makeup", "Bridal Suite", "Makeup Artist"),
    (3, "09:30", "10:00", "Groom's baraat assembly", "Palace Gate", "Drummers"),
    (3, "10:00", "10:30", "Baraat procession and groom's arrival", "Palace Gate", "Drummers"),
    (3, "10:30", "11:00", "Milni and garland exchange (Jaimala)", "Palace Courtyard", "Photographer"),
    (3, "11:00", "12:30", "Wedding vows and pheras", "Palace Courtyard", "Pandit"),
    (3, "12:30", "14:00", "Lunch service for 400 guests", "Palace Courtyard", "Caterer"),
    (3, "18:00", "19:00", "Reception stage reset and lighting", "Grand Ballroom", "Decorator"),
    (3, "19:00", "20:00", "Couple's reception entry", "Grand Ballroom", "DJ"),
    (3, "20:00", "23:00", "Reception dinner and dancing", "Grand Ballroom", "Caterer"),
    (3, "23:00", "23:59", "Gift handover and guest send-off", "Grand Ballroom", "Coordinator"),
]


def generate_runsheet(db: Session, wedding: Wedding) -> int:
    """Build the default three-day run sheet, wiring each slot to whichever
    vendor the agency actually awarded for that category."""
    if wedding.runsheet:
        return 0

    contracts_by_category = {c.category: c.vendor_id for c in wedding.contracts}

    created = 0
    for seq, (day, start, end, title, location, category) in enumerate(DEFAULT_RUNSHEET):
        db.add(
            RunSheetItem(
                wedding_id=wedding.id,
                day_number=day,
                start_time=time.fromisoformat(start),
                end_time=time.fromisoformat(end),
                title=title,
                location=location,
                vendor_id=contracts_by_category.get(category),
                owner_id=wedding.planner_id,
                status=RunSheetStatus.PENDING,
                sequence=seq,
            )
        )
        created += 1

    db.commit()
    return created


def _slot_datetime(wedding: Wedding, item: RunSheetItem) -> datetime:
    day_map = {1: wedding.day1_date, 2: wedding.day2_date, 3: wedding.day3_date}
    slot_date: date = day_map.get(item.day_number, wedding.day3_date)
    return datetime.combine(slot_date, item.start_time)


def effective_status(wedding: Wedding, item: RunSheetItem, now: datetime) -> RunSheetStatus:
    """What this slot's status *is* at `now`, derived rather than stored.

    Computing it instead of storing it means the board can be rendered at any
    point in time — including a simulated one during a demo — without the
    act of looking at it changing the data.
    """
    if item.status in (RunSheetStatus.DONE, RunSheetStatus.ARRIVED):
        return item.status
    if item.checked_in_at is not None:
        return RunSheetStatus.ARRIVED

    starts_at = _slot_datetime(wedding, item)
    deadline = starts_at + timedelta(minutes=item.grace_minutes)

    if now > deadline:
        return RunSheetStatus.LATE
    if starts_at <= now <= deadline:
        return RunSheetStatus.IN_PROGRESS
    return RunSheetStatus.PENDING


def refresh_status(db: Session, wedding: Wedding, now: datetime | None = None) -> dict:
    """Persist derived statuses against the *real* clock.

    Only ever called with the real time; a simulated board never writes.
    """
    now = now or datetime.now()
    late_count = 0
    changed = 0

    for item in wedding.runsheet:
        new_status = effective_status(wedding, item, now)
        if new_status == RunSheetStatus.LATE:
            late_count += 1
        if new_status != item.status:
            item.status = new_status
            changed += 1

    if changed:
        db.commit()
    return {"late_count": late_count, "updated": changed}


def check_in(db: Session, item: RunSheetItem, when: datetime | None = None) -> RunSheetItem:
    """Mark the responsible vendor as arrived.  Records the real timestamp so
    the vendor scorecard is evidence, not opinion."""
    item.checked_in_at = when or datetime.now()
    item.status = RunSheetStatus.ARRIVED
    db.commit()
    db.refresh(item)
    return item


def board(db: Session, wedding: Wedding, now: datetime | None = None) -> dict:
    """The live board, grouped by day, with an alert strip on top.

    Alerts are deliberately scoped to the day being run.  A planner standing
    at the reception does not need to be told that day one's mehendi setup
    never checked in — that is history, and it belongs on the vendor
    scorecard, not in the live alert strip.
    """
    simulated = now is not None
    if not simulated:
        # only the real clock is allowed to write
        refresh_status(db, wedding)
    now = now or datetime.now()
    today = now.date()

    day_dates = {
        1: wedding.day1_date,
        2: wedding.day2_date,
        3: wedding.day3_date,
    }

    days: dict[int, list[dict]] = {1: [], 2: [], 3: []}
    alerts: list[dict] = []

    for item in sorted(wedding.runsheet, key=lambda i: (i.day_number, i.start_time)):
        starts_at = _slot_datetime(wedding, item)
        slot_date = day_dates.get(item.day_number, wedding.day3_date)
        is_today = slot_date == today
        status = effective_status(wedding, item, now)

        minutes_late = 0
        if status == RunSheetStatus.LATE:
            minutes_late = int(
                (now - starts_at - timedelta(minutes=item.grace_minutes)).total_seconds() // 60
            )

        # a slot whose day has passed without a check-in is history, not an alert
        display_status = status.value
        if status == RunSheetStatus.LATE and slot_date < today:
            display_status = "Missed"

        row = {
            "id": item.id,
            "day_number": item.day_number,
            "date": slot_date.isoformat(),
            "is_today": is_today,
            "start_time": item.start_time.strftime("%H:%M"),
            "end_time": item.end_time.strftime("%H:%M") if item.end_time else None,
            "title": item.title,
            "location": item.location,
            "status": display_status,
            "owner": item.owner.name if item.owner else None,
            "vendor_id": item.vendor_id,
            "vendor": item.vendor.name if item.vendor else None,
            "vendor_phone": item.vendor.phone if item.vendor else None,
            "checked_in_at": item.checked_in_at.strftime("%H:%M")
            if item.checked_in_at
            else None,
            "grace_minutes": item.grace_minutes,
            "minutes_late": max(minutes_late, 0),
            "notes": item.notes,
        }
        days.setdefault(item.day_number, []).append(row)

        if status == RunSheetStatus.LATE and is_today:
            alerts.append(
                {
                    "slot_id": item.id,
                    "title": item.title,
                    "vendor": item.vendor.name if item.vendor else "Unassigned",
                    "vendor_phone": item.vendor.phone if item.vendor else None,
                    "owner": item.owner.name if item.owner else "Unassigned",
                    "scheduled": item.start_time.strftime("%H:%M"),
                    "minutes_late": max(minutes_late, 0),
                }
            )

    alerts.sort(key=lambda a: a["minutes_late"], reverse=True)
    active_day = next((d for d, dt in day_dates.items() if dt == today), None)

    total = len(wedding.runsheet)
    done = sum(
        1
        for i in wedding.runsheet
        if effective_status(wedding, i, now)
        in (RunSheetStatus.DONE, RunSheetStatus.ARRIVED)
    )

    return {
        "wedding_id": wedding.id,
        "wedding_code": wedding.code,
        "couple_name": wedding.couple_name,
        "venue": wedding.venue,
        "server_time": now.strftime("%H:%M"),
        "server_date": today.isoformat(),
        "active_day": active_day,
        "day_dates": {str(k): v.isoformat() for k, v in day_dates.items()},
        "days": days,
        "alerts": alerts,
        "total_slots": total,
        "completed_slots": done,
        "progress_pct": round(100.0 * done / total, 1) if total else 0.0,
    }
