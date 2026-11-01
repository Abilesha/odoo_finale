"""Scene 2 — vendors, RFQs, the comparison matrix and the award."""
from __future__ import annotations

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Quote,
    QuoteLine,
    QuoteRequest,
    QuoteStatus,
    RFQStatus,
    Staff,
    Vendor,
    VendorContract,
    Wedding,
)
from ..schemas import (
    AwardIn,
    ContractUpdate,
    QuoteCreate,
    RFQCreate,
    ShareIn,
    VendorIn,
    VendorPatch,
    VendorSignup,
)
from ..services.auth import (
    CAP_TEAM,
    check_wedding,
    current_user,
    create_vendor_token,
    hash_password,
    require,
    scope_weddings,
    vendor_payload,
)
from ..services.quotes import build_comparison, award_quote, mark_received, rank_quotes
from ..services.vendors import fit_for, vendor_card

#: How many quotes the couple is shown.  Three is what the brief describes
#: ("all three quotes side by side") and about as many as anyone can weigh.
SHORTLIST_SIZE = 3


def _rfq(db: Session, user: Staff, rfq_id: int) -> QuoteRequest:
    rfq = db.get(QuoteRequest, rfq_id)
    if not rfq:
        raise HTTPException(404, "RFQ not found")
    check_wedding(user, rfq.wedding)
    return rfq

router = APIRouter(prefix="/api/rfqs", tags=["2 · Quotes & Vendors"])
vendor_router = APIRouter(prefix="/api/vendors", tags=["2 · Quotes & Vendors"])
vendor_signup_router = APIRouter(prefix="/api/vendor-signup", tags=["2 · Quotes & Vendors"])


# ---- Vendors --------------------------------------------------------------
@vendor_signup_router.post("", status_code=201)
def signup_vendor(payload: VendorSignup, db: Session = Depends(get_db)):
    """Let a vendor add their own business and enter their portal directly."""
    if db.query(Vendor).filter(Vendor.email == payload.email).first():
        raise HTTPException(409, "An account already uses this business email — sign in instead")
    data = payload.model_dump()
    password = data.pop("password")
    data["service_cities"] = data["service_cities"] or data["city"]
    vendor = Vendor(
        **data,
        password_hash=hash_password(password),
        portal_active=True,
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return {
        "token": create_vendor_token(vendor),
        "user": vendor_payload(vendor),
        "detail": "Your business has been added. Complete your capacity profile to receive matching requests.",
    }


@vendor_router.get("")
def list_vendors(
    category: str | None = None,
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """The vendor network, by job type.

    With a wedding_id, every vendor also carries whether they can actually do
    that wedding — booked, blocked out, over capacity or out of area — so the
    manager invites people who can say yes.
    """
    wedding = check_wedding(user, db.get(Wedding, wedding_id)) if wedding_id else None
    q = db.query(Vendor)
    if category:
        q = q.filter(Vendor.category == category)
    out = []
    for v in q.order_by(Vendor.category, Vendor.name).all():
        card = vendor_card(v)
        if wedding:
            card["fit"] = fit_for(db, v, wedding)
        out.append(card)
    return out


@vendor_router.post("", status_code=201, dependencies=[Depends(require(CAP_TEAM))])
def create_vendor(payload: VendorIn, db: Session = Depends(get_db)):
    """Add a vendor to the network — optionally with a portal sign-in."""
    # blank optional fields fall back to the column defaults
    data = {k: v for k, v in payload.model_dump().items() if v not in (None, "")}
    password = data.pop("password", None)
    if data.get("email"):
        data["email"] = data["email"].strip().lower()
        if db.query(Vendor).filter(Vendor.email == data["email"]).first():
            raise HTTPException(409, "Another vendor already uses that email")
    if password and not data.get("email"):
        raise HTTPException(400, "A vendor needs an email to sign in with")
    vendor = Vendor(**data, password_hash=hash_password(password) if password else None)
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return {**vendor_card(vendor), "detail": f"{vendor.name} added to {vendor.category}."}


@vendor_router.patch("/{vendor_id}", dependencies=[Depends(require(CAP_TEAM))])
def update_vendor(vendor_id: int, payload: VendorPatch, db: Session = Depends(get_db)):
    """Edit a vendor, or give them (or take away) a portal sign-in."""
    vendor = db.get(Vendor, vendor_id)
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    if "email" in data and data["email"]:
        data["email"] = data["email"].strip().lower()
        clash = db.query(Vendor).filter(Vendor.email == data["email"], Vendor.id != vendor.id).first()
        if clash:
            raise HTTPException(409, "Another vendor already uses that email")
    for key, value in data.items():
        setattr(vendor, key, value)
    if password:
        if not vendor.email:
            raise HTTPException(400, "Add an email first — it is what they sign in with")
        vendor.password_hash = hash_password(password)
        vendor.portal_active = True
    db.commit()
    db.refresh(vendor)
    return {**vendor_card(vendor), "detail": f"{vendor.name} updated."}


@vendor_router.get("/categories")
def vendor_categories(db: Session = Depends(get_db)):
    rows = db.query(Vendor.category).distinct().all()
    return sorted(r[0] for r in rows)


# ---- RFQs -----------------------------------------------------------------
@router.get("")
def list_rfqs(
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    q = scope_weddings(db.query(QuoteRequest).join(Wedding), user)
    if wedding_id:
        q = q.filter(QuoteRequest.wedding_id == wedding_id)
    return [
        {
            "id": r.id,
            "wedding_id": r.wedding_id,
            "wedding_code": r.wedding.code if r.wedding else None,
            "couple_name": r.wedding.couple_name if r.wedding else None,
            "category": r.category,
            "title": r.title,
            "status": r.status.value,
            "guest_count": r.guest_count,
            "needed_by": r.needed_by.isoformat() if r.needed_by else None,
            "quote_count": len(r.quotes),
            "received_count": sum(
                1 for x in r.quotes if x.status != QuoteStatus.PENDING and not x.declined
            ),
            "declined_count": sum(1 for x in r.quotes if x.declined),
            "shared_with_couple": bool(r.choice_token),
            "awaiting_couple": r.awaiting_couple,
            "chosen_by_name": r.chosen_by_name,
        }
        for r in q.order_by(QuoteRequest.created_at.desc()).all()
    ]


@router.post("", status_code=201)
def create_rfq(
    payload: RFQCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Float one request to several vendors at once.  One RFQ, N quotes, one
    decision — instead of three separate WhatsApp threads.  Each invited
    vendor sees it in their portal straight away."""
    wedding = check_wedding(user, db.get(Wedding, payload.wedding_id))

    rfq = QuoteRequest(
        wedding_id=payload.wedding_id,
        category=payload.category,
        title=payload.title,
        scope=payload.scope,
        guest_count=payload.guest_count or wedding.guest_count,
        needed_by=payload.needed_by,
        status=RFQStatus.SENT if payload.vendor_ids else RFQStatus.DRAFT,
    )
    db.add(rfq)
    db.flush()

    for vendor_id in payload.vendor_ids:
        db.add(Quote(rfq_id=rfq.id, vendor_id=vendor_id, status=QuoteStatus.PENDING))

    db.commit()
    db.refresh(rfq)
    return {
        "id": rfq.id,
        "status": rfq.status.value,
        "invited": len(payload.vendor_ids),
        "detail": (
            f"Request sent to {len(payload.vendor_ids)} vendors — it is in each "
            f"of their portals now, ready to price."
        ),
    }


@router.get("/{rfq_id}/comparison")
def comparison(
    rfq_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    """The money screen: every quote side by side, line by line, with every
    vendor's price normalised to the same cost-per-plate — and ranked, so the
    top three are ready to send to the couple."""
    rfq = _rfq(db, user, rfq_id)
    data = build_comparison(db, rfq)
    ranked = rank_quotes(data)
    data["ranking"] = ranked
    data["suggested_shortlist"] = ranked[:SHORTLIST_SIZE]
    data["shortlist"] = rfq.shortlist_ids
    data["invited"] = [
        {
            "quote_id": q.id,
            "vendor_id": q.vendor_id,
            "vendor_name": q.vendor.name if q.vendor else "—",
            "status": "Declined" if q.declined else q.status.value,
            "note": q.notes if q.declined else None,
        }
        for q in rfq.quotes
    ]
    # who decided, and how — so the planner's screen shows the couple's pick
    # rather than looking as though the planner made it themselves
    data["choice"] = {
        "token": rfq.choice_token,
        "choose_url": f"/choose/{rfq.choice_token}" if rfq.choice_token else None,
        "shared_at": rfq.shared_at.isoformat() if rfq.shared_at else None,
        "awaiting_couple": rfq.awaiting_couple,
        "chosen_quote_id": rfq.chosen_quote_id,
        "chosen_at": rfq.chosen_at.isoformat() if rfq.chosen_at else None,
        "chosen_by_name": rfq.chosen_by_name,
        "couple_note": rfq.couple_note,
    }
    return data


@router.post("/{rfq_id}/quotes", status_code=201)
def submit_quote(
    rfq_id: int,
    payload: QuoteCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Key in a quote on a vendor's behalf — for the vendor who still sends a
    PDF.  Vendors with a portal account price it themselves; the shape of the
    data is the same either way."""
    rfq = _rfq(db, user, rfq_id)

    quote = (
        db.query(Quote)
        .filter(Quote.rfq_id == rfq_id, Quote.vendor_id == payload.vendor_id)
        .first()
    )
    if quote is None:
        quote = Quote(rfq_id=rfq_id, vendor_id=payload.vendor_id)
        db.add(quote)
        db.flush()

    for field in (
        "extra_hour_rate",
        "inclusions",
        "exclusions",
        "gst_percent",
        "logistics_fee",
        "validity_days",
        "notes",
    ):
        setattr(quote, field, getattr(payload, field))

    for old in list(quote.lines):
        db.delete(old)
    db.flush()

    for line in payload.lines:
        db.add(QuoteLine(quote_id=quote.id, **line.model_dump()))

    quote.declined = False
    quote.status = QuoteStatus.RECEIVED
    quote.received_at = datetime.utcnow()
    if rfq.status == RFQStatus.SENT:
        rfq.status = RFQStatus.COMPARING

    db.commit()
    db.refresh(quote)
    return {"quote_id": quote.id, "status": quote.status.value}


@router.post("/{rfq_id}/award")
def award(
    rfq_id: int,
    payload: AwardIn,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Pick the winner.

    The other requests close on their own and a vendor contract is created
    and linked to the wedding — which is the record every later bill is
    matched against.
    """
    rfq = _rfq(db, user, rfq_id)
    if rfq.status == RFQStatus.AWARDED:
        raise HTTPException(409, "This RFQ has already been awarded")

    try:
        contract = award_quote(db, rfq, payload.quote_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    if payload.advance_percent:
        contract.advance_paid = round(
            contract.agreed_amount * payload.advance_percent / 100.0, 2
        )
        contract.advance_paid_at = datetime.utcnow()
        db.commit()

    rejected = sum(1 for q in rfq.quotes if q.status == QuoteStatus.REJECTED)
    return {
        "contract_id": contract.id,
        "vendor": contract.vendor.name,
        "agreed_amount": contract.agreed_amount,
        "advance_paid": contract.advance_paid,
        "auto_rejected": rejected,
        "detail": (
            f"{contract.vendor.name} awarded at INR {contract.agreed_amount:,.0f}. "
            f"{rejected} other quote(s) closed automatically and the vendor is "
            f"now linked to {rfq.wedding.code}."
        ),
    }


# ---------------------------------------------------------------------------
# The couple's decision
#
# The brief: "The planner should see all three quotes side by side ... When
# the couple picks a winner, the other two requests should close on their own,
# and the chosen vendor should be linked straight to that wedding."
#
# So the planner shortlists and sends a link; the couple opens it on their
# phone — no account, same pattern as signing the agreement — and picks. Their
# pick runs the exact same award_quote() the planner's button runs, so the
# losers close and the contract is created either way.
# ---------------------------------------------------------------------------
class ShareChoiceIn(BaseModel):
    pass


class CoupleChoiceIn(BaseModel):
    quote_id: int
    chosen_by_name: str = Field(min_length=2, max_length=120)
    note: str | None = None


@router.post("/{rfq_id}/share")
def share_with_couple(
    rfq_id: int,
    payload: ShareIn | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Send the couple the top three and a private link to choose.

    With no quote_ids, the three best-value quotes go.  The manager can swap
    one out — but never send more than three, because a couple handed seven
    caterers does not decide, they ring the planner.
    """
    rfq = _rfq(db, user, rfq_id)
    if rfq.status == RFQStatus.AWARDED:
        raise HTTPException(409, "This RFQ has already been decided")

    received = {
        q.id for q in rfq.quotes if q.status != QuoteStatus.PENDING and not q.declined
    }
    if len(received) < 2:
        raise HTTPException(
            400,
            "Send this once at least two quotes are in — there is nothing to "
            "compare with one.",
        )

    picked = list(dict.fromkeys((payload.quote_ids if payload else []) or []))
    if picked:
        if len(picked) > SHORTLIST_SIZE:
            raise HTTPException(400, f"Pick at most {SHORTLIST_SIZE} quotes for the couple")
        stray = [i for i in picked if i not in received]
        if stray:
            raise HTTPException(400, "Only received quotes on this request can be shortlisted")
        if len(picked) < 2:
            raise HTTPException(400, "Give the couple at least two to choose between")
    else:
        picked = rank_quotes(build_comparison(db, rfq))[:SHORTLIST_SIZE]

    rfq.shortlist = ",".join(str(i) for i in picked)
    if not rfq.choice_token:
        rfq.choice_token = secrets.token_urlsafe(24)[:32]
    rfq.shared_at = datetime.utcnow()
    db.commit()

    names = [q.vendor.name for q in rfq.quotes if q.id in picked]
    return {
        "token": rfq.choice_token,
        "choose_url": f"/choose/{rfq.choice_token}",
        "quotes_shown": len(picked),
        "shortlist": picked,
        "detail": (
            f"Top {len(picked)} sent to {rfq.wedding.couple_name} — "
            f"{', '.join(names)} — and they pick from their phone."
        ),
    }


choice_router = APIRouter(prefix="/api/choose", tags=["2 · Quotes & Vendors"])


def _couple_card(card: dict) -> dict:
    """What the couple is allowed to see.

    Deliberately narrower than the planner's view: the couple sees the price
    they will pay, what is and is not included, and how reliable the vendor
    has been. They do not see the agency's internal value score or the
    recommendation — that is the planner's advice to give in person, not a
    label on a screen.
    """
    return {
        "quote_id": card["quote_id"],
        "vendor_name": card["vendor_name"],
        "vendor_rating": card["vendor_rating"],
        "vendor_on_time_pct": card["vendor_on_time_pct"],
        "landed_total": card["landed_total"],
        "cost_per_plate": card["cost_per_plate"],
        "extra_hour_rate": card["extra_hour_rate"],
        "inclusions": card["inclusions"],
        "exclusions": card["exclusions"],
        "lines": [
            {
                "key": ln["key"],
                "description": ln["description"],
                "line_total": ln["line_total"],
            }
            for ln in card["lines"]
        ],
    }


def _rows_for(full: dict) -> list[dict]:
    """Matrix rows recomputed over just the cards the couple can see."""
    labels: dict[str, str] = {}
    order: list[str] = []
    count: dict[str, int] = {}
    for card in full["quotes"]:
        for ln in card["lines"]:
            key = ln["key"]
            if key not in labels:
                order.append(key)
                labels[key] = ln["description"]
            elif len(ln["description"]) > len(labels[key]):
                labels[key] = ln["description"]
            count[key] = count.get(key, 0) + 1
    n = len(full["quotes"])
    return [
        {"key": k, "label": labels[k], "quoted_by": count[k], "partial": count[k] < n}
        for k in order
    ]


@choice_router.get("/{token}")
def view_choice(token: str, db: Session = Depends(get_db)):
    """The couple's comparison screen. Public — the link is the credential."""
    rfq = db.query(QuoteRequest).filter(QuoteRequest.choice_token == token).first()
    if not rfq:
        raise HTTPException(404, "This link is not valid")

    full = build_comparison(db, rfq)
    shortlist = rfq.shortlist_ids
    if shortlist:
        # the couple's three, in the order the manager ranked them
        by_id = {c["quote_id"]: c for c in full["quotes"]}
        full["quotes"] = [by_id[i] for i in shortlist if i in by_id]
    chosen = None
    if rfq.chosen_quote_id:
        chosen = next(
            (c for c in full["quotes"] if c["quote_id"] == rfq.chosen_quote_id), None
        )

    return {
        "couple_name": rfq.wedding.couple_name if rfq.wedding else "",
        "wedding_code": rfq.wedding.code if rfq.wedding else "",
        "title": rfq.title,
        "category": rfq.category,
        "scope": rfq.scope,
        "guest_count": full["guest_count"],
        "needed_by": rfq.needed_by.isoformat() if rfq.needed_by else None,
        "cards": [_couple_card(c) for c in full["quotes"]],
        "matrix_rows": _rows_for(full),
        "shortlisted": bool(shortlist),
        "decided": rfq.chosen_at is not None or rfq.status == RFQStatus.AWARDED,
        "chosen_quote_id": rfq.chosen_quote_id,
        "chosen_vendor": chosen["vendor_name"] if chosen else None,
        "chosen_at": rfq.chosen_at.isoformat() if rfq.chosen_at else None,
        "chosen_by_name": rfq.chosen_by_name,
        "couple_note": rfq.couple_note,
    }


@choice_router.post("/{token}")
def make_choice(token: str, payload: CoupleChoiceIn, db: Session = Depends(get_db)):
    """The couple picks. This is the same award the planner's button runs —
    the losing quotes close themselves and the winner is contracted to the
    wedding — so the agency never has to re-key the decision."""
    rfq = db.query(QuoteRequest).filter(QuoteRequest.choice_token == token).first()
    if not rfq:
        raise HTTPException(404, "This link is not valid")
    if rfq.chosen_at is not None or rfq.status == RFQStatus.AWARDED:
        raise HTTPException(409, "A vendor has already been chosen for this request")
    if rfq.shortlist_ids and payload.quote_id not in rfq.shortlist_ids:
        raise HTTPException(400, "Pick one of the quotes on your shortlist")

    try:
        contract = award_quote(db, rfq, payload.quote_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    rfq.chosen_quote_id = payload.quote_id
    rfq.chosen_at = datetime.utcnow()
    rfq.chosen_by_name = payload.chosen_by_name.strip()
    rfq.couple_note = (payload.note or "").strip() or None
    db.commit()

    closed = sum(1 for q in rfq.quotes if q.status == QuoteStatus.REJECTED)
    return {
        "ok": True,
        "vendor": contract.vendor.name,
        "agreed_amount": contract.agreed_amount,
        "auto_closed": closed,
        "detail": (
            f"{contract.vendor.name} is confirmed for your {rfq.category.lower()}. "
            f"The other {closed} quote(s) have been closed and your planner has "
            f"been notified."
        ),
    }


quote_router = APIRouter(prefix="/api/quotes", tags=["2 · Quotes & Vendors"])


@quote_router.post("/{quote_id}/received")
def set_received(
    quote_id: int, db: Session = Depends(get_db), user: Staff = Depends(current_user)
):
    quote = db.get(Quote, quote_id)
    if not quote:
        raise HTTPException(404, "Quote not found")
    check_wedding(user, quote.rfq.wedding)
    mark_received(db, quote)
    return {"ok": True, "status": quote.status.value}


contract_router = APIRouter(prefix="/api/contracts", tags=["2 · Quotes & Vendors"])


@contract_router.get("")
def list_contracts(
    wedding_id: int | None = None,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    q = scope_weddings(db.query(VendorContract).join(Wedding), user)
    if wedding_id:
        q = q.filter(VendorContract.wedding_id == wedding_id)
    return [
        {
            "id": c.id,
            "wedding_id": c.wedding_id,
            "wedding_code": c.wedding.code if c.wedding else None,
            "vendor_id": c.vendor_id,
            "vendor": c.vendor.name if c.vendor else None,
            "category": c.category,
            "agreed_amount": c.agreed_amount,
            "advance_paid": c.advance_paid,
            "balance": round(c.agreed_amount - c.advance_paid, 2),
            "bill_count": len(c.bills),
            "settled": any(b.paid_at for b in c.bills),
            "progress_pct": c.progress_pct,
            "work_status": c.work_status,
        }
        for c in q.all()
    ]


@contract_router.patch("/{contract_id}")
def update_contract(
    contract_id: int,
    payload: ContractUpdate,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Correct the agreed figure or the advance — the numbers every bill is
    matched against, so getting them right matters."""
    c = db.get(VendorContract, contract_id)
    if not c:
        raise HTTPException(404, "Contract not found")
    check_wedding(user, c.wedding)
    data = payload.model_dump(exclude_unset=True)
    if "advance_paid" in data and data["advance_paid"] and not c.advance_paid_at:
        c.advance_paid_at = datetime.utcnow()
    for key, value in data.items():
        setattr(c, key, value)
    if c.advance_paid > c.agreed_amount:
        raise HTTPException(400, "The advance cannot be more than the agreed amount")
    db.commit()
    return {"ok": True, "detail": f"{c.vendor.name}'s contract updated."}
