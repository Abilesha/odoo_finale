"""Scene 1 — the first consultation.

Capture the enquiry the moment it arrives, book the meeting, send the service
agreement, let the couple sign it on their phone, keep the signed copy on the
record for ever.
"""
from __future__ import annotations

import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    Agreement,
    ClientAccount,
    Lead,
    LeadStage,
    PackageType,
    Staff,
    Wedding,
    WeddingStatus,
)
from ..schemas import (
    AgreementCreate,
    AgreementSign,
    ClientAccountIn,
    ConvertLead,
    LeadCreate,
    LeadUpdate,
)
from ..services.auth import current_user, hash_password, normalise_role, sees_all_weddings
from ..services.planning import generate_plan

router = APIRouter(prefix="/api/leads", tags=["1 · Enquiries"])

AGREEMENT_TEMPLATE = """SERVICE AGREEMENT — THE ROYAL KNOT WEDDING PLANNERS

This agreement is made between The Royal Knot ("the Planner") and
{couple} ("the Client") for wedding planning services.

1. SCOPE OF SERVICE
   Package: {package}
   Event dates: three consecutive days commencing {event_date}
   Expected guest count: {guests}
   Theme direction: {theme}

2. PROFESSIONAL FEE
   Total fee: INR {fee:,.0f} (inclusive of planning, coordination and
   on-site execution; vendor costs are billed at actuals).

3. PAYMENT SCHEDULE
   a) Booking payment      25% on signature of this agreement
   b) Advance payment      50% thirty days before the first event day
   c) Final payment        25% within seven days of the last event day

4. VENDOR ENGAGEMENT
   The Planner will obtain a minimum of three competitive quotations for
   every major vendor category and will present them to the Client for
   selection. Vendor advances are released only against a signed contract.

5. CHANGES ON THE DAY
   Additional guests, extended service hours or added scope will be
   recorded as a change order and billed at the rates set out in the
   relevant vendor contract plus the Planner's standard coordination
   margin.

6. CANCELLATION
   The booking payment is non-refundable. Cancellation within 60 days of
   the first event day attracts charges equal to vendor commitments
   already made.

By signing below, the Client confirms they have read and accepted these
terms."""


def _lead_dict(lead: Lead) -> dict:
    ag = lead.agreement
    return {
        "id": lead.id,
        "couple_name": lead.couple_name,
        "partner_a": lead.partner_a,
        "partner_b": lead.partner_b,
        "phone": lead.phone,
        "email": lead.email,
        "rough_date": lead.rough_date.isoformat() if lead.rough_date else None,
        "guest_count": lead.guest_count,
        "theme": lead.theme,
        "max_budget": lead.max_budget,
        "preferred_city": lead.preferred_city,
        "package_interest": lead.package_interest.value,
        "source": lead.source.value,
        "stage": lead.stage.value,
        "owner": lead.owner.name if lead.owner else None,
        "owner_id": lead.owner_id,
        "notes": lead.notes,
        "created_at": lead.created_at.isoformat(),
        "meeting_at": lead.meeting_at.isoformat() if lead.meeting_at else None,
        "agreement": None
        if ag is None
        else {
            "id": ag.id,
            "token": ag.token,
            "sent_at": ag.sent_at.isoformat(),
            "signed": ag.is_signed,
            "signed_at": ag.signed_at.isoformat() if ag.signed_at else None,
            "signer_name": ag.signer_name,
            "quoted_fee": ag.quoted_fee,
            "sign_url": f"/sign/{ag.token}",
        },
        "wedding_id": lead.wedding.id if lead.wedding else None,
        "wedding_code": lead.wedding.code if lead.wedding else None,
        "events_wanted": lead.events_wanted,
        "services_wanted": lead.services_wanted,
        "client_account": (
            {"email": lead.client_account.email, "name": lead.client_account.name,
             "last_login_at": lead.client_account.last_login_at.isoformat()
             if lead.client_account.last_login_at else None}
            if lead.client_account else None
        ),
    }


def _lead_for_user(db: Session, user: Staff, lead_id: int) -> Lead:
    """Return a lead only when it belongs to the signed-in planner.

    Founders retain the season-wide view; a manager's pipeline is deliberately
    limited to the couples assigned to them.  Returning 404 avoids disclosing
    another couple's details.
    """
    lead = db.get(Lead, lead_id)
    if not lead or (not sees_all_weddings(user) and lead.owner_id != user.id):
        raise HTTPException(404, "Lead not found")
    return lead


def _require_active_manager(db: Session, staff_id: int | None) -> None:
    """A lead owner is a working manager, never an arbitrary staff record."""
    if staff_id is None:
        return
    person = db.get(Staff, staff_id)
    if not person or not person.active or normalise_role(person.role) != "Manager":
        raise HTTPException(422, "Choose an active wedding manager for this couple")


def _least_loaded_manager(db: Session) -> Staff | None:
    """Suggest the available owner for a founder-captured enquiry.

    Open enquiries are counted alongside active weddings so a new couple is
    not handed to the manager who happens to have fewer weddings but a full
    calls pipeline.
    """
    managers = [
        person for person in db.query(Staff).filter(Staff.active.is_(True)).all()
        if normalise_role(person.role) == "Manager"
    ]
    if not managers:
        return None

    def load(person: Staff) -> tuple[int, int, int]:
        open_leads = db.query(Lead).filter(
            Lead.owner_id == person.id,
            Lead.stage.notin_([LeadStage.WON, LeadStage.LOST]),
        ).count()
        active_weddings = db.query(Wedding).filter(
            Wedding.planner_id == person.id,
            Wedding.status.in_([WeddingStatus.PLANNING, WeddingStatus.EXECUTION]),
        ).count()
        return (open_leads + active_weddings, active_weddings, person.id)

    return min(managers, key=load)


@router.get("")
def list_leads(
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    """The pipeline.  Nothing here can be 'forgotten' — every enquiry has a
    stage and an owner from the second it is created."""
    query = db.query(Lead)
    if not sees_all_weddings(user):
        query = query.filter(Lead.owner_id == user.id)
    leads = query.order_by(Lead.created_at.desc()).all()
    rows = [_lead_dict(x) for x in leads]
    by_stage: dict[str, list[dict]] = {s.value: [] for s in LeadStage}
    for row in rows:
        by_stage[row["stage"]].append(row)
    return {
        "count": len(rows),
        "leads": rows,
        "by_stage": by_stage,
        "pipeline_value": round(sum(x["max_budget"] for x in rows), 2),
    }


@router.post("", status_code=201)
def create_lead(
    payload: LeadCreate,
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Capture the enquiry the moment it arrives.

    If no owner is named, whoever took the call owns it. An enquiry with no
    owner is exactly the one that gets forgotten, which is the problem this
    screen exists to solve — so there is no way to create one.
    """
    data = payload.model_dump()
    if not data.get("owner_id"):
        suggested = _least_loaded_manager(db) if sees_all_weddings(user) else None
        data["owner_id"] = suggested.id if suggested else user.id
    elif sees_all_weddings(user):
        _require_active_manager(db, data["owner_id"])
    elif data["owner_id"] != user.id:
        raise HTTPException(403, "A manager can only capture enquiries for themselves")
    lead = Lead(**data)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return _lead_dict(lead)


@router.get("/{lead_id}")
def get_lead(lead_id: int, user: Staff = Depends(current_user), db: Session = Depends(get_db)):
    lead = _lead_for_user(db, user, lead_id)
    return _lead_dict(lead)


@router.patch("/{lead_id}")
def update_lead(
    lead_id: int,
    payload: LeadUpdate,
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    lead = _lead_for_user(db, user, lead_id)
    changes = payload.model_dump(exclude_unset=True)
    if "owner_id" in changes and not sees_all_weddings(user):
        raise HTTPException(403, "Only a founder can reassign a couple")
    if "owner_id" in changes:
        _require_active_manager(db, changes["owner_id"])
    for key, value in changes.items():
        setattr(lead, key, value)
    db.commit()
    db.refresh(lead)
    return _lead_dict(lead)


# ---- The couple's portal login ---------------------------------------------
@router.post("/{lead_id}/client-account", status_code=201)
def give_portal_login(
    lead_id: int,
    payload: ClientAccountIn,
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    """For a couple who called or walked in rather than enquiring online:
    their planner gives them a login, and from then on they follow their
    wedding — and sign their agreement — from their own portal."""
    lead = _lead_for_user(db, user, lead_id)
    if lead.client_account:
        raise HTTPException(409, f"{lead.couple_name} already sign in as {lead.client_account.email}")
    email = payload.email
    if db.query(ClientAccount).filter(ClientAccount.email == email).first():
        raise HTTPException(409, "Another couple already uses that email")
    acct = ClientAccount(
        lead_id=lead.id,
        name=(payload.name or lead.couple_name).strip(),
        email=email,
        phone=lead.phone,
        password_hash=hash_password(payload.password),
    )
    db.add(acct)
    if not lead.email:
        lead.email = email
    db.commit()
    return {
        "ok": True,
        "detail": f"{lead.couple_name} can now sign in at the Couple door with {email}.",
    }


# ---- Agreement ------------------------------------------------------------
@router.post("/{lead_id}/agreement", status_code=201)
def send_agreement(
    lead_id: int,
    payload: AgreementCreate,
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Generate the agreement and a one-time signing link for the couple's
    phone.  In production the link goes out over SMS/WhatsApp; here it is
    returned so the demo can open it on a second device."""
    lead = _lead_for_user(db, user, lead_id)
    if lead.agreement and lead.agreement.is_signed:
        raise HTTPException(409, "This lead already has a signed agreement")

    body = payload.body or AGREEMENT_TEMPLATE.format(
        couple=lead.couple_name,
        package=payload.package_type.value,
        event_date=lead.rough_date.strftime("%d %B %Y") if lead.rough_date else "TBC",
        guests=lead.guest_count,
        theme=lead.theme or "To be finalised",
        fee=payload.quoted_fee,
    )

    if lead.agreement:
        db.delete(lead.agreement)
        db.flush()

    agreement = Agreement(
        lead_id=lead.id,
        token=secrets.token_urlsafe(24),
        body=body,
        package_type=payload.package_type,
        quoted_fee=payload.quoted_fee,
    )
    db.add(agreement)
    lead.stage = LeadStage.AGREEMENT_SENT
    db.commit()
    db.refresh(agreement)

    return {
        "agreement_id": agreement.id,
        "token": agreement.token,
        "sign_url": f"/sign/{agreement.token}",
        "detail": "Agreement sent. The couple can sign it on their phone.",
    }


# Public endpoints — the couple is not logged in.
public_router = APIRouter(prefix="/api/sign", tags=["1 · Enquiries"])


@public_router.get("/{token}")
def view_agreement(token: str, db: Session = Depends(get_db)):
    agreement = db.query(Agreement).filter(Agreement.token == token).first()
    if not agreement:
        raise HTTPException(404, "This signing link is not valid")
    return {
        "couple_name": agreement.lead.couple_name,
        "body": agreement.body,
        "package_type": agreement.package_type.value,
        "quoted_fee": agreement.quoted_fee,
        "sent_at": agreement.sent_at.isoformat(),
        "signed": agreement.is_signed,
        "signed_at": agreement.signed_at.isoformat() if agreement.signed_at else None,
        "signer_name": agreement.signer_name,
        "signature_png": agreement.signature_png,
    }


@public_router.post("/{token}")
def sign_agreement(
    token: str,
    payload: AgreementSign,
    request: Request,
    db: Session = Depends(get_db),
):
    """Capture the signature drawn on the phone, with an audit trail."""
    agreement = db.query(Agreement).filter(Agreement.token == token).first()
    if not agreement:
        raise HTTPException(404, "This signing link is not valid")
    return record_signature(db, agreement, payload, request)


def record_signature(db: Session, agreement: Agreement, payload: AgreementSign,
                     request: Request) -> dict:
    """The one place a signature is recorded — from the phone link or from
    inside the couple's portal — so the audit trail is the same either way."""
    if agreement.is_signed:
        raise HTTPException(409, "This agreement has already been signed")

    agreement.signer_name = payload.signer_name
    agreement.signature_png = payload.signature_png
    agreement.signed_at = datetime.utcnow()
    agreement.signer_ip = request.client.host if request.client else None
    agreement.lead.stage = LeadStage.SIGNED
    db.commit()

    return {
        "ok": True,
        "detail": "Signed. A copy is now attached to your file with The Royal Knot.",
        "signed_at": agreement.signed_at.isoformat(),
    }


# ---- Conversion -----------------------------------------------------------
@router.post("/{lead_id}/convert", status_code=201)
def convert_to_wedding(
    lead_id: int,
    payload: ConvertLead,
    db: Session = Depends(get_db),
    user: Staff = Depends(current_user),
):
    """Scene 3 trigger.  The couple confirms and pays the booking deposit, and
    a complete wedding file exists immediately: 3-day dates, 35 tasks with
    owners and stages, and the three staged payments."""
    lead = _lead_for_user(db, user, lead_id)
    if lead.wedding:
        raise HTTPException(409, f"Already converted to {lead.wedding.code}")
    if not (lead.agreement and lead.agreement.is_signed):
        raise HTTPException(
            400,
            "The service agreement must be signed before the wedding file is opened.",
        )

    day1 = payload.day1_date or lead.rough_date or (date.today() + timedelta(days=180))
    package = payload.package_type or lead.package_interest

    seq = db.query(Wedding).count() + 1
    wedding = Wedding(
        code=f"RK-{day1.year}-{seq:03d}",
        lead_id=lead.id,
        couple_name=lead.couple_name,
        package_type=package,
        status=WeddingStatus.PLANNING,
        city=lead.preferred_city,
        venue=payload.venue,
        theme=lead.theme,
        day1_date=day1,
        day2_date=day1 + timedelta(days=1),
        day3_date=day1 + timedelta(days=2),
        guest_count=lead.guest_count,
        package_value=payload.package_value,
        budget_cap=lead.max_budget,
        # the founder can hand it to anyone; a manager who converts the
        # enquiry runs the wedding themselves
        planner_id=(
            (payload.planner_id or lead.owner_id)
            if sees_all_weddings(user) else user.id
        ),
        assigned_at=datetime.utcnow(),
    )
    db.add(wedding)
    lead.stage = LeadStage.WON
    db.commit()
    db.refresh(wedding)

    plan = generate_plan(db, wedding)

    return {
        "wedding_id": wedding.id,
        "code": wedding.code,
        "detail": (
            f"{wedding.code} opened. {plan['created_tasks']} tasks and "
            f"{plan['created_milestones']} payment milestones generated automatically."
        ),
        **plan,
    }
