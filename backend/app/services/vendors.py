"""What a vendor can take on, and whether a particular wedding fits.

The vendor keeps two things up to date in their portal: their calendar (days
they are limited or unavailable) and their capacity (largest headcount, how
many events a day, which cities, how much notice).  The manager sees the
result as a plain warning when inviting vendors to quote — "already booked on
14 Dec", "kitchen tops out at 300 guests" — instead of finding out on a phone
call three days later.
"""
from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from ..models import (
    Vendor,
    VendorAvailability,
    VendorContract,
    Wedding,
    WeddingStatus,
)


def wedding_days(w: Wedding) -> list[date]:
    return [w.day1_date, w.day2_date, w.day3_date]


def booked_days(db: Session, vendor: Vendor, exclude_wedding_id: int | None = None) -> dict[date, list[str]]:
    """Every day this vendor is already contracted for, with whose wedding."""
    out: dict[date, list[str]] = {}
    rows = (
        db.query(VendorContract)
        .join(Wedding, Wedding.id == VendorContract.wedding_id)
        .filter(
            VendorContract.vendor_id == vendor.id,
            Wedding.status != WeddingStatus.CANCELLED,
        )
        .all()
    )
    for c in rows:
        if exclude_wedding_id and c.wedding_id == exclude_wedding_id:
            continue
        for d in wedding_days(c.wedding):
            out.setdefault(d, []).append(c.wedding.code)
    return out


def blocked_days(db: Session, vendor: Vendor) -> dict[date, VendorAvailability]:
    return {
        a.day: a
        for a in db.query(VendorAvailability).filter(VendorAvailability.vendor_id == vendor.id)
    }


def fit_for(db: Session, vendor: Vendor, wedding: Wedding, guests: int | None = None) -> dict:
    """Can this vendor do this wedding?  Problems block; warnings inform."""
    guests = guests or wedding.guest_count
    problems: list[str] = []
    warnings: list[str] = []

    blocked = blocked_days(db, vendor)
    booked = booked_days(db, vendor, exclude_wedding_id=wedding.id)
    per_day = vendor.max_events_per_day or 1

    for d in wedding_days(wedding):
        label = d.strftime("%d %b")
        mark = blocked.get(d)
        if mark and mark.status == "Unavailable":
            problems.append(f"Marked unavailable on {label}" + (f" — {mark.note}" if mark.note else ""))
        elif mark and mark.status == "Limited":
            warnings.append(f"Limited availability on {label}" + (f" — {mark.note}" if mark.note else ""))
        if len(booked.get(d, [])) >= per_day:
            problems.append(f"Already booked on {label} ({', '.join(booked[d])})")

    if vendor.max_guests and guests > vendor.max_guests:
        problems.append(f"Handles up to {vendor.max_guests} guests — this wedding has {guests}")

    cities = [c.lower() for c in vendor.cities]
    if cities and wedding.city and wedding.city.lower() not in cities:
        warnings.append(f"Does not usually work in {wedding.city}")

    if vendor.lead_time_days:
        notice = (wedding.day1_date - date.today()).days
        if 0 <= notice < vendor.lead_time_days:
            warnings.append(f"Needs {vendor.lead_time_days} days' notice — {notice} left")

    return {
        "ok": not problems,
        "problems": problems,
        "warnings": warnings,
        "label": "Fits" if not problems and not warnings else ("Check" if not problems else "Conflict"),
    }


def vendor_card(v: Vendor) -> dict:
    """The vendor as the agency sees them — capacity included, private cost
    figures never."""
    return {
        "id": v.id,
        "name": v.name,
        "category": v.category,
        "city": v.city,
        "contact_person": v.contact_person,
        "phone": v.phone,
        "email": v.email,
        "quality_rating": v.quality_rating,
        "jobs_completed": v.jobs_completed,
        "on_time_pct": v.on_time_pct,
        "notes": v.notes,
        "max_guests": v.max_guests,
        "team_size": v.team_size,
        "max_events_per_day": v.max_events_per_day,
        "service_cities": v.service_cities,
        "lead_time_days": v.lead_time_days,
        "min_order_value": v.min_order_value,
        "capabilities": [s.strip() for s in (v.capabilities or "").splitlines() if s.strip()],
        "has_portal": bool(v.password_hash),
        "portal_active": v.portal_active is not False,
    }


def contract_money(c: VendorContract) -> dict:
    """The vendor's view of one job: what they will earn, what has landed,
    and — from their private cost figure — what they keep."""
    extras = sum(
        co.vendor_cost
        for co in c.wedding.change_orders
        if co.vendor_id == c.vendor_id and co.approved
    ) if c.wedding else 0.0
    value = round(c.agreed_amount + extras, 2)
    received = round((c.advance_paid or 0) + sum(b.paid_amount or 0 for b in c.bills), 2)
    cost = c.vendor_cost
    profit = round(value - cost, 2) if cost is not None else None
    return {
        "contract_value": round(c.agreed_amount, 2),
        "extras": round(extras, 2),
        "total_value": value,
        "received": received,
        "outstanding": round(max(value - received, 0), 2),
        "vendor_cost": cost,
        "profit": profit,
        "margin_pct": round(100 * profit / value, 1) if profit is not None and value else None,
    }

