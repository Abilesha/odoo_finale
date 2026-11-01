"""The Royal Knot — domain model.

Design principle: one spine.  `Wedding` is the single record every other
table hangs off, so a fact entered once (guest count, an awarded caterer, an
extra-guest change order) propagates to planning, the run sheet, vendor
payments and the founder's P&L without being retyped.
"""
from __future__ import annotations

import enum
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


# --------------------------------------------------------------------------
# Enumerations
# --------------------------------------------------------------------------
class LeadStage(str, enum.Enum):
    NEW = "New"
    CONTACTED = "Contacted"
    MEETING = "Meeting Booked"
    AGREEMENT_SENT = "Agreement Sent"
    SIGNED = "Signed"
    WON = "Won"
    LOST = "Lost"


class LeadSource(str, enum.Enum):
    CALL = "Phone Call"
    INSTAGRAM = "Instagram"
    WHATSAPP = "WhatsApp"
    REFERRAL = "Referral"
    WEBSITE = "Website"


class PackageType(str, enum.Enum):
    FULL_SERVICE = "Full-Service Wedding"
    DAY_OF = "Partial / Day-of"


class WeddingStatus(str, enum.Enum):
    PLANNING = "Planning"
    EXECUTION = "Execution"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class TaskStage(str, enum.Enum):
    TO_PLAN = "To Plan"
    IN_PROGRESS = "In Progress"
    BLOCKED = "Blocked"
    DONE = "Done"


class TaskPhase(str, enum.Enum):
    VENUE = "Venue"
    DESIGN = "Design"
    VENDORS = "Vendors"
    BIG_DAY = "Big Day"
    CLOSEOUT = "Close-out"


class RFQStatus(str, enum.Enum):
    DRAFT = "Draft"
    SENT = "Sent"
    COMPARING = "Comparing"
    AWARDED = "Awarded"
    CANCELLED = "Cancelled"


class QuoteStatus(str, enum.Enum):
    PENDING = "Awaiting Reply"
    RECEIVED = "Received"
    AWARDED = "Awarded"
    REJECTED = "Rejected"


class MilestoneKind(str, enum.Enum):
    BOOKING = "Booking Payment"
    ADVANCE = "Advance Payment"
    FINAL = "Final Payment"


class MilestoneStatus(str, enum.Enum):
    DUE = "Due"
    INVOICED = "Invoiced"
    PAID = "Paid"


class RunSheetStatus(str, enum.Enum):
    PENDING = "Pending"
    ARRIVED = "Arrived"
    IN_PROGRESS = "In Progress"
    DONE = "Done"
    LATE = "Late"


class BillMatchStatus(str, enum.Enum):
    MATCHED = "Matched"
    VARIANCE = "Variance"
    BLOCKED = "Blocked"
    PAID = "Paid"


class UnitOfMeasure(str, enum.Enum):
    PER_PLATE = "per plate"
    PER_DAY = "per day"
    PER_HOUR = "per hour"
    FLAT = "flat"
    PER_PERSON = "per person"


# --------------------------------------------------------------------------
# People
# --------------------------------------------------------------------------
class Staff(Base):
    __tablename__ = "staff"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    #: access level, and the only thing permissions ever look at.
    #: "Founder" or "Manager" — see services/auth.py ROLE_CAPS
    role: Mapped[str] = mapped_column(String(80), default="Manager")
    #: what they actually do day to day (Lead Planner, Coordinator, Designer).
    #: Shown to people and used to pick a sensible owner for a task; never
    #: used to decide what anyone is allowed to open.
    title: Mapped[str | None] = mapped_column(String(80), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    #: internal cost of this person's time — feeds the per-wedding P&L
    hourly_cost: Mapped[float] = mapped_column(Float, default=450.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    #: contact details the founder sees on the managers screen
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    joined_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # a small square photo (JPEG data URL, resized in the browser)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)


class ShareLink(Base):
    """A read-only link to the season's numbers.

    The brief ends with the founder wanting "to share these numbers when
    needed" — with an investor, an accountant, a partner.  Those people should
    not need an account, and the founder should be able to withdraw the link
    afterwards, so it is a revocable token rather than an email attachment
    that lives for ever in someone's inbox.
    """

    __tablename__ = "share_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(160), default="Season summary")
    created_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("staff.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    view_count: Mapped[int] = mapped_column(Integer, default=0)
    #: whether the recipient sees per-wedding detail or only season totals
    include_detail: Mapped[bool] = mapped_column(Boolean, default=True)

    created_by: Mapped[Staff | None] = relationship()

    @property
    def is_live(self) -> bool:
        if self.revoked:
            return False
        return self.expires_at is None or self.expires_at > datetime.utcnow()


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(80))  # Caterer, Decorator, DJ...
    city: Mapped[str] = mapped_column(String(80), default="Jaipur")
    contact_person: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    #: rolling scorecard, recomputed from run-sheet check-ins and bill variance
    jobs_completed: Mapped[int] = mapped_column(Integer, default=0)
    on_time_count: Mapped[int] = mapped_column(Integer, default=0)
    quality_rating: Mapped[float] = mapped_column(Float, default=4.0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- the vendor's own sign-in -----------------------------------------
    #: set by the founder; a vendor with no password has no portal access
    password_hash: Mapped[str | None] = mapped_column(String(200), nullable=True)
    portal_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # ---- what they can take on --------------------------------------------
    # The manager reads these before inviting a vendor, so nobody floats a
    # 600-guest request to a caterer whose kitchen tops out at 300.
    max_guests: Mapped[int | None] = mapped_column(Integer, nullable=True)
    team_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_events_per_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: comma-separated, e.g. "Jaipur, Udaipur, Jodhpur"
    service_cities: Mapped[str | None] = mapped_column(String(240), nullable=True)
    #: days of notice they need to take a job
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_order_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: newline list of what they can handle — "Live counters", "Jain menu"
    capabilities: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)

    quotes: Mapped[list["Quote"]] = relationship(back_populates="vendor")
    contracts: Mapped[list["VendorContract"]] = relationship(back_populates="vendor")
    availability: Mapped[list["VendorAvailability"]] = relationship(
        back_populates="vendor", cascade="all, delete-orphan"
    )

    @property
    def cities(self) -> list[str]:
        raw = self.service_cities or self.city or ""
        return [c.strip() for c in raw.split(",") if c.strip()]

    @property
    def on_time_pct(self) -> float:
        if not self.jobs_completed:
            return 0.0
        return round(100.0 * self.on_time_count / self.jobs_completed, 1)


# --------------------------------------------------------------------------
# Scene 1 — the first consultation
# --------------------------------------------------------------------------
class Lead(Base):
    """An enquiry.  Captured once, never lost, never retyped."""

    __tablename__ = "leads"

    id: Mapped[int] = mapped_column(primary_key=True)
    partner_a: Mapped[str] = mapped_column(String(120))
    partner_b: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40))
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)

    rough_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    guest_count: Mapped[int] = mapped_column(Integer, default=400)
    theme: Mapped[str | None] = mapped_column(String(160), nullable=True)
    max_budget: Mapped[float] = mapped_column(Float, default=0.0)
    preferred_city: Mapped[str] = mapped_column(String(80), default="Jaipur")
    package_interest: Mapped[PackageType] = mapped_column(
        Enum(PackageType), default=PackageType.FULL_SERVICE
    )

    source: Mapped[LeadSource] = mapped_column(Enum(LeadSource), default=LeadSource.CALL)
    stage: Mapped[LeadStage] = mapped_column(Enum(LeadStage), default=LeadStage.NEW)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meeting_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    #: from the online enquiry: which ceremonies, which services they want
    events_wanted: Mapped[str | None] = mapped_column(String(240), nullable=True)
    services_wanted: Mapped[str | None] = mapped_column(Text, nullable=True)

    owner: Mapped[Staff | None] = relationship()
    agreement: Mapped["Agreement | None"] = relationship(
        back_populates="lead", uselist=False, cascade="all, delete-orphan"
    )
    client_account: Mapped["ClientAccount | None"] = relationship(
        back_populates="lead", uselist=False
    )
    wedding: Mapped["Wedding | None"] = relationship(back_populates="lead", uselist=False)

    @property
    def couple_name(self) -> str:
        return f"{self.partner_a} & {self.partner_b}"


class Agreement(Base):
    """Service agreement sent to the couple's phone and signed there.

    The signature is stored as a base64 PNG data URL drawn on a touch canvas,
    together with the audit trail (when, from which IP, which version of the
    terms).  The signed copy stays attached to the lead for ever.
    """

    __tablename__ = "agreements"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"))
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    body: Mapped[str] = mapped_column(Text)
    package_type: Mapped[PackageType] = mapped_column(Enum(PackageType))
    quoted_fee: Mapped[float] = mapped_column(Float, default=0.0)

    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signer_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    signature_png: Mapped[str | None] = mapped_column(Text, nullable=True)
    signer_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)

    lead: Mapped[Lead] = relationship(back_populates="agreement")

    @property
    def is_signed(self) -> bool:
        return self.signed_at is not None


# --------------------------------------------------------------------------
# The spine
# --------------------------------------------------------------------------
class Wedding(Base):
    __tablename__ = "weddings"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("leads.id"), nullable=True)

    couple_name: Mapped[str] = mapped_column(String(200))
    package_type: Mapped[PackageType] = mapped_column(Enum(PackageType))
    status: Mapped[WeddingStatus] = mapped_column(
        Enum(WeddingStatus), default=WeddingStatus.PLANNING
    )

    city: Mapped[str] = mapped_column(String(80), default="Jaipur")
    venue: Mapped[str | None] = mapped_column(String(200), nullable=True)
    theme: Mapped[str | None] = mapped_column(String(160), nullable=True)

    #: a Royal Knot wedding is always three days
    day1_date: Mapped[date] = mapped_column(Date)  # Mehendi
    day2_date: Mapped[date] = mapped_column(Date)  # Sangeet
    day3_date: Mapped[date] = mapped_column(Date)  # Wedding + Reception

    guest_count: Mapped[int] = mapped_column(Integer, default=400)
    #: headcount that actually turned up — drives extra-plate change orders
    actual_guest_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    package_value: Mapped[float] = mapped_column(Float, default=0.0)
    budget_cap: Mapped[float] = mapped_column(Float, default=0.0)

    #: the manager the founder assigned this wedding to
    planner_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    assignment_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    lead: Mapped[Lead | None] = relationship(back_populates="wedding")
    planner: Mapped[Staff | None] = relationship()
    tasks: Mapped[list["Task"]] = relationship(
        back_populates="wedding", cascade="all, delete-orphan"
    )
    milestones: Mapped[list["PaymentMilestone"]] = relationship(
        back_populates="wedding", cascade="all, delete-orphan"
    )
    rfqs: Mapped[list["QuoteRequest"]] = relationship(
        back_populates="wedding", cascade="all, delete-orphan"
    )
    contracts: Mapped[list["VendorContract"]] = relationship(
        back_populates="wedding", cascade="all, delete-orphan"
    )
    runsheet: Mapped[list["RunSheetItem"]] = relationship(
        back_populates="wedding", cascade="all, delete-orphan"
    )
    change_orders: Mapped[list["ChangeOrder"]] = relationship(
        back_populates="wedding", cascade="all, delete-orphan"
    )
    time_logs: Mapped[list["TimeLog"]] = relationship(
        back_populates="wedding", cascade="all, delete-orphan"
    )


# --------------------------------------------------------------------------
# Scene 2 — three caterers, one decision
# --------------------------------------------------------------------------
class QuoteRequest(Base):
    """One RFQ fans out to N vendors in a category and resolves to one award."""

    __tablename__ = "quote_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"))
    category: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(200))
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    guest_count: Mapped[int] = mapped_column(Integer, default=400)
    needed_by: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[RFQStatus] = mapped_column(Enum(RFQStatus), default=RFQStatus.DRAFT)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # ---- the couple's decision ------------------------------------------
    # The brief is explicit: "When the couple picks a winner, the other two
    # requests should close on their own."  The planner shortlists and sends
    # this link; the couple opens it on their phone and chooses.
    #: private link the couple opens — no account, same pattern as signing
    choice_token: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True
    )
    shared_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: which quote the couple themselves picked (null when the planner awarded)
    chosen_quote_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chosen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    chosen_by_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    couple_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: the quotes the couple is shown — the manager's top three, comma-separated
    shortlist: Mapped[str | None] = mapped_column(String(120), nullable=True)

    wedding: Mapped[Wedding] = relationship(back_populates="rfqs")
    quotes: Mapped[list["Quote"]] = relationship(
        back_populates="rfq", cascade="all, delete-orphan"
    )

    @property
    def awaiting_couple(self) -> bool:
        """Sent to the couple and not yet decided."""
        return bool(self.choice_token) and self.chosen_at is None

    @property
    def shortlist_ids(self) -> list[int]:
        return [int(x) for x in (self.shortlist or "").split(",") if x.strip().isdigit()]


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[int] = mapped_column(primary_key=True)
    rfq_id: Mapped[int] = mapped_column(ForeignKey("quote_requests.id"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    status: Mapped[QuoteStatus] = mapped_column(
        Enum(QuoteStatus), default=QuoteStatus.PENDING
    )

    #: the apples-to-oranges fields that make hand comparison miserable
    extra_hour_rate: Mapped[float] = mapped_column(Float, default=0.0)
    inclusions: Mapped[str | None] = mapped_column(Text, nullable=True)  # newline list
    exclusions: Mapped[str | None] = mapped_column(Text, nullable=True)
    gst_percent: Mapped[float] = mapped_column(Float, default=18.0)
    #: travel/setup charges vendors like to hide at the bottom of a PDF
    logistics_fee: Mapped[float] = mapped_column(Float, default=0.0)
    validity_days: Mapped[int] = mapped_column(Integer, default=15)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: the vendor's own cost to deliver this — private to the vendor, never
    #: sent to the agency; it is how the vendor portal shows their profit
    vendor_cost_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)
    declined: Mapped[bool] = mapped_column(Boolean, default=False)

    rfq: Mapped[QuoteRequest] = relationship(back_populates="quotes")
    vendor: Mapped[Vendor] = relationship(back_populates="quotes")
    lines: Mapped[list["QuoteLine"]] = relationship(
        back_populates="quote", cascade="all, delete-orphan"
    )


class QuoteLine(Base):
    __tablename__ = "quote_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    quote_id: Mapped[int] = mapped_column(ForeignKey("quotes.id"))
    description: Mapped[str] = mapped_column(String(240))
    unit: Mapped[UnitOfMeasure] = mapped_column(
        Enum(UnitOfMeasure), default=UnitOfMeasure.FLAT
    )
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)

    quote: Mapped[Quote] = relationship(back_populates="lines")

    @property
    def line_total(self) -> float:
        return round(self.quantity * self.unit_price, 2)


class VendorContract(Base):
    """Created the moment a quote is awarded.  This is the agreed number that
    the vendor's final bill is matched against."""

    __tablename__ = "vendor_contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"))
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    quote_id: Mapped[int | None] = mapped_column(ForeignKey("quotes.id"), nullable=True)
    category: Mapped[str] = mapped_column(String(80))

    agreed_amount: Mapped[float] = mapped_column(Float, default=0.0)
    advance_paid: Mapped[float] = mapped_column(Float, default=0.0)
    advance_paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    signed_on: Mapped[date] = mapped_column(Date, default=date.today)

    # ---- the vendor's side of the job ------------------------------------
    #: private to the vendor — what it costs them to deliver
    vendor_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    #: latest progress the vendor reported, kept here for quick reading
    progress_pct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    work_status: Mapped[str | None] = mapped_column(String(40), nullable=True)

    wedding: Mapped[Wedding] = relationship(back_populates="contracts")
    vendor: Mapped[Vendor] = relationship(back_populates="contracts")
    bills: Mapped[list["VendorBill"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan"
    )
    updates: Mapped[list["VendorUpdate"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan",
        order_by="VendorUpdate.created_at.desc()",
    )


# --------------------------------------------------------------------------
# Scene 3 — the instant wedding plan
# --------------------------------------------------------------------------
class TaskTemplateItem(Base):
    """A reusable checklist row.  Nobody copies a checklist from the last
    wedding; the plan is generated from these."""

    __tablename__ = "task_template_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    package_type: Mapped[PackageType] = mapped_column(Enum(PackageType))
    phase: Mapped[TaskPhase] = mapped_column(Enum(TaskPhase))
    title: Mapped[str] = mapped_column(String(240))
    #: negative = days before day-1 of the wedding, positive = days after
    offset_days: Mapped[int] = mapped_column(Integer, default=-30)
    default_role: Mapped[str] = mapped_column(String(80), default="Planner")
    sequence: Mapped[int] = mapped_column(Integer, default=0)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"))
    title: Mapped[str] = mapped_column(String(240))
    phase: Mapped[TaskPhase] = mapped_column(Enum(TaskPhase), default=TaskPhase.VENUE)
    stage: Mapped[TaskStage] = mapped_column(Enum(TaskStage), default=TaskStage.TO_PLAN)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: the couple's own to-do (share the guest list, attend the tasting) —
    #: they tick it from their portal; the manager still owns chasing it
    for_client: Mapped[bool] = mapped_column(Boolean, default=False)

    wedding: Mapped[Wedding] = relationship(back_populates="tasks")
    owner: Mapped[Staff | None] = relationship()

    @property
    def is_overdue(self) -> bool:
        return (
            self.stage != TaskStage.DONE
            and self.due_date is not None
            and self.due_date < date.today()
        )


class PaymentMilestone(Base):
    """Staged client payments: booking, advance a month before, final after."""

    __tablename__ = "payment_milestones"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"))
    kind: Mapped[MilestoneKind] = mapped_column(Enum(MilestoneKind))
    percent: Mapped[float] = mapped_column(Float, default=0.0)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[MilestoneStatus] = mapped_column(
        Enum(MilestoneStatus), default=MilestoneStatus.DUE
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    #: the couple says "we've paid, here's the UTR" — the manager confirms it
    #: against the bank before it counts as received
    client_reference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    client_reported_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    wedding: Mapped[Wedding] = relationship(back_populates="milestones")

    @property
    def is_overdue(self) -> bool:
        return self.status != MilestoneStatus.PAID and self.due_date < date.today()


# --------------------------------------------------------------------------
# Scene 4 — the big day schedule
# --------------------------------------------------------------------------
class RunSheetItem(Base):
    """One minute-by-minute slot on one of the three days."""

    __tablename__ = "runsheet_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"))
    day_number: Mapped[int] = mapped_column(Integer, default=3)  # 1, 2 or 3
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    title: Mapped[str] = mapped_column(String(240))
    location: Mapped[str | None] = mapped_column(String(160), nullable=True)

    owner_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), nullable=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True)

    status: Mapped[RunSheetStatus] = mapped_column(
        Enum(RunSheetStatus), default=RunSheetStatus.PENDING
    )
    #: when the responsible vendor physically checked in
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: minutes of slack before the slot is flagged late
    grace_minutes: Mapped[int] = mapped_column(Integer, default=10)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    wedding: Mapped[Wedding] = relationship(back_populates="runsheet")
    owner: Mapped[Staff | None] = relationship()
    vendor: Mapped[Vendor | None] = relationship()


# --------------------------------------------------------------------------
# Scene 5 — paying vendors and extra costs
# --------------------------------------------------------------------------
class VendorBill(Base):
    """Three-way match: agreed contract vs what the vendor billed vs what was
    actually delivered.  Advances already paid are netted off automatically so
    nothing is paid twice."""

    __tablename__ = "vendor_bills"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("vendor_contracts.id"))
    bill_number: Mapped[str] = mapped_column(String(60))
    bill_date: Mapped[date] = mapped_column(Date, default=date.today)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    billed_amount: Mapped[float] = mapped_column(Float, default=0.0)
    #: approved extras traced to change orders (e.g. 60 extra plates)
    approved_extras: Mapped[float] = mapped_column(Float, default=0.0)

    match_status: Mapped[BillMatchStatus] = mapped_column(
        Enum(BillMatchStatus), default=BillMatchStatus.BLOCKED
    )
    paid_amount: Mapped[float] = mapped_column(Float, default=0.0)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_reference: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    contract: Mapped[VendorContract] = relationship(back_populates="bills")


class ChangeOrder(Base):
    """An on-the-day extra — 60 unexpected guests, two more DJ hours.

    One record carries BOTH sides: what it costs the agency (vendor_cost) and
    what the client is fairly billed (client_amount).  That is what makes the
    margin honest instead of a guess.
    """

    __tablename__ = "change_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"))
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True)
    description: Mapped[str] = mapped_column(String(240))
    unit: Mapped[UnitOfMeasure] = mapped_column(
        Enum(UnitOfMeasure), default=UnitOfMeasure.PER_PLATE
    )
    quantity: Mapped[float] = mapped_column(Float, default=0.0)

    vendor_unit_cost: Mapped[float] = mapped_column(Float, default=0.0)
    client_unit_price: Mapped[float] = mapped_column(Float, default=0.0)

    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    billed_to_client: Mapped[bool] = mapped_column(Boolean, default=False)
    raised_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    wedding: Mapped[Wedding] = relationship(back_populates="change_orders")
    vendor: Mapped[Vendor | None] = relationship()

    @property
    def vendor_cost(self) -> float:
        return round(self.quantity * self.vendor_unit_cost, 2)

    @property
    def client_amount(self) -> float:
        return round(self.quantity * self.client_unit_price, 2)

    @property
    def margin(self) -> float:
        return round(self.client_amount - self.vendor_cost, 2)


class TimeLog(Base):
    """Planning-team hours.  Without these, 'profit per wedding' is fiction."""

    __tablename__ = "time_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"))
    staff_id: Mapped[int] = mapped_column(ForeignKey("staff.id"))
    log_date: Mapped[date] = mapped_column(Date, default=date.today)
    hours: Mapped[float] = mapped_column(Float, default=0.0)
    description: Mapped[str | None] = mapped_column(String(240), nullable=True)

    wedding: Mapped[Wedding] = relationship(back_populates="time_logs")
    staff: Mapped[Staff] = relationship()


# --------------------------------------------------------------------------
# The vendor's portal
# --------------------------------------------------------------------------
class VendorAvailability(Base):
    """A day the vendor has marked as limited or unavailable.

    Days with no row are open. Days a vendor is already contracted for are
    worked out from their contracts, so they never have to be entered twice.
    """

    __tablename__ = "vendor_availability"

    id: Mapped[int] = mapped_column(primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    #: "Limited" or "Unavailable"
    status: Mapped[str] = mapped_column(String(20), default="Unavailable")
    note: Mapped[str | None] = mapped_column(String(240), nullable=True)

    vendor: Mapped[Vendor] = relationship(back_populates="availability")


class VendorUpdate(Base):
    """A vendor telling the manager how their part of a wedding is going —
    on track, delayed and why, or done. Replaces the 9pm "where is the
    mandap?" phone call."""

    __tablename__ = "vendor_updates"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("vendor_contracts.id"), index=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"))
    wedding_id: Mapped[int] = mapped_column(ForeignKey("weddings.id"), index=True)
    #: "On Track", "Delayed", "Blocked" or "Completed"
    status: Mapped[str] = mapped_column(String(20), default="On Track")
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text)
    #: when a delayed item will now be ready
    expected_by: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    contract: Mapped[VendorContract] = relationship(back_populates="updates")
    vendor: Mapped[Vendor] = relationship()
    wedding: Mapped[Wedding] = relationship()


# --------------------------------------------------------------------------
# The couple's portal
# --------------------------------------------------------------------------
class ClientAccount(Base):
    """The couple's sign-in.  One per enquiry, created either by the couple
    themselves through the online enquiry, or by their planner from the lead.

    It hangs off the Lead rather than the Wedding because a couple exists
    before their wedding does — they enquire, meet, sign — and the same login
    follows them once the deposit turns the lead into a wedding.
    """

    __tablename__ = "client_accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    avatar: Mapped[str | None] = mapped_column(Text, nullable=True)
    # the couple's invitation designs and wording, as JSON
    invitation: Mapped[str | None] = mapped_column(Text, nullable=True)

    lead: Mapped[Lead] = relationship(back_populates="client_account")


class ClientTicket(Base):
    """A question, complaint or change request from the couple.

    Goes to whoever runs their wedding (or owns their enquiry), and the
    founder sees every one — a complaint nobody answers is the review that
    costs the next three bookings.
    """

    __tablename__ = "client_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("client_accounts.id"), index=True)
    lead_id: Mapped[int] = mapped_column(ForeignKey("leads.id"))
    wedding_id: Mapped[int | None] = mapped_column(ForeignKey("weddings.id"), nullable=True)
    #: "Query", "Complaint" or "Change request"
    kind: Mapped[str] = mapped_column(String(30), default="Query")
    #: what it is about — Planning, Vendors, Payments, Schedule, Agreement, Other
    topic: Mapped[str] = mapped_column(String(40), default="Planning")
    subject: Mapped[str] = mapped_column(String(200))
    #: "Open", "In Progress", "Resolved"
    status: Mapped[str] = mapped_column(String(30), default="Open")
    #: "Normal" or "Urgent"
    priority: Mapped[str] = mapped_column(String(20), default="Normal")
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    #: the couple's rating once it is resolved, 1–5
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_note: Mapped[str | None] = mapped_column(String(240), nullable=True)

    client: Mapped[ClientAccount] = relationship()
    lead: Mapped[Lead] = relationship()
    wedding: Mapped[Wedding | None] = relationship()
    assigned_to: Mapped[Staff | None] = relationship()
    messages: Mapped[list["TicketMessage"]] = relationship(
        back_populates="ticket", cascade="all, delete-orphan",
        order_by="TicketMessage.created_at",
    )

    @property
    def awaiting(self) -> str:
        """Whose turn it is — the thing both sides actually want to know."""
        if self.status == "Resolved":
            return "nobody"
        last = self.messages[-1] if self.messages else None
        return "couple" if last and last.author_kind == "staff" else "planner"


class TicketMessage(Base):
    __tablename__ = "ticket_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("client_tickets.id"), index=True)
    #: "client" or "staff"
    author_kind: Mapped[str] = mapped_column(String(10))
    author_name: Mapped[str] = mapped_column(String(120))
    staff_id: Mapped[int | None] = mapped_column(ForeignKey("staff.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    ticket: Mapped[ClientTicket] = relationship(back_populates="messages")
