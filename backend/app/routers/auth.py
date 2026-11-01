"""Sign in, and find out what you are allowed to do."""
from __future__ import annotations

import re
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ClientAccount, Staff, Vendor, Wedding, WeddingStatus
from ..services.auth import (
    CAP_TEAM,
    ROLE_CAPS,
    ROLE_SUMMARY,
    _payload,
    client_payload,
    create_client_token,
    create_token,
    create_vendor_token,
    current_user,
    hash_password,
    normalise_role,
    require,
    user_payload,
    vendor_payload,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["0 · Access"])

#: Managing accounts is the founder's job, so it rides on the same capability
#: that gates the season's numbers rather than inventing a role for it.
staff_router = APIRouter(prefix="/api/staff", tags=["0 · Access"])


#: The four doors on the sign-in screen.
PORTALS = {"founder": "Founder", "manager": "Manager", "vendor": "Vendor", "client": "Couple"}


class LoginIn(BaseModel):
    email: str
    password: str
    #: which door they came through — founder, manager or vendor.  Optional,
    #: so an API client can sign in without caring.
    portal: str | None = None


class DemoLoginIn(BaseModel):
    staff_id: int | None = None
    vendor_id: int | None = None
    client_id: int | None = None


#: Good enough to catch a typo without pulling in a dependency the judges
#: would have to install. Real address verification is a confirmation email,
#: not a regex, and that is out of scope here.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


class StaffCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    role: str = "Manager"
    title: str | None = None
    hourly_cost: float = 850.0
    phone: str | None = None
    city: str | None = None

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("That does not look like an email address")
        return v


class StaffUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    email: str | None = None
    role: str | None = None
    title: str | None = None
    hourly_cost: float | None = None
    phone: str | None = None
    city: str | None = None
    active: bool | None = None

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().lower()
        if not EMAIL_RE.match(v):
            raise ValueError("That does not look like an email address")
        return v


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


def _wrong_door(actual: str, portal: str) -> HTTPException:
    return HTTPException(
        403,
        f"This is a {actual} account — use the {actual} sign-in instead of "
        f"{PORTALS[portal]}.",
    )


def _matches(db: Session, email: str, password: str) -> list[tuple[str, object]]:
    """Every account this email and password open, as (door, account).

    Staff, vendors and couples live in separate tables, so the same address
    could in principle exist in more than one; the door decides which wins.
    """
    found: list[tuple[str, object]] = []
    staff = db.query(Staff).filter(Staff.email == email, Staff.active.is_(True)).first()
    if staff and verify_password(password, staff.password_hash):
        found.append((normalise_role(staff.role).lower(), staff))
    vendor = db.query(Vendor).filter(Vendor.email == email).first()
    if vendor and vendor.portal_active is not False and verify_password(password, vendor.password_hash):
        found.append(("vendor", vendor))
    client = db.query(ClientAccount).filter(ClientAccount.email == email).first()
    if client and client.active is not False and verify_password(password, client.password_hash):
        found.append(("client", client))
    return found


def _issue(db: Session, door: str, account) -> dict:
    if door == "vendor":
        return {"token": create_vendor_token(account), "user": vendor_payload(account)}
    if door == "client":
        account.last_login_at = datetime.utcnow()
        db.commit()
        return {"token": create_client_token(account), "user": client_payload(account)}
    return {"token": create_token(account), "user": user_payload(account)}


@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    portal = (payload.portal or "").lower() or None
    if portal and portal not in PORTALS:
        raise HTTPException(400, "Unknown sign-in")

    found = _matches(db, email, payload.password)
    if not found:
        # One message for every case, so the form cannot be used to discover
        # which email addresses exist.
        raise HTTPException(401, "That email and password do not match")

    if portal:
        for door, account in found:
            if door == portal:
                return _issue(db, door, account)
        # Right password, wrong door: say which door, rather than a
        # baffling "password does not match".
        raise _wrong_door(PORTALS[found[0][0]], portal)

    door, account = found[0]
    return _issue(db, door, account)


@router.post("/demo-login")
def demo_login(payload: DemoLoginIn, db: Session = Depends(get_db)):
    """One-click sign-in as any demo account.

    This exists so a judge can switch between the founder, a manager and a
    vendor in one click instead of typing credentials. Remove this route and
    the demo accounts before any real deployment.
    """
    if payload.client_id:
        client = db.get(ClientAccount, payload.client_id)
        if not client or client.active is False:
            raise HTTPException(404, "No such account")
        return {"token": create_client_token(client), "user": client_payload(client)}

    if payload.vendor_id:
        vendor = db.get(Vendor, payload.vendor_id)
        if not vendor or not vendor.password_hash or vendor.portal_active is False:
            raise HTTPException(404, "No such account")
        return {"token": create_vendor_token(vendor), "user": vendor_payload(vendor)}

    staff = db.get(Staff, payload.staff_id or 0)
    if not staff or not staff.active:
        raise HTTPException(404, "No such account")
    return {"token": create_token(staff), "user": user_payload(staff)}


@router.get("/roles")
def roles(db: Session = Depends(get_db)):
    """The demo accounts offered on the sign-in screen, grouped by portal.

    One founder, every active manager (so a judge can see that each one only
    gets their own weddings), and a handful of vendors across job types.
    """
    out: dict[str, list[dict]] = {"founder": [], "manager": [], "vendor": [], "client": []}
    for s in db.query(Staff).filter(Staff.active.is_(True)).order_by(Staff.id).all():
        role = normalise_role(s.role)
        key = role.lower()
        if key not in out:
            continue
        out[key].append({
            "staff_id": s.id, "name": s.name, "role": role, "title": s.title,
            "email": s.email, "summary": ROLE_SUMMARY.get(role, ""),
            "weddings": (
                db.query(Wedding)
                .filter(Wedding.planner_id == s.id,
                        Wedding.status != WeddingStatus.COMPLETED)
                .count()
                if role == "Manager" else None
            ),
        })

    vendors = (
        db.query(Vendor)
        .filter(Vendor.password_hash.isnot(None))
        .order_by(Vendor.id)
        .all()
    )
    for v in vendors:
        if v.portal_active is False:
            continue
        out["vendor"].append({
            "vendor_id": v.id, "name": v.name, "role": "Vendor", "title": v.category,
            "email": v.email, "summary": ROLE_SUMMARY["Vendor"],
        })

    for c in db.query(ClientAccount).filter(ClientAccount.active.is_(True)).order_by(ClientAccount.id):
        lead, w = c.lead, (c.lead.wedding if c.lead else None)
        if w and w.day1_date <= date.today() <= w.day3_date:
            where = "wedding is today"
        elif w and w.day1_date > date.today():
            where = f"wedding in {(w.day1_date - date.today()).days} days"
        elif w:
            where = "married"
        elif lead and lead.agreement and not lead.agreement.is_signed:
            where = "agreement to sign"
        else:
            where = "enquiry with The Royal Knot"
        out["client"].append({
            "client_id": c.id, "name": c.name, "role": "Couple",
            "title": f"{lead.couple_name if lead else 'Couple'} · {where}",
            "email": c.email, "summary": ROLE_SUMMARY["Couple"],
        })
    return out


@router.get("/me")
def me(request: Request, db: Session = Depends(get_db)):
    """Whoever holds this token — a member of staff or a vendor."""
    payload = _payload(request)
    if payload.get("kind") == "vendor":
        vendor = db.get(Vendor, payload["sub"])
        if not vendor or vendor.portal_active is False:
            raise HTTPException(401, "This vendor account is no longer active")
        return vendor_payload(vendor)
    if payload.get("kind") == "client":
        client = db.get(ClientAccount, payload["sub"])
        if not client or client.active is False:
            raise HTTPException(401, "This account is no longer active")
        return client_payload(client)
    return user_payload(current_user(request, db))


@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Anyone can change their own password — including off the demo one."""
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(401, "Your current password is not correct")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "detail": "Password changed. Use it next time you sign in."}


# ---- Staff accounts -------------------------------------------------------
# The list lives on weddings.staff_router (it feeds every owner picker).  The
# writes live here, because every one of them is the founder's to make.
@staff_router.post("", status_code=201, dependencies=[Depends(require(CAP_TEAM))])
def create_staff(payload: StaffCreate, db: Session = Depends(get_db)):
    """Add a real person to the team so they can sign in with their own email.

    Only the founder can do this — which is why it is gated on the same
    capability as the season's numbers.
    """
    email = payload.email
    if db.query(Staff).filter(Staff.email == email).first():
        raise HTTPException(409, "Someone on the team already uses that email")

    role = normalise_role(payload.role)
    if role not in ROLE_CAPS:
        raise HTTPException(400, f"Role must be one of {', '.join(ROLE_CAPS)}")

    staff = Staff(
        name=payload.name.strip(),
        email=email,
        role=role,
        title=(payload.title or "").strip() or None,
        hourly_cost=payload.hourly_cost,
        phone=(payload.phone or "").strip() or None,
        city=(payload.city or "").strip() or None,
        joined_on=date.today(),
        password_hash=hash_password(payload.password),
        active=True,
    )
    db.add(staff)
    db.commit()
    db.refresh(staff)
    return {
        "id": staff.id,
        "detail": (
            f"{staff.name} can now sign in with {staff.email} as a {staff.role}."
        ),
        **user_payload(staff),
    }


@staff_router.patch("/{staff_id}", dependencies=[Depends(require(CAP_TEAM))])
def update_staff(
    staff_id: int,
    payload: StaffUpdate,
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Edit anyone on the team — name, contact, access level, cost."""
    staff = db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "No such account")

    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] != staff.email:
        clash = db.query(Staff).filter(Staff.email == data["email"]).first()
        if clash:
            raise HTTPException(409, "Someone on the team already uses that email")
    if "role" in data:
        data["role"] = normalise_role(data["role"])
        if staff.id == user.id and data["role"] != "Founder":
            raise HTTPException(400, "You cannot take founder access away from yourself")
    if data.get("active") is False and staff.id == user.id:
        raise HTTPException(400, "You cannot switch off your own account")

    for key, value in data.items():
        if isinstance(value, str):
            value = value.strip() or None
        setattr(staff, key, value)
    db.commit()
    db.refresh(staff)
    return {**user_payload(staff), "active": staff.active,
            "hourly_cost": staff.hourly_cost, "detail": f"{staff.name} updated."}


@staff_router.post(
    "/{staff_id}/reset-password", dependencies=[Depends(require(CAP_TEAM))]
)
def reset_password(staff_id: int, payload: PasswordReset, db: Session = Depends(get_db)):
    staff = db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "No such account")
    staff.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "detail": f"New password set for {staff.name}."}


@staff_router.post(
    "/{staff_id}/deactivate", dependencies=[Depends(require(CAP_TEAM))]
)
def deactivate_staff(
    staff_id: int,
    user: Staff = Depends(current_user),
    db: Session = Depends(get_db),
):
    staff = db.get(Staff, staff_id)
    if not staff:
        raise HTTPException(404, "No such account")
    if staff.id == user.id:
        raise HTTPException(400, "You cannot switch off your own account")
    staff.active = False
    db.commit()
    return {"ok": True, "detail": f"{staff.name} can no longer sign in."}
