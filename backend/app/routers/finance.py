"""Scene 5 — vendor bills, three-way match, change orders and settlement."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    ChangeOrder,
    Staff,
    TimeLog,
    UnitOfMeasure,
    VendorBill,
    VendorContract,
    Wedding,
)
from ..schemas import (
    ChangeOrderCreate,
    PayBillIn,
    ReconcileGuests,
    TimeLogCreate,
    VendorBillCreate,
)
from ..services.auth import check_wedding, current_user, scope_weddings
from ..services.finance import evaluate_bill, pay_bill, wedding_pnl

router = APIRouter(prefix="/api/bills", tags=["5 · Settlement"])


@router.get("")
def list_bills(
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Every bill with its match verdict already computed — the manager never
    has to do the arithmetic that produces a double payment."""
    q = scope_weddings(
        db.query(VendorBill).join(VendorContract).join(
            Wedding, Wedding.id == VendorContract.wedding_id
        ),
        user,
    )
    if wedding_id:
        q = q.filter(VendorContract.wedding_id == wedding_id)
    rows = [evaluate_bill(db, b) for b in q.all()]
    return {
        "count": len(rows),
        "bills": rows,
        "blocked": sum(1 for r in rows if r["match_status"] == "Blocked"),
        "payable_total": round(
            sum(r["net_payable"] for r in rows if r["payable"]), 2
        ),
    }


@router.post("", status_code=201)
def create_bill(
    payload: VendorBillCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    contract = db.get(VendorContract, payload.contract_id)
    if not contract:
        raise HTTPException(404, "Contract not found")
    check_wedding(user, contract.wedding)
    bill = VendorBill(
        contract_id=payload.contract_id,
        bill_number=payload.bill_number,
        billed_amount=payload.billed_amount,
        bill_date=payload.bill_date or date.today(),
        due_date=payload.due_date,
        notes=payload.notes,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return evaluate_bill(db, bill)


@router.get("/{bill_id}")
def get_bill(bill_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)):
    bill = db.get(VendorBill, bill_id)
    if not bill:
        raise HTTPException(404, "Bill not found")
    check_wedding(user, bill.contract.wedding)
    return evaluate_bill(db, bill)


@router.post("/{bill_id}/pay")
def settle(
    bill_id: int,
    payload: PayBillIn,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Pay a matched bill, net of the advance already released.

    Refuses outright if the bill was already settled, or if the vendor billed
    more than was agreed without an approved change order.
    """
    bill = db.get(VendorBill, bill_id)
    if not bill:
        raise HTTPException(404, "Bill not found")
    check_wedding(user, bill.contract.wedding)
    try:
        return pay_bill(db, bill, payload.reference)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


# ---- Change orders --------------------------------------------------------
co_router = APIRouter(prefix="/api/change-orders", tags=["5 · Settlement"])


def _co(co: ChangeOrder) -> dict:
    return {
        "id": co.id,
        "wedding_id": co.wedding_id,
        "vendor_id": co.vendor_id,
        "vendor": co.vendor.name if co.vendor else None,
        "description": co.description,
        "unit": co.unit.value,
        "quantity": co.quantity,
        "vendor_unit_cost": co.vendor_unit_cost,
        "client_unit_price": co.client_unit_price,
        "vendor_cost": co.vendor_cost,
        "client_amount": co.client_amount,
        "margin": co.margin,
        "approved": co.approved,
        "billed_to_client": co.billed_to_client,
        "raised_at": co.raised_at.isoformat(),
    }


@co_router.get("")
def list_change_orders(
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    q = scope_weddings(db.query(ChangeOrder).join(Wedding), user)
    if wedding_id:
        q = q.filter(ChangeOrder.wedding_id == wedding_id)
    rows = [_co(c) for c in q.order_by(ChangeOrder.raised_at.desc()).all()]
    return {
        "count": len(rows),
        "change_orders": rows,
        "client_total": round(sum(r["client_amount"] for r in rows), 2),
        "vendor_total": round(sum(r["vendor_cost"] for r in rows), 2),
    }


@co_router.post("", status_code=201)
def create_change_order(
    payload: ChangeOrderCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    check_wedding(user, db.get(Wedding, payload.wedding_id))
    co = ChangeOrder(**payload.model_dump())
    db.add(co)
    db.commit()
    db.refresh(co)
    return _co(co)


@co_router.post("/{co_id}/approve")
def approve_change_order(co_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)):
    co = db.get(ChangeOrder, co_id)
    if not co:
        raise HTTPException(404, "Change order not found")
    check_wedding(user, co.wedding)
    co.approved = True
    db.commit()
    return _co(co)


@co_router.post("/{co_id}/bill-client")
def bill_client(co_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)):
    """Add the extra to the client's final invoice."""
    co = db.get(ChangeOrder, co_id)
    if not co:
        raise HTTPException(404, "Change order not found")
    check_wedding(user, co.wedding)
    if not co.approved:
        raise HTTPException(400, "Approve the change order before billing the client")
    co.billed_to_client = True
    db.commit()
    return _co(co)


# ---- Headcount reconciliation --------------------------------------------
recon_router = APIRouter(prefix="/api/reconcile", tags=["5 · Settlement"])


@recon_router.post("/{wedding_id}/guests")
def reconcile_guests(
    wedding_id: int,
    payload: ReconcileGuests,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """'60 unexpected guests turned up at the banquet.'

    One number in, and both sides of the extra appear: what the caterer will
    bill the agency, and what the couple is fairly charged for the extra
    plates.  No one has to remember to add it later.
    """
    wedding = check_wedding(user, db.get(Wedding, wedding_id))

    extra = payload.actual_guest_count - wedding.guest_count
    wedding.actual_guest_count = payload.actual_guest_count
    db.commit()

    if extra <= 0:
        return {
            "extra_guests": 0,
            "detail": "Headcount recorded. No additional plates to bill.",
            "change_order": None,
        }

    caterer = next(
        (c for c in wedding.contracts if c.category.lower() == "caterer"), None
    )

    vendor_rate = payload.vendor_rate_per_plate
    if vendor_rate is None and caterer and wedding.guest_count:
        vendor_rate = round(caterer.agreed_amount / wedding.guest_count, 2)
    vendor_rate = vendor_rate or 0.0

    # The agency's coordination margin on pass-through extras.
    client_rate = payload.client_rate_per_plate or round(vendor_rate * 1.18, 2)

    co = ChangeOrder(
        wedding_id=wedding.id,
        vendor_id=caterer.vendor_id if caterer else None,
        description=f"{extra} additional covers above contracted headcount "
        f"({wedding.guest_count} → {payload.actual_guest_count})",
        unit=UnitOfMeasure.PER_PLATE,
        quantity=extra,
        vendor_unit_cost=vendor_rate,
        client_unit_price=client_rate,
        approved=True,
    )
    db.add(co)
    db.commit()
    db.refresh(co)

    return {
        "extra_guests": extra,
        "change_order": _co(co),
        "detail": (
            f"{extra} extra covers recorded. Vendor cost INR {co.vendor_cost:,.0f}, "
            f"client billed INR {co.client_amount:,.0f}."
        ),
    }


# ---- Time logs ------------------------------------------------------------
time_router = APIRouter(prefix="/api/time-logs", tags=["5 · Settlement"])


@time_router.get("")
def list_time_logs(
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    q = scope_weddings(db.query(TimeLog).join(Wedding), user)
    if wedding_id:
        q = q.filter(TimeLog.wedding_id == wedding_id)
    return [
        {
            "id": t.id,
            "wedding_id": t.wedding_id,
            "staff": t.staff.name if t.staff else None,
            "hours": t.hours,
            "cost": round(t.hours * (t.staff.hourly_cost if t.staff else 0), 2),
            "log_date": t.log_date.isoformat(),
            "description": t.description,
        }
        for t in q.all()
    ]


@time_router.post("", status_code=201)
def create_time_log(
    payload: TimeLogCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    check_wedding(user, db.get(Wedding, payload.wedding_id))
    data = payload.model_dump()
    data["log_date"] = data.get("log_date") or date.today()
    log = TimeLog(**data)
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"id": log.id, "hours": log.hours}


# ---- P&L ------------------------------------------------------------------
pnl_router = APIRouter(prefix="/api/pnl", tags=["6 · Founder"])


@pnl_router.get("/{wedding_id}")
def get_pnl(wedding_id: int, db: Session = Depends(get_db)):
    wedding = db.get(Wedding, wedding_id)
    if not wedding:
        raise HTTPException(404, "Wedding not found")
    return wedding_pnl(db, wedding)
