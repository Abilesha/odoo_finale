"""Scenes 5 and 6 — vendor settlement and the founder's season review.

Two jobs:

1. Three-way match.  A vendor bill is only payable when it reconciles against
   the agreed contract plus approved extras.  Advances already paid are netted
   off automatically, which is how "nothing is paid twice" becomes structural
   rather than a thing someone has to remember.

2. Profit.  Revenue (package + billed additions) minus cost (vendor
   settlements + planning-team hours) per wedding, and across the season.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from ..models import (
    BillMatchStatus,
    ChangeOrder,
    MilestoneStatus,
    PaymentMilestone,
    RunSheetStatus,
    VendorBill,
    VendorContract,
    Wedding,
    WeddingStatus,
)

#: a bill within this fraction of the agreed figure is auto-approved
MATCH_TOLERANCE = 0.02


def evaluate_bill(db: Session, bill: VendorBill) -> dict:
    """Run the three-way match and return the verdict.

    expected = agreed contract amount + extras approved for this vendor
    variance = what the vendor billed minus what was expected
    net_payable = billed - advance already paid - amount already paid
    """
    contract = bill.contract
    approved_extras = sum(
        co.vendor_cost
        for co in db.query(ChangeOrder)
        .filter(
            ChangeOrder.wedding_id == contract.wedding_id,
            ChangeOrder.vendor_id == contract.vendor_id,
            ChangeOrder.approved.is_(True),
        )
        .all()
    )

    expected = round(contract.agreed_amount + approved_extras, 2)
    variance = round(bill.billed_amount - expected, 2)
    variance_pct = round(100.0 * variance / expected, 2) if expected else 0.0

    already_paid = bill.paid_amount or 0.0
    net_payable = round(bill.billed_amount - contract.advance_paid - already_paid, 2)

    if bill.paid_at is not None:
        status = BillMatchStatus.PAID
    elif abs(variance) <= expected * MATCH_TOLERANCE:
        status = BillMatchStatus.MATCHED
    elif variance > 0:
        status = BillMatchStatus.BLOCKED  # vendor billed more than agreed
    else:
        status = BillMatchStatus.VARIANCE  # billed less — safe, but flag it

    bill.approved_extras = approved_extras
    bill.match_status = status
    db.commit()

    return {
        "bill_id": bill.id,
        "bill_number": bill.bill_number,
        "vendor_id": contract.vendor_id,
        "vendor_name": contract.vendor.name if contract.vendor else "—",
        "category": contract.category,
        "wedding_id": contract.wedding_id,
        "agreed_amount": contract.agreed_amount,
        "approved_extras": round(approved_extras, 2),
        "expected_total": expected,
        "billed_amount": bill.billed_amount,
        "variance": variance,
        "variance_pct": variance_pct,
        "advance_paid": contract.advance_paid,
        "already_paid": already_paid,
        "net_payable": max(net_payable, 0.0),
        "match_status": status.value,
        # Over-billing is a hard stop; under-billing is favourable, so it is
        # flagged for review but still payable.
        "payable": status in (BillMatchStatus.MATCHED, BillMatchStatus.VARIANCE)
        and net_payable > 0,
        "bill_date": bill.bill_date.isoformat() if bill.bill_date else None,
        "due_date": bill.due_date.isoformat() if bill.due_date else None,
        "paid_at": bill.paid_at.isoformat() if bill.paid_at else None,
        "notes": bill.notes,
    }


def pay_bill(db: Session, bill: VendorBill, reference: str | None = None) -> dict:
    """Settle a bill.  Refuses to pay twice and refuses to pay a blocked bill —
    the two failure modes the brief calls out by name."""
    verdict = evaluate_bill(db, bill)

    if bill.paid_at is not None:
        raise ValueError(
            f"Bill {bill.bill_number} was already settled on "
            f"{bill.paid_at.date().isoformat()}. Refusing to pay twice."
        )
    if verdict["match_status"] == BillMatchStatus.BLOCKED.value:
        raise ValueError(
            f"Bill {bill.bill_number} is blocked: billed "
            f"{verdict['variance']:,.0f} more than agreed. Raise a change "
            f"order to approve the extra, then settle."
        )

    transferred = verdict["net_payable"]
    bill.paid_amount = transferred
    bill.paid_at = datetime.utcnow()
    bill.payment_reference = reference or f"UTR-{bill.id:06d}"
    bill.match_status = BillMatchStatus.PAID

    # vendor scorecard: a clean, on-budget settlement counts as a completed job
    vendor = bill.contract.vendor
    if vendor:
        vendor.jobs_completed += 1
        if abs(verdict["variance_pct"]) <= 2:
            vendor.on_time_count += 1

    db.commit()

    # Re-evaluate so the caller sees the settled state, but report the amount
    # actually transferred — after settlement `net_payable` is the remaining
    # balance, which is now zero.
    settled = evaluate_bill(db, bill)
    settled["amount_paid"] = transferred
    settled["detail"] = (
        f"INR {transferred:,.0f} transferred to {settled['vendor_name']} "
        f"(bill {bill.bill_number} less advance of "
        f"INR {bill.contract.advance_paid:,.0f} already released)."
    )
    return settled


# --------------------------------------------------------------------------
# Profit
# --------------------------------------------------------------------------
def wedding_pnl(db: Session, wedding: Wedding) -> dict:
    """Per-wedding profit and loss, built from records rather than notebooks."""
    package_revenue = wedding.package_value or 0.0

    change_orders = (
        db.query(ChangeOrder).filter(ChangeOrder.wedding_id == wedding.id).all()
    )
    additions_revenue = sum(co.client_amount for co in change_orders if co.billed_to_client)
    extras_cost = sum(co.vendor_cost for co in change_orders if co.approved)

    contracts = (
        db.query(VendorContract).filter(VendorContract.wedding_id == wedding.id).all()
    )
    # Cost of a vendor = what we actually settled if billed, else the agreed
    # commitment.  Using the commitment keeps in-flight weddings honest.
    vendor_cost = 0.0
    committed = 0.0
    for c in contracts:
        committed += c.agreed_amount
        billed = [b for b in c.bills]
        if billed:
            vendor_cost += sum(b.billed_amount for b in billed)
        else:
            vendor_cost += c.agreed_amount

    labour_cost = sum(
        (log.hours or 0.0) * (log.staff.hourly_cost if log.staff else 0.0)
        for log in wedding.time_logs
    )
    labour_hours = sum(log.hours or 0.0 for log in wedding.time_logs)

    revenue = round(package_revenue + additions_revenue, 2)
    cost = round(vendor_cost + labour_cost, 2)
    profit = round(revenue - cost, 2)
    margin = round(100.0 * profit / revenue, 2) if revenue else 0.0

    collected = sum(
        m.amount for m in wedding.milestones if m.status == MilestoneStatus.PAID
    )
    outstanding = round(revenue - collected, 2)

    return {
        "wedding_id": wedding.id,
        "code": wedding.code,
        "couple_name": wedding.couple_name,
        "status": wedding.status.value,
        "package_type": wedding.package_type.value,
        "day1_date": wedding.day1_date.isoformat(),
        "guest_count": wedding.guest_count,
        "actual_guest_count": wedding.actual_guest_count,
        "package_revenue": round(package_revenue, 2),
        "additions_revenue": round(additions_revenue, 2),
        "revenue": revenue,
        "vendor_cost": round(vendor_cost, 2),
        "committed_vendor_cost": round(committed, 2),
        "extras_cost": round(extras_cost, 2),
        "labour_cost": round(labour_cost, 2),
        "labour_hours": round(labour_hours, 1),
        "cost": cost,
        "profit": profit,
        "margin_pct": margin,
        "collected": round(collected, 2),
        "outstanding": outstanding,
        "budget_cap": wedding.budget_cap,
        "over_budget": cost > wedding.budget_cap > 0,
    }


def season_overview(db: Session) -> dict:
    """Every wedding in the season on one screen — the founder's question."""
    weddings = db.query(Wedding).order_by(Wedding.day1_date).all()
    rows = [wedding_pnl(db, w) for w in weddings]

    active = [r for r in rows if r["status"] != WeddingStatus.CANCELLED.value]
    total_revenue = round(sum(r["revenue"] for r in active), 2)
    total_cost = round(sum(r["cost"] for r in active), 2)
    total_profit = round(total_revenue - total_cost, 2)

    loss_makers = [r for r in active if r["profit"] < 0]
    best = max(active, key=lambda r: r["profit"]) if active else None
    worst = min(active, key=lambda r: r["profit"]) if active else None

    return {
        "wedding_count": len(active),
        "total_revenue": total_revenue,
        "total_cost": total_cost,
        "total_profit": total_profit,
        "avg_margin_pct": round(100.0 * total_profit / total_revenue, 2)
        if total_revenue
        else 0.0,
        "loss_making_count": len(loss_makers),
        "best_wedding": best,
        "worst_wedding": worst,
        "weddings": rows,
    }


def cash_due(db: Session, days: int = 30) -> dict:
    """What money moves in the coming weeks — in and out."""
    horizon = date.today() + timedelta(days=days)

    incoming = [
        {
            "wedding_id": m.wedding_id,
            "wedding_code": m.wedding.code,
            "couple_name": m.wedding.couple_name,
            "kind": m.kind.value,
            "amount": m.amount,
            "due_date": m.due_date.isoformat(),
            "overdue": m.is_overdue,
        }
        for m in db.query(PaymentMilestone)
        .filter(
            PaymentMilestone.status != MilestoneStatus.PAID,
            PaymentMilestone.due_date <= horizon,
        )
        .order_by(PaymentMilestone.due_date)
        .all()
    ]

    outgoing = []
    for bill in (
        db.query(VendorBill).filter(VendorBill.paid_at.is_(None)).all()
    ):
        if bill.due_date and bill.due_date > horizon:
            continue
        verdict = evaluate_bill(db, bill)
        outgoing.append(
            {
                "bill_id": bill.id,
                "bill_number": bill.bill_number,
                "vendor_name": verdict["vendor_name"],
                "wedding_id": verdict["wedding_id"],
                "amount": verdict["net_payable"],
                "due_date": bill.due_date.isoformat() if bill.due_date else None,
                "match_status": verdict["match_status"],
            }
        )
    outgoing.sort(key=lambda o: o["due_date"] or "9999")

    total_in = round(sum(i["amount"] for i in incoming), 2)
    total_out = round(sum(o["amount"] for o in outgoing), 2)

    return {
        "horizon_days": days,
        "incoming": incoming,
        "outgoing": outgoing,
        "total_incoming": total_in,
        "total_outgoing": total_out,
        "net": round(total_in - total_out, 2),
        "overdue_incoming": round(
            sum(i["amount"] for i in incoming if i["overdue"]), 2
        ),
    }


def vendor_scorecard(db: Session) -> list[dict]:
    """Which vendors keep delivering well.

    Scored on three things the agency actually feels: did they turn up on
    time, did they bill what they agreed, and how were they rated.
    """
    from ..models import RunSheetItem, Vendor

    out = []
    for vendor in db.query(Vendor).all():
        contracts = (
            db.query(VendorContract).filter(VendorContract.vendor_id == vendor.id).all()
        )
        bills = [b for c in contracts for b in c.bills]

        billed = sum(b.billed_amount for b in bills)
        agreed = sum(c.agreed_amount for c in contracts if c.bills)
        overbill_pct = round(100.0 * (billed - agreed) / agreed, 2) if agreed else 0.0

        slots = (
            db.query(RunSheetItem).filter(RunSheetItem.vendor_id == vendor.id).all()
        )
        late = sum(1 for s in slots if s.status == RunSheetStatus.LATE)
        punctuality = (
            round(100.0 * (len(slots) - late) / len(slots), 1) if slots else 100.0
        )

        reliability = round(
            punctuality * 0.4
            + vendor.quality_rating * 20 * 0.4
            + max(0.0, 100.0 - abs(overbill_pct) * 5) * 0.2,
            1,
        )

        out.append(
            {
                "vendor_id": vendor.id,
                "name": vendor.name,
                "category": vendor.category,
                "city": vendor.city,
                "weddings_worked": len(contracts),
                "total_agreed": round(sum(c.agreed_amount for c in contracts), 2),
                "total_billed": round(billed, 2),
                "overbill_pct": overbill_pct,
                "punctuality_pct": punctuality,
                "late_slots": late,
                "quality_rating": vendor.quality_rating,
                "reliability_score": reliability,
            }
        )

    out.sort(key=lambda v: v["reliability_score"], reverse=True)
    return out
