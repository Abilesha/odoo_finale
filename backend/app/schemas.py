"""Request/response shapes.

Responses are mostly plain dicts assembled by the services (they compute
derived figures like cost-per-plate that have no table column).  Pydantic is
used where input needs validating.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

import re

from pydantic import BaseModel, Field, field_validator

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def _check_email(v: str) -> str:
    v = (v or "").strip().lower()
    if not _EMAIL_RE.match(v):
        raise ValueError("That does not look like an email address")
    return v

from .models import (
    LeadSource,
    LeadStage,
    MilestoneStatus,
    PackageType,
    TaskPhase,
    TaskStage,
    UnitOfMeasure,
    WeddingStatus,
)


# ---- Scene 1 --------------------------------------------------------------
class LeadCreate(BaseModel):
    partner_a: str
    partner_b: str
    phone: str
    email: str | None = None
    rough_date: date | None = None
    guest_count: int = 400
    theme: str | None = None
    max_budget: float = 0
    preferred_city: str = "Jaipur"
    package_interest: PackageType = PackageType.FULL_SERVICE
    source: LeadSource = LeadSource.CALL
    owner_id: int | None = None
    notes: str | None = None


class LeadUpdate(BaseModel):
    stage: LeadStage | None = None
    owner_id: int | None = None
    notes: str | None = None
    meeting_at: datetime | None = None
    rough_date: date | None = None
    guest_count: int | None = None
    theme: str | None = None
    max_budget: float | None = None
    partner_a: str | None = None
    partner_b: str | None = None
    phone: str | None = None
    email: str | None = None
    preferred_city: str | None = None
    source: LeadSource | None = None
    package_interest: PackageType | None = None


class ClientAccountIn(BaseModel):
    email: str
    password: str = Field(min_length=8, max_length=128)
    name: str | None = None

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _check_email(v)


class AgreementCreate(BaseModel):
    package_type: PackageType = PackageType.FULL_SERVICE
    quoted_fee: float = Field(default=0, ge=0)
    body: str | None = None
    # the couple signs inside their own portal, so a couple who has no login
    # yet gets one in the same step as the agreement is sent
    client_login: ClientAccountIn | None = None


class EnquiryIn(BaseModel):
    """The public, multi-step enquiry — what the couple fills in themselves."""
    # step 1 — about you
    partner_a: str = Field(min_length=2, max_length=120)
    partner_b: str = Field(min_length=2, max_length=120)
    your_name: str = Field(min_length=2, max_length=120)
    email: str
    phone: str = Field(min_length=8, max_length=40)
    # step 2 — the wedding
    rough_date: date
    preferred_city: str = Field(min_length=2, max_length=80)
    guest_count: int = Field(ge=20, le=5000)
    package_interest: PackageType = PackageType.FULL_SERVICE
    # step 3 — the feel
    theme: str | None = Field(default=None, max_length=160)
    events: list[str] = []
    # step 4 — budget and what you need
    max_budget: float = Field(ge=0)
    services: list[str] = []
    source: LeadSource = LeadSource.WEBSITE
    notes: str | None = Field(default=None, max_length=2000)
    # step 5 — your login
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _check_email(v)

    @field_validator("rough_date")
    @classmethod
    def _future(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("Pick a date in the future")
        return v


class TicketIn(BaseModel):
    kind: str = Field(pattern="^(Query|Complaint|Change request)$")
    topic: str = Field(pattern="^(Planning|Vendors|Payments|Schedule|Agreement|Other)$")
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=3, max_length=4000)
    urgent: bool = False


class TicketReplyIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class TicketUpdateIn(BaseModel):
    status: str | None = Field(default=None, pattern="^(Open|In Progress|Resolved)$")
    priority: str | None = Field(default=None, pattern="^(Normal|Urgent)$")
    assigned_to_id: int | None = None


class TicketRateIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    note: str | None = Field(default=None, max_length=240)


class PaymentReportIn(BaseModel):
    reference: str = Field(min_length=4, max_length=80)


class ClientProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=40)


class AgreementSign(BaseModel):
    signer_name: str = Field(min_length=2)
    signature_png: str = Field(description="base64 data URL from the signature canvas")


# ---- Weddings -------------------------------------------------------------
class WeddingCreate(BaseModel):
    couple_name: str
    package_type: PackageType = PackageType.FULL_SERVICE
    city: str = "Jaipur"
    venue: str | None = None
    theme: str | None = None
    day1_date: date
    guest_count: int = 400
    package_value: float = 0
    budget_cap: float = 0
    planner_id: int | None = None
    lead_id: int | None = None


class WeddingUpdate(BaseModel):
    couple_name: str | None = None
    package_type: PackageType | None = None
    status: WeddingStatus | None = None
    city: str | None = None
    venue: str | None = None
    theme: str | None = None
    day1_date: date | None = None
    guest_count: int | None = Field(default=None, ge=1)
    package_value: float | None = Field(default=None, ge=0)
    budget_cap: float | None = Field(default=None, ge=0)
    planner_id: int | None = None


class AssignIn(BaseModel):
    manager_id: int | None
    note: str | None = None


class ConvertLead(BaseModel):
    package_type: PackageType | None = None
    package_value: float
    venue: str | None = None
    day1_date: date | None = None
    planner_id: int | None = None


# ---- Scene 2 --------------------------------------------------------------
class RFQCreate(BaseModel):
    wedding_id: int
    category: str
    title: str
    scope: str | None = None
    guest_count: int | None = None
    needed_by: date | None = None
    vendor_ids: list[int] = []


class QuoteLineIn(BaseModel):
    description: str
    unit: UnitOfMeasure = UnitOfMeasure.FLAT
    quantity: float = 1
    unit_price: float = 0


class QuoteCreate(BaseModel):
    vendor_id: int
    extra_hour_rate: float = 0
    inclusions: str | None = None
    exclusions: str | None = None
    gst_percent: float = 18
    logistics_fee: float = 0
    validity_days: int = 15
    notes: str | None = None
    lines: list[QuoteLineIn] = []


class AwardIn(BaseModel):
    quote_id: int
    advance_percent: float = 30.0


class ShareIn(BaseModel):
    #: up to three quotes to show the couple; empty means "the top three"
    quote_ids: list[int] = []


class VendorIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=80)
    city: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    quality_rating: float | None = Field(default=None, ge=0, le=5)
    notes: str | None = None
    max_guests: int | None = None
    team_size: int | None = None
    max_events_per_day: int | None = None
    service_cities: str | None = None
    lead_time_days: int | None = None
    min_order_value: float | None = None
    capabilities: str | None = None
    #: set to give the vendor a portal sign-in
    password: str | None = Field(default=None, min_length=8, max_length=128)


class VendorSignup(BaseModel):
    """A business owner registering directly for the vendor portal."""
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(min_length=2, max_length=80)
    contact_person: str = Field(min_length=2, max_length=120)
    email: str
    phone: str = Field(min_length=8, max_length=40)
    city: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    service_cities: str | None = Field(default=None, max_length=240)
    capabilities: str | None = Field(default=None, max_length=2000)
    max_guests: int | None = Field(default=None, ge=1, le=100000)
    team_size: int | None = Field(default=None, ge=1, le=10000)
    max_events_per_day: int | None = Field(default=None, ge=1, le=50)
    lead_time_days: int | None = Field(default=None, ge=0, le=365)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return _check_email(v)

    @field_validator("name", "category", "contact_person", "city", "phone")
    @classmethod
    def _trim(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("is required")
        return v


class VendorPatch(BaseModel):
    name: str | None = None
    category: str | None = None
    city: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    quality_rating: float | None = Field(default=None, ge=0, le=5)
    notes: str | None = None
    max_guests: int | None = None
    team_size: int | None = None
    max_events_per_day: int | None = None
    service_cities: str | None = None
    lead_time_days: int | None = None
    min_order_value: float | None = None
    capabilities: str | None = None
    portal_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class ContractUpdate(BaseModel):
    agreed_amount: float | None = Field(default=None, ge=0)
    advance_paid: float | None = Field(default=None, ge=0)


# ---- Scene 3 --------------------------------------------------------------
class TaskUpdate(BaseModel):
    stage: TaskStage | None = None
    owner_id: int | None = None
    due_date: date | None = None
    notes: str | None = None
    title: str | None = None
    phase: TaskPhase | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    phase: TaskPhase = TaskPhase.VENDORS
    owner_id: int | None = None
    due_date: date | None = None
    notes: str | None = None


class MilestoneUpdate(BaseModel):
    status: MilestoneStatus | None = None
    amount: float | None = None
    due_date: date | None = None
    reference: str | None = None


# ---- Scene 4 --------------------------------------------------------------
class RunSheetItemIn(BaseModel):
    day_number: int = 3
    start_time: str
    end_time: str | None = None
    title: str
    location: str | None = None
    owner_id: int | None = None
    vendor_id: int | None = None
    grace_minutes: int = 10
    notes: str | None = None


class RunSheetStatusIn(BaseModel):
    status: str


class RunSheetItemUpdate(BaseModel):
    day_number: int | None = Field(default=None, ge=1, le=3)
    start_time: str | None = None
    end_time: str | None = None
    title: str | None = None
    location: str | None = None
    owner_id: int | None = None
    vendor_id: int | None = None
    grace_minutes: int | None = None
    notes: str | None = None


# ---- The vendor portal ----------------------------------------------------
class VendorQuoteIn(BaseModel):
    """A vendor pricing a request from their own portal."""
    lines: list[QuoteLineIn] = Field(min_length=1)
    gst_percent: float = Field(default=18, ge=0, le=28)
    logistics_fee: float = Field(default=0, ge=0)
    extra_hour_rate: float = Field(default=0, ge=0)
    inclusions: str | None = None
    exclusions: str | None = None
    validity_days: int = Field(default=15, ge=1, le=120)
    notes: str | None = None
    #: what it costs the vendor — private, used for their own profit figure
    vendor_cost_estimate: float | None = Field(default=None, ge=0)


class VendorDeclineIn(BaseModel):
    reason: str = Field(min_length=2, max_length=240)


class VendorProgressIn(BaseModel):
    status: str = Field(pattern="^(On Track|Delayed|Blocked|Completed)$")
    progress_pct: int = Field(ge=0, le=100)
    message: str = Field(min_length=2, max_length=1000)
    expected_by: date | None = None


class VendorCostIn(BaseModel):
    vendor_cost: float = Field(ge=0)


class VendorProfileIn(BaseModel):
    contact_person: str | None = None
    phone: str | None = None
    city: str | None = None
    max_guests: int | None = Field(default=None, ge=0)
    team_size: int | None = Field(default=None, ge=0)
    max_events_per_day: int | None = Field(default=None, ge=0)
    service_cities: str | None = None
    lead_time_days: int | None = Field(default=None, ge=0)
    min_order_value: float | None = Field(default=None, ge=0)
    capabilities: str | None = None
    notes: str | None = None


class AvailabilityDay(BaseModel):
    day: date
    #: "Available" clears the day
    status: str = Field(pattern="^(Available|Limited|Unavailable)$")
    note: str | None = None


class AvailabilityIn(BaseModel):
    days: list[AvailabilityDay]


# ---- Scene 5 --------------------------------------------------------------
class ChangeOrderCreate(BaseModel):
    wedding_id: int
    vendor_id: int | None = None
    description: str
    unit: UnitOfMeasure = UnitOfMeasure.PER_PLATE
    quantity: float
    vendor_unit_cost: float = 0
    client_unit_price: float = 0
    approved: bool = False


class VendorBillCreate(BaseModel):
    contract_id: int
    bill_number: str
    billed_amount: float
    bill_date: date | None = None
    due_date: date | None = None
    notes: str | None = None


class PayBillIn(BaseModel):
    reference: str | None = None


class TimeLogCreate(BaseModel):
    wedding_id: int
    staff_id: int
    hours: float
    log_date: date | None = None
    description: str | None = None


class ReconcileGuests(BaseModel):
    actual_guest_count: int
    client_rate_per_plate: float | None = None
    vendor_rate_per_plate: float | None = None


class Ok(BaseModel):
    ok: bool = True
    detail: str | None = None
    data: Any | None = None
