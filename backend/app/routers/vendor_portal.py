"""The vendor's own control panel.

A vendor signs in and does four things that used to happen over WhatsApp:

  1. Price the requests a manager sends — line by line, with a calculator, so
     their quote lands in the manager's comparison already in the same shape
     as everyone else's.
  2. Keep their calendar and capacity current, so they are not invited to
     weddings they cannot do.
  3. Tell the manager how their part is going — on track, delayed and why,
     done — instead of being chased by phone.
  4. See what they will earn, what has been paid, and what they keep.

Everything is scoped to the signed-in vendor.  Their own cost figures are
private to them: nothing on this router is ever read by the agency's screens.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..timeutil import utc_iso
from ..models import (
    Quote,
    QuoteLine,
    QuoteStatus,
    RFQStatus,
    RunSheetItem,
    Vendor,
    VendorAvailability,
    VendorContract,
    VendorUpdate,
    Wedding,
    WeddingStatus,
)
from pydantic import BaseModel, Field

from ..schemas import (
    AvailabilityIn,
    VendorCostIn,
    VendorDeclineIn,
    VendorProfileIn,
    VendorProgressIn,
    VendorQuoteIn,
)
from ..services.auth import current_vendor, hash_password, vendor_payload, verify_password
from ..services.quotes import normalise_quote
from ..services.vendors import blocked_days, booked_days, contract_money, fit_for, vendor_card

router = APIRouter(prefix="/api/vendor-portal", tags=["7 · Vendor portal"])


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def _event(w: Wedding) -> dict:
    """What a vendor is told about a wedding — enough to plan the job, and
    nothing about the agency's fee or margin."""
    return {
        "wedding_id": w.id,
        "code": w.code,
        "couple_name": w.couple_name,
        "city": w.city,
        "venue": w.venue,
        "theme": w.theme,
        "guest_count": w.guest_count,
        "day1_date": w.day1_date.isoformat(),
        "day3_date": w.day3_date.isoformat(),
        "days_to_go": (w.day1_date - date.today()).days,
        "status": w.status.value,
        "manager": w.planner.name if w.planner else None,
        "manager_phone": w.planner.phone if w.planner else None,
        "manager_email": w.planner.email if w.planner else None,
    }


def _request_state(q: Quote) -> str:
    if q.declined:
        return "Declined"
    if q.status == QuoteStatus.AWARDED:
        return "Won"
    if q.status == QuoteStatus.REJECTED:
        return "Not selected"
    if q.status == QuoteStatus.RECEIVED:
        return "Submitted"
    return "New"


def _request_row(db: Session, v: Vendor, q: Quote) -> dict:
    rfq = q.rfq
    w = rfq.wedding
    state = _request_state(q)
    priced = normalise_quote(q, rfq.guest_count or w.guest_count) if q.lines else None
    return {
        "quote_id": q.id,
        "rfq_id": rfq.id,
        "state": state,
        "title": rfq.title,
        "category": rfq.category,
        "scope": rfq.scope,
        "guest_count": rfq.guest_count or w.guest_count,
        "respond_by": rfq.needed_by.isoformat() if rfq.needed_by else None,
        "respond_in_days": (rfq.needed_by - date.today()).days if rfq.needed_by else None,
        "sent_at": rfq.created_at.isoformat(),
        "submitted_at": q.received_at.isoformat() if q.received_at else None,
        "your_total": priced["landed_total"] if priced else None,
        "competing": len(rfq.quotes),
        "open": rfq.status != RFQStatus.AWARDED and not q.declined,
        "shortlisted": q.id in rfq.shortlist_ids,
        "event": _event(w),
        "fit": fit_for(db, v, w, rfq.guest_count) if state == "New" else None,
    }


def _own_quote(db: Session, v: Vendor, quote_id: int) -> Quote:
    q = db.get(Quote, quote_id)
    # another vendor's request is "not found", not "forbidden" — no probing
    if not q or q.vendor_id != v.id:
        raise HTTPException(404, "Request not found")
    return q


def _own_contract(db: Session, v: Vendor, contract_id: int) -> VendorContract:
    c = db.get(VendorContract, contract_id)
    if not c or c.vendor_id != v.id:
        raise HTTPException(404, "Job not found")
    return c


def _job_row(db: Session, c: VendorContract) -> dict:
    w = c.wedding
    today = date.today()
    slots = (
        db.query(RunSheetItem)
        .filter(RunSheetItem.wedding_id == w.id, RunSheetItem.vendor_id == c.vendor_id)
        .order_by(RunSheetItem.day_number, RunSheetItem.start_time)
        .all()
    )
    day_dates = {1: w.day1_date, 2: w.day2_date, 3: w.day3_date}
    if w.status == WeddingStatus.COMPLETED or w.day3_date < today:
        phase = "Completed"
    elif w.day1_date <= today <= w.day3_date:
        phase = "Live"
    else:
        phase = "Upcoming"
    latest = c.updates[0] if c.updates else None
    return {
        "contract_id": c.id,
        "category": c.category,
        "phase": phase,
        "signed_on": c.signed_on.isoformat() if c.signed_on else None,
        "event": _event(w),
        "money": contract_money(c),
        "advance_paid": c.advance_paid,
        "progress_pct": c.progress_pct if c.progress_pct is not None else (100 if phase == "Completed" else 0),
        "work_status": c.work_status or ("Completed" if phase == "Completed" else "Not started"),
        "latest_update": None if not latest else {
            "status": latest.status,
            "message": latest.message,
            "progress_pct": latest.progress_pct,
            "created_at": utc_iso(latest.created_at),
            "seen_by_manager": latest.acknowledged_at is not None,
        },
        "slots": [
            {
                "day": s.day_number,
                "date": day_dates[s.day_number].isoformat(),
                "start_time": s.start_time.strftime("%H:%M"),
                "title": s.title,
                "location": s.location,
                "status": s.status.value,
                "checked_in_at": s.checked_in_at.strftime("%H:%M") if s.checked_in_at else None,
            }
            for s in slots
        ],
        "bills": [
            {
                "bill_number": b.bill_number,
                "billed_amount": b.billed_amount,
                "paid_amount": b.paid_amount,
                "paid_at": b.paid_at.isoformat() if b.paid_at else None,
                "status": b.match_status.value,
            }
            for b in c.bills
        ],
    }


# --------------------------------------------------------------------------
# Profile & capacity
# --------------------------------------------------------------------------
@router.get("/me")
def me(v: Vendor = Depends(current_vendor)):
    return {**vendor_payload(v), "profile": vendor_card(v)}


@router.patch("/me")
def update_profile(
    payload: VendorProfileIn,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    """The vendor keeps their own capacity current — the manager reads it
    every time they decide who to invite."""
    for key, value in payload.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(v, key, value)
    db.commit()
    db.refresh(v)
    return {**vendor_card(v), "detail": "Profile saved. Managers see it next time they invite."}


class VendorPasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/change-password")
def change_password(
    payload: VendorPasswordIn,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, v.password_hash):
        raise HTTPException(401, "Your current password is not correct")
    v.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "detail": "Password changed. Use it next time you sign in."}


# --------------------------------------------------------------------------
# Overview
# --------------------------------------------------------------------------
@router.get("/overview")
def overview(v: Vendor = Depends(current_vendor), db: Session = Depends(get_db)):
    today = date.today()
    quotes = db.query(Quote).filter(Quote.vendor_id == v.id).all()
    rows = [_request_row(db, v, q) for q in quotes]
    new = [r for r in rows if r["state"] == "New" and r["open"]]
    submitted = [r for r in rows if r["state"] == "Submitted"]
    won = [r for r in rows if r["state"] == "Won"]
    decided = [r for r in rows if r["state"] in ("Won", "Not selected")]

    contracts = db.query(VendorContract).filter(VendorContract.vendor_id == v.id).all()
    jobs = [_job_row(db, c) for c in contracts]
    upcoming = sorted(
        (j for j in jobs if j["phase"] in ("Upcoming", "Live")),
        key=lambda j: j["event"]["day1_date"],
    )
    money = [j["money"] for j in jobs]
    costed = [m for m in money if m["profit"] is not None]

    return {
        "vendor": vendor_card(v),
        "stats": {
            "new_requests": len(new),
            "submitted": len(submitted),
            "won": len(won),
            "win_rate": round(100 * len(won) / len(decided), 1) if decided else None,
            "active_jobs": len(upcoming),
            "live_jobs": sum(1 for j in upcoming if j["phase"] == "Live"),
            "completed_jobs": sum(1 for j in jobs if j["phase"] == "Completed"),
            "contracted": round(sum(m["total_value"] for m in money), 2),
            "received": round(sum(m["received"] for m in money), 2),
            "outstanding": round(sum(m["outstanding"] for m in money), 2),
            "profit": round(sum(m["profit"] for m in costed), 2) if costed else None,
            "margin_pct": round(
                100 * sum(m["profit"] for m in costed) / sum(m["total_value"] for m in costed), 1
            ) if costed and sum(m["total_value"] for m in costed) else None,
            "delayed": sum(1 for j in upcoming if j["work_status"] in ("Delayed", "Blocked")),
            "on_time_pct": v.on_time_pct,
            "rating": v.quality_rating,
        },
        "new_requests": sorted(new, key=lambda r: r["respond_by"] or "9999")[:6],
        "upcoming_jobs": upcoming[:6],
        "today": today.isoformat(),
    }


# --------------------------------------------------------------------------
# Requests to price
# --------------------------------------------------------------------------
@router.get("/requests")
def requests(v: Vendor = Depends(current_vendor), db: Session = Depends(get_db)):
    quotes = db.query(Quote).filter(Quote.vendor_id == v.id).all()
    rows = [_request_row(db, v, q) for q in quotes]
    order = {"New": 0, "Submitted": 1, "Won": 2, "Not selected": 3, "Declined": 4}
    rows.sort(key=lambda r: (order.get(r["state"], 9), r["respond_by"] or "9999"))
    counts: dict[str, int] = defaultdict(int)
    for r in rows:
        counts[r["state"]] += 1
    return {"counts": dict(counts), "requests": rows}


@router.get("/requests/{quote_id}")
def request_detail(
    quote_id: int, v: Vendor = Depends(current_vendor), db: Session = Depends(get_db)
):
    q = _own_quote(db, v, quote_id)
    row = _request_row(db, v, q)
    row["fit"] = fit_for(db, v, q.rfq.wedding, q.rfq.guest_count)
    row["quote"] = {
        "lines": [
            {
                "description": ln.description,
                "unit": ln.unit.value,
                "quantity": ln.quantity,
                "unit_price": ln.unit_price,
            }
            for ln in q.lines
        ],
        "gst_percent": q.gst_percent,
        "logistics_fee": q.logistics_fee,
        "extra_hour_rate": q.extra_hour_rate,
        "inclusions": q.inclusions,
        "exclusions": q.exclusions,
        "validity_days": q.validity_days,
        "notes": None if q.declined else q.notes,
        "vendor_cost_estimate": q.vendor_cost_estimate,
        "priced": normalise_quote(q, row["guest_count"]) if q.lines else None,
    }
    return row


@router.post("/requests/{quote_id}/submit")
def submit(
    quote_id: int,
    payload: VendorQuoteIn,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    """Send the price.  It lands in the manager's comparison immediately, in
    the same shape as every other vendor's — no PDF to re-key."""
    q = _own_quote(db, v, quote_id)
    rfq = q.rfq
    if rfq.status == RFQStatus.AWARDED:
        raise HTTPException(409, "This request has already been decided")
    if rfq.status == RFQStatus.CANCELLED:
        raise HTTPException(409, "The manager cancelled this request")

    for field in ("extra_hour_rate", "inclusions", "exclusions", "gst_percent",
                  "logistics_fee", "validity_days", "notes", "vendor_cost_estimate"):
        setattr(q, field, getattr(payload, field))

    for old in list(q.lines):
        db.delete(old)
    db.flush()
    for line in payload.lines:
        db.add(QuoteLine(quote_id=q.id, **line.model_dump()))

    first_time = q.status == QuoteStatus.PENDING
    q.declined = False
    q.status = QuoteStatus.RECEIVED
    q.received_at = datetime.utcnow()
    if rfq.status in (RFQStatus.SENT, RFQStatus.DRAFT):
        rfq.status = RFQStatus.COMPARING
    db.commit()
    db.refresh(q)

    priced = normalise_quote(q, rfq.guest_count or rfq.wedding.guest_count)
    manager = rfq.wedding.planner.name if rfq.wedding.planner else "The manager"
    return {
        "ok": True,
        "quote_id": q.id,
        "landed_total": priced["landed_total"],
        "cost_per_plate": priced["cost_per_plate"],
        "detail": (
            f"{'Quote sent' if first_time else 'Quote revised'} — "
            f"INR {priced['landed_total']:,.0f} all-in. "
            f"{manager} can compare it now."
        ),
    }


@router.post("/requests/{quote_id}/decline")
def decline(
    quote_id: int,
    payload: VendorDeclineIn,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    """Say no early, with a reason — so the manager invites someone else
    today instead of waiting a week for a reply that never comes."""
    q = _own_quote(db, v, quote_id)
    if q.rfq.status == RFQStatus.AWARDED:
        raise HTTPException(409, "This request has already been decided")
    if q.status == QuoteStatus.AWARDED:
        raise HTTPException(409, "You have already won this one")
    q.declined = True
    q.status = QuoteStatus.REJECTED
    q.notes = f"Declined by vendor: {payload.reason.strip()}"
    q.received_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "detail": "Declined. The manager has been told why."}


# --------------------------------------------------------------------------
# Jobs, progress and money
# --------------------------------------------------------------------------
@router.get("/jobs")
def jobs(v: Vendor = Depends(current_vendor), db: Session = Depends(get_db)):
    contracts = db.query(VendorContract).filter(VendorContract.vendor_id == v.id).all()
    rows = [_job_row(db, c) for c in contracts]
    order = {"Live": 0, "Upcoming": 1, "Completed": 2}
    rows.sort(key=lambda j: (
        order[j["phase"]],
        j["event"]["day1_date"] if j["phase"] != "Completed" else "",
    ))
    # completed newest first
    done = sorted((j for j in rows if j["phase"] == "Completed"),
                  key=lambda j: j["event"]["day1_date"], reverse=True)
    active = [j for j in rows if j["phase"] != "Completed"]
    return {"jobs": active + done}


@router.get("/jobs/{contract_id}/updates")
def job_updates(
    contract_id: int, v: Vendor = Depends(current_vendor), db: Session = Depends(get_db)
):
    c = _own_contract(db, v, contract_id)
    return [
        {
            "id": u.id,
            "status": u.status,
            "progress_pct": u.progress_pct,
            "message": u.message,
            "expected_by": u.expected_by.isoformat() if u.expected_by else None,
            "created_at": utc_iso(u.created_at),
            "seen_by_manager": u.acknowledged_at is not None,
        }
        for u in c.updates
    ]


@router.post("/jobs/{contract_id}/updates", status_code=201)
def post_update(
    contract_id: int,
    payload: VendorProgressIn,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    """Tell the manager how it is going.  A delay needs a reason and a new
    date — "running late" on its own helps nobody plan around it."""
    c = _own_contract(db, v, contract_id)
    if payload.status == "Delayed" and not payload.expected_by:
        raise HTTPException(400, "Say when it will be ready — the manager plans around that date")
    progress = 100 if payload.status == "Completed" else payload.progress_pct
    u = VendorUpdate(
        contract_id=c.id,
        vendor_id=v.id,
        wedding_id=c.wedding_id,
        status=payload.status,
        progress_pct=progress,
        message=payload.message.strip(),
        expected_by=payload.expected_by,
    )
    db.add(u)
    c.progress_pct = progress
    c.work_status = payload.status
    db.commit()
    manager = c.wedding.planner.name if c.wedding.planner else "Your manager"
    return {
        "ok": True,
        "id": u.id,
        "detail": (
            f"{manager} has been told: {payload.status.lower()}"
            f"{' — flagged on their screen' if payload.status in ('Delayed', 'Blocked') else ''}."
        ),
    }


@router.patch("/jobs/{contract_id}/cost")
def set_cost(
    contract_id: int,
    payload: VendorCostIn,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    """The vendor's own cost to deliver.  Private: only this portal reads it."""
    c = _own_contract(db, v, contract_id)
    c.vendor_cost = payload.vendor_cost
    db.commit()
    return {"ok": True, "money": contract_money(c), "detail": "Cost saved — profit updated."}


@router.get("/earnings")
def earnings(v: Vendor = Depends(current_vendor), db: Session = Depends(get_db)):
    """What each job is worth, what has landed, and what the vendor keeps —
    by job and by month."""
    contracts = db.query(VendorContract).filter(VendorContract.vendor_id == v.id).all()
    rows = []
    monthly: dict[str, dict] = defaultdict(lambda: {"revenue": 0.0, "profit": 0.0, "received": 0.0})
    for c in contracts:
        m = contract_money(c)
        key = c.wedding.day1_date.strftime("%Y-%m")
        monthly[key]["revenue"] += m["total_value"]
        monthly[key]["received"] += m["received"]
        if m["profit"] is not None:
            monthly[key]["profit"] += m["profit"]
        rows.append({
            "contract_id": c.id,
            "couple_name": c.wedding.couple_name,
            "code": c.wedding.code,
            "day1_date": c.wedding.day1_date.isoformat(),
            "category": c.category,
            **m,
        })
    rows.sort(key=lambda r: r["day1_date"], reverse=True)
    costed = [r for r in rows if r["profit"] is not None]
    total_value = sum(r["total_value"] for r in rows)
    return {
        "summary": {
            "jobs": len(rows),
            "total_value": round(total_value, 2),
            "received": round(sum(r["received"] for r in rows), 2),
            "outstanding": round(sum(r["outstanding"] for r in rows), 2),
            "cost": round(sum(r["vendor_cost"] for r in costed), 2),
            "profit": round(sum(r["profit"] for r in costed), 2),
            "margin_pct": round(
                100 * sum(r["profit"] for r in costed) / sum(r["total_value"] for r in costed), 1
            ) if costed and sum(r["total_value"] for r in costed) else None,
            "uncosted": len(rows) - len(costed),
        },
        "monthly": [
            {"month": k, **{kk: round(vv, 2) for kk, vv in v_.items()}}
            for k, v_ in sorted(monthly.items())
        ],
        "jobs": rows,
    }


# --------------------------------------------------------------------------
# Availability
# --------------------------------------------------------------------------
@router.get("/availability")
def availability(
    start: date | None = None,
    days: int = 92,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    """The vendor's calendar: days booked through The Royal Knot (worked out
    from contracts), and days they have marked limited or unavailable."""
    start = start or date.today().replace(day=1)
    end = start + timedelta(days=max(1, min(days, 400)))
    blocked = blocked_days(db, v)
    booked = booked_days(db, v)
    out = []
    d = start
    while d < end:
        mark = blocked.get(d)
        out.append({
            "day": d.isoformat(),
            "status": mark.status if mark else ("Booked" if d in booked else "Available"),
            "marked": mark.status if mark else None,
            "note": mark.note if mark else None,
            "booked_for": booked.get(d, []),
        })
        d += timedelta(days=1)
    return {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "max_events_per_day": v.max_events_per_day or 1,
        "days": out,
    }


@router.put("/availability")
def set_availability(
    payload: AvailabilityIn,
    v: Vendor = Depends(current_vendor),
    db: Session = Depends(get_db),
):
    existing = blocked_days(db, v)
    changed = 0
    for item in payload.days:
        row = existing.get(item.day)
        if item.status == "Available":
            if row:
                db.delete(row)
                changed += 1
            continue
        if row:
            row.status = item.status
            row.note = item.note
        else:
            db.add(VendorAvailability(vendor_id=v.id, day=item.day,
                                      status=item.status, note=item.note))
        changed += 1
    db.commit()
    return {"ok": True, "changed": changed,
            "detail": f"Calendar updated — {changed} day(s) changed."}
