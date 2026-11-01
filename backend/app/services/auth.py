"""Who is signed in, and what they are allowed to do.

The brief never says "add a login", but it describes four different people
doing four different jobs — a founder asking which weddings made money, a
planner comparing quotes, a coordinator checking vendors in at the venue, and
a couple signing an agreement on their phone.  "Planners at the venue should
know who is responsible for what" only means something if the system knows
who is who.

So: staff sign in and see the part of the system their role needs.  The couple
signs their agreement on a public link with no account at all, because asking
a client to register before they can sign would be absurd.

Tokens are HMAC-signed with the standard library — no extra dependency, and
nothing secret travels in the token itself.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ClientAccount, Staff, Vendor, Wedding

# SECRET_KEY is the preferred deployment name.  Keep JWT_SECRET as a
# backwards-compatible alias for existing local installations.
SECRET = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET", "royal-knot-dev-secret-change-in-production")
TOKEN_TTL = 60 * 60 * 12  # 12 hours — a long wedding day


# --------------------------------------------------------------------------
# Capabilities
# --------------------------------------------------------------------------
# Capabilities rather than bare role checks, so a new role is one line here
# instead of a hunt through every router.
CAP_SEASON = "view_season"      # the founder's P&L across the season
CAP_LEADS = "manage_leads"      # enquiries, agreements, conversion
CAP_WEDDINGS = "manage_weddings"  # the wedding file and its plan
CAP_VENDORS = "manage_vendors"  # RFQs, quote comparison, awarding
CAP_RUNDAY = "run_day"          # the live run sheet and check-ins
CAP_MONEY = "manage_money"      # vendor bills, settlement, change orders
CAP_SHARE = "share_numbers"     # publish a read-only season report
CAP_TEAM = "manage_team"        # add/edit staff and vendors, assign weddings
CAP_ALL_WEDDINGS = "all_weddings"  # see every wedding, not only your own

# Three kinds of people sign in, each to their own control panel:
#
#   Founder  runs the agency — every wedding, assigns each one to a manager,
#            watches each manager's progress, edits anything, sees the profit.
#   Manager  runs the weddings the founder assigned them — the plan, the
#            client's agreement and payments, vendor quotes and the big day.
#            Never sees what the agency earns, never sees other managers'
#            weddings.
#   Vendor   a separate account kind entirely (see VENDOR below) — prices the
#            requests they are sent, keeps their calendar, reports progress.
ROLE_CAPS: dict[str, set[str]] = {
    "Founder": {
        CAP_SEASON, CAP_LEADS, CAP_WEDDINGS, CAP_VENDORS,
        CAP_RUNDAY, CAP_MONEY, CAP_SHARE, CAP_TEAM, CAP_ALL_WEDDINGS,
    },
    "Manager": {CAP_LEADS, CAP_WEDDINGS, CAP_VENDORS, CAP_RUNDAY, CAP_MONEY},
}

ROLE_SUMMARY: dict[str, str] = {
    "Founder": "Every wedding, every manager, every number — assign, monitor and edit",
    "Manager": "Your assigned weddings — plan, agreements, vendors, payments and the big day",
    "Vendor": "Price requests, keep your calendar, report progress and track your earnings",
    "Couple": "Your wedding as it comes together — timeline, payments, vendors, the day's schedule and your agreement",
}


#: Older role names.  An account still carrying one signs in as a Manager
#: rather than into an empty app — never as a Founder.
LEGACY_ROLES = {
    "Planner": "Manager",
    "Lead Planner": "Manager",
    "Coordinator": "Manager",
    "Designer": "Manager",
    "Finance": "Manager",
}


def normalise_role(role: str | None) -> str:
    if role in ROLE_CAPS:
        return role
    return LEGACY_ROLES.get(role, "Manager")


def caps_for(role: str) -> set[str]:
    """Capabilities for a role.

    An unrecognised role falls back to Manager, never to Founder: a stale
    value should cost someone access, never grant it.
    """
    return ROLE_CAPS.get(normalise_role(role), set())


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------
def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored)


# --------------------------------------------------------------------------
# Tokens
# --------------------------------------------------------------------------
def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def create_token(staff: Staff) -> str:
    payload = {
        "sub": staff.id, "kind": "staff", "role": staff.role,
        "exp": int(time.time()) + TOKEN_TTL,
    }
    return _sign(payload)


def create_vendor_token(vendor: Vendor) -> str:
    payload = {"sub": vendor.id, "kind": "vendor", "exp": int(time.time()) + TOKEN_TTL}
    return _sign(payload)


def create_client_token(client: ClientAccount) -> str:
    payload = {"sub": client.id, "kind": "client", "exp": int(time.time()) + TOKEN_TTL}
    return _sign(payload)


def _sign(payload: dict) -> str:
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def decode_token(token: str) -> dict | None:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        return None

    expected = _b64(hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None

    try:
        payload = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None

    if payload.get("exp", 0) < time.time():
        return None
    return payload


# --------------------------------------------------------------------------
# FastAPI dependencies
# --------------------------------------------------------------------------
def _payload(request: Request) -> dict:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, "Sign in to continue")
    payload = decode_token(header[7:])
    if not payload:
        raise HTTPException(401, "Your session has expired — please sign in again")
    return payload


def current_user(request: Request, db: Session = Depends(get_db)) -> Staff:
    payload = _payload(request)
    # Staff and vendors live in different tables, so their ids overlap.  A
    # vendor token must never resolve to the staff member who happens to
    # share its number — that would hand a caterer the founder's P&L.
    if payload.get("kind", "staff") != "staff":
        raise HTTPException(403, "This part of the system is for agency staff")

    staff = db.get(Staff, payload["sub"])
    if not staff or not staff.active:
        raise HTTPException(401, "This account is no longer active")
    return staff


def current_vendor(request: Request, db: Session = Depends(get_db)) -> Vendor:
    payload = _payload(request)
    if payload.get("kind") != "vendor":
        raise HTTPException(403, "This is the vendor portal — sign in with a vendor account")
    vendor = db.get(Vendor, payload["sub"])
    if not vendor or vendor.portal_active is False:
        raise HTTPException(401, "This vendor account is no longer active")
    return vendor


def current_client(request: Request, db: Session = Depends(get_db)) -> ClientAccount:
    payload = _payload(request)
    if payload.get("kind") != "client":
        raise HTTPException(403, "This is the couple's portal — sign in with your couple account")
    client = db.get(ClientAccount, payload["sub"])
    if not client or client.active is False:
        raise HTTPException(401, "This account is no longer active")
    return client


def require(capability: str):
    """Guard a route with a capability.

    The message names the role, because "403 Forbidden" tells a coordinator
    nothing about why the founder's P&L is not theirs to open.
    """

    def guard(user: Staff = Depends(current_user)) -> Staff:
        if capability not in caps_for(user.role):
            raise HTTPException(
                403,
                f"A {user.role} does not have access to this. "
                f"Ask the founder if you need it.",
            )
        return user

    return guard


def user_payload(staff: Staff) -> dict:
    role = normalise_role(staff.role)
    return {
        "kind": "staff",
        "id": staff.id,
        "name": staff.name,
        "role": role,                # access level
        "title": staff.title,        # what they actually do
        "email": staff.email,
        "phone": staff.phone,
        "city": staff.city,
        "avatar": staff.avatar,
        "capabilities": sorted(caps_for(role)),
        "summary": ROLE_SUMMARY.get(role, ""),
    }


def vendor_payload(vendor: Vendor) -> dict:
    return {
        "kind": "vendor",
        "id": vendor.id,
        "name": vendor.name,
        "role": "Vendor",
        "title": vendor.category,
        "category": vendor.category,
        "email": vendor.email,
        "contact_person": vendor.contact_person,
        "city": vendor.city,
        "phone": vendor.phone,
        "avatar": vendor.avatar,
        "capabilities": [],
        "summary": ROLE_SUMMARY["Vendor"],
    }


def client_payload(client: ClientAccount) -> dict:
    lead = client.lead
    return {
        "kind": "client",
        "id": client.id,
        "name": client.name,
        "role": "Couple",
        "title": lead.couple_name if lead else "Couple",
        "couple_name": lead.couple_name if lead else None,
        "email": client.email,
        "phone": client.phone,
        "avatar": client.avatar,
        "capabilities": [],
        "summary": ROLE_SUMMARY["Couple"],
    }


# --------------------------------------------------------------------------
# Which weddings a person may open
# --------------------------------------------------------------------------
def sees_all_weddings(user: Staff) -> bool:
    return CAP_ALL_WEDDINGS in caps_for(user.role)


def scope_weddings(query, user: Staff):
    """Narrow a query that involves Wedding to the ones this person runs."""
    if sees_all_weddings(user):
        return query
    return query.filter(Wedding.planner_id == user.id)


def check_wedding(user: Staff, wedding: Wedding | None) -> Wedding:
    """404 for a wedding that does not exist *or* that belongs to another
    manager — the same answer for both, so ids cannot be probed."""
    if wedding is None:
        raise HTTPException(404, "Wedding not found")
    if not sees_all_weddings(user) and wedding.planner_id != user.id:
        raise HTTPException(404, "Wedding not found")
    return wedding
