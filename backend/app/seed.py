"""Realistic demo data: one full season at The Royal Knot.

25 weddings, 18 vendors, live quotes mid-comparison, a wedding happening
today with a run sheet, and a closed wedding with bills to settle — so every
screen has something true to show the moment the app opens.
"""
from __future__ import annotations

import random
import secrets
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from .models import (
    Agreement,
    ChangeOrder,
    ClientAccount,
    ClientTicket,
    Lead,
    LeadSource,
    LeadStage,
    MilestoneStatus,
    PackageType,
    Quote,
    QuoteLine,
    QuoteRequest,
    QuoteStatus,
    RFQStatus,
    RunSheetStatus,
    Staff,
    Task,
    TaskStage,
    TaskStage as _TaskStage,
    TicketMessage,
    TimeLog,
    UnitOfMeasure,
    Vendor,
    VendorAvailability,
    VendorBill,
    VendorContract,
    VendorUpdate,
    Wedding,
    WeddingStatus,
)
from .services.auth import hash_password
from .services.planning import COUPLE_TASKS, generate_plan
from .services.quotes import build_comparison, rank_quotes
from .services.runsheet import generate_runsheet

random.seed(7)

#: A second generator for everything added after the season was tuned —
#: staff phone numbers, vendor costs, the newest vendor.  Drawing those from
#: the main stream would reshuffle every wedding's margin and every vendor's
#: punctuality, and the season stops telling its story.
extra = random.Random(11)

#: Vendors new to the books this season: no history with the agency, so they
#: take no part in past weddings — only in the open caterer request.
NEW_VENDORS = {"Saffron Feast Caterers"}

#: Every demo account uses the same password, printed on the sign-in screen.
DEMO_PASSWORD = "royalknot"

#: The two links that belong to the couple rather than to the agency — signing
#: the agreement and choosing a vendor.  Neither needs an account, so neither
#: is reachable from the staff navigation; startup logs them so they can be
#: opened without digging through the database.
DEMO_LINKS: dict[str, str] = {}

#: Two staff access levels — the founder and the managers.  `title` is what
#: the person does day to day and is only ever shown, never used for
#: permissions.  Vendors sign in separately, from the vendor table.
STAFF = [
    ("Nandita Rathore", "Founder", "Founder", 2200.0, "Jaipur", 2400),
    ("Aarav Mehta", "Manager", "Lead Planner", 1200.0, "Jaipur", 1460),
    ("Isha Kapoor", "Manager", "Wedding Manager", 850.0, "Udaipur", 820),
    ("Rohan Verma", "Manager", "Event Manager", 600.0, "Jaipur", 300),
    ("Meera Nair", "Manager", "Design Manager", 950.0, "Udaipur", 610),
    ("Ananya Rao", "Manager", "Wedding Manager", 850.0, "Jaipur", 150),
]

#: Vendors with a portal sign-in in the demo — one per job type that has a
#: story to tell.  The founder can give any other vendor a sign-in from the
#: Vendors screen.
PORTAL_VENDORS = {
    "Gulmohar Decor Studio": "Decorator",       # has a request waiting to price
    "Rajputana Royal Caterers": "Caterer",      # on the couple's shortlist
    "Frames Forever": "Photographer",           # steady jobs, on track
    "BassDrop Entertainment": "DJ",             # running late on the day
}

#: What each kind of vendor can typically take on.
CAPACITY = {
    "Caterer": (600, 45, 1, 21, ["Live counters", "Jain and vegan menus",
                                  "Regional Rajasthani", "Crockery and service staff"]),
    "Decorator": (900, 30, 2, 30, ["Mandap design", "Floral installations",
                                    "Stage and lighting", "Haldi and Mehendi setups"]),
    "Drummers": (2000, 12, 2, 7, ["Baraat procession", "Dhol and nagada"]),
    "Makeup Artist": (None, 6, 1, 30, ["Bridal HD makeup", "Family makeup — up to 8"]),
    "Photographer": (None, 8, 1, 45, ["Candid and traditional", "Cinematic film",
                                       "Drone coverage", "Same-day edit"]),
    "DJ": (1500, 5, 2, 14, ["Sangeet sound and lighting", "LED dance floor",
                             "Reception console"]),
    "Mehendi Artist": (None, 10, 1, 14, ["Bridal mehendi", "Guest mehendi — 80 hands/day"]),
    "Pandit": (None, 3, 2, 10, ["Vedic ceremony", "Muhurat consultation"]),
    "Transport": (800, 40, 2, 10, ["Vintage car for the couple", "Guest shuttles"]),
    "Florist": (900, 14, 2, 21, ["Imported flowers", "Fresh garlands and varmala"]),
}

VENDORS = [
    ("Rajputana Royal Caterers", "Caterer", "Jaipur", "Vikram Rathore", 4.6),
    ("Spice Route Banquets", "Caterer", "Jaipur", "Devika Sharma", 4.2),
    ("Marwar Kitchen Co.", "Caterer", "Udaipur", "Harsh Vyas", 3.9),
    ("Gulmohar Decor Studio", "Decorator", "Jaipur", "Nitya Jain", 4.7),
    ("Pink City Mandaps", "Decorator", "Jaipur", "Suresh Agarwal", 4.1),
    ("Lake Palace Events", "Decorator", "Udaipur", "Pooja Mehra", 4.4),
    ("Dhol Baaje Brothers", "Drummers", "Jaipur", "Imran Khan", 4.5),
    ("Rajasthan Folk Ensemble", "Drummers", "Udaipur", "Lakhan Gurjar", 4.0),
    ("Glow by Ritika", "Makeup Artist", "Jaipur", "Ritika Bhandari", 4.8),
    ("Blush Bridal Studio", "Makeup Artist", "Udaipur", "Sanya Kothari", 4.3),
    ("Frames Forever", "Photographer", "Jaipur", "Arjun Pillai", 4.9),
    ("Aperture Weddings", "Photographer", "Udaipur", "Neel Joshi", 4.2),
    ("BassDrop Entertainment", "DJ", "Jaipur", "DJ Varun", 4.0),
    ("Sunset Sound Systems", "DJ", "Udaipur", "Farhan Qureshi", 3.8),
    ("Henna House", "Mehendi Artist", "Jaipur", "Zoya Siddiqui", 4.6),
    ("Shubh Vivah Pandits", "Pandit", "Jaipur", "Pt. Ramesh Shastri", 4.7),
    ("Royal Rides Transport", "Transport", "Jaipur", "Balwant Yadav", 4.1),
    ("Petal & Thorn Florists", "Florist", "Udaipur", "Tara Menon", 4.4),
    ("Saffron Feast Caterers", "Caterer", "Jaipur", "Kabir Malhotra", 3.6),
]

COUPLES = [
    ("Aditya", "Shruti"), ("Karan", "Nandini"), ("Vivek", "Priya"),
    ("Siddharth", "Aisha"), ("Rahul", "Tanvi"), ("Arnav", "Kavya"),
    ("Dev", "Riya"), ("Yash", "Sanjana"), ("Nikhil", "Pallavi"),
    ("Aman", "Diya"), ("Varun", "Ishita"), ("Raghav", "Mallika"),
    ("Kunal", "Sneha"), ("Harsh", "Anjali"), ("Manav", "Rhea"),
    ("Ishaan", "Trisha"), ("Shaurya", "Naina"), ("Rudra", "Myra"),
    ("Veer", "Avni"), ("Ayaan", "Saira"), ("Krish", "Nitara"),
    ("Abhay", "Kiara"), ("Pranav", "Vaani"), ("Dhruv", "Anushka"),
    ("Rohit", "Simran"),
]

THEMES = [
    "Royal Rajputana heritage", "Beach chic", "Pastel garden romance",
    "Mughal courtyard", "Modern minimal ivory", "Marigold traditional",
    "Jewel-tone maximalist", "Desert sunset",
]

VENUES = {
    "Jaipur": [
        "Samode Palace, Jaipur", "Rambagh Palace, Jaipur", "Chomu Palace, Jaipur",
        "Alila Fort Bishangarh, Jaipur", "Jai Mahal Palace, Jaipur",
    ],
    "Udaipur": [
        "Taj Lake Palace, Udaipur", "The Oberoi Udaivilas, Udaipur",
        "Fateh Garh, Udaipur", "Jagmandir Island Palace, Udaipur",
        "Raffles Udaipur",
    ],
}


def _already_seeded(db: Session) -> bool:
    return db.query(Wedding).count() > 0


def _still_open(w: Wedding, word: str, note: str, days: int) -> None:
    """A decision the demo leaves open must not show as done in the plan —
    the couple would see "every vendor booked" next to "choose your caterer"."""
    for t in w.tasks:
        if word in t.title.lower() and "award" in t.title.lower():
            t.stage, t.completed_at, t.notes = TaskStage.IN_PROGRESS, None, note
            t.due_date = date.today() + timedelta(days=days)


def _reassign(w: Wedding, manager_id: int | None) -> None:
    """Hand a wedding to a manager, and the open work with it."""
    previous = w.planner_id
    w.planner_id = manager_id
    w.assigned_at = datetime.utcnow() - timedelta(days=30) if manager_id else None
    for t in w.tasks:
        if t.stage != _TaskStage.DONE and t.owner_id in (previous, None):
            t.owner_id = manager_id
    for slot in w.runsheet:
        if previous is not None and slot.owner_id == previous:
            slot.owner_id = manager_id


def ensure_portal_demo(db: Session) -> list[str]:
    """Bring a demo database seeded by an older version up to three portals.

    The very first version had no founder account at all, and no version
    before this one let vendors sign in.  Without this, upgrading in place
    leaves nobody able to open the founder console.  Returns what it did.
    """
    done: list[str] = []
    demo_hash = hash_password(DEMO_PASSWORD)

    founders = [
        s for s in db.query(Staff).filter(Staff.active.is_(True)).all()
        if s.role == "Founder"
    ]
    if not founders:
        name, role, title, cost, city, days_in = STAFF[0]
        email = f"{name.split()[0].lower()}@royalknot.in"
        existing = db.query(Staff).filter(Staff.email == email).first()
        if existing:
            existing.role, existing.active = "Founder", True
            existing.password_hash = existing.password_hash or demo_hash
        else:
            db.add(Staff(
                name=name, role=role, title=title, hourly_cost=cost, email=email,
                city=city, joined_on=date.today() - timedelta(days=days_in),
                password_hash=demo_hash,
            ))
        db.commit()
        done.append(f"founder account {email}")

    couples = seed_couples(db)
    if couples:
        done.append(f"{couples} couple account(s)")

    if db.query(Vendor).filter(Vendor.password_hash.isnot(None)).count():
        return done
    changed = 0
    for v in db.query(Vendor).all():
        caps = CAPACITY.get(v.category)
        if caps and v.max_events_per_day is None:
            v.max_guests, v.team_size, v.max_events_per_day, v.lead_time_days = caps[:4]
            v.capabilities = "\n".join(caps[4]) or None
            v.service_cities = v.service_cities or v.city
        if v.name in PORTAL_VENDORS:
            v.password_hash = demo_hash
            v.portal_active = True
            changed += 1
    db.commit()
    if changed:
        done.append(f"portal sign-ins for {changed} vendor(s)")
    return done


def seed(db: Session) -> None:
    if _already_seeded(db):
        return

    today = date.today()

    # ---- staff & vendors -------------------------------------------------
    demo_hash = hash_password(DEMO_PASSWORD)
    staff = [
        Staff(
            name=n,
            role=r,
            title=t,
            hourly_cost=c,
            email=f"{n.split()[0].lower()}@royalknot.in",
            phone=f"+91 98{extra.randint(10000000, 99999999)}",
            city=city,
            joined_on=today - timedelta(days=days_in),
            password_hash=demo_hash,
        )
        for n, r, t, c, city, days_in in STAFF
    ]
    db.add_all(staff)

    vendors = []
    for name, cat, city, person, rating in VENDORS:
        max_guests, team, per_day, notice, caps = CAPACITY.get(cat, (None, 5, 1, 14, []))
        r = extra if name in NEW_VENDORS else random
        vendors.append(
            Vendor(
                name=name, category=cat, city=city, contact_person=person,
                phone=f"+91 9{r.randint(100000000, 999999999)}",
                email=f"hello@{name.split()[0].lower()}.in",
                quality_rating=rating,
                jobs_completed=0 if name in NEW_VENDORS else random.randint(4, 20),
                on_time_count=0,
                # a smaller kitchen in the demo, so the capacity warning has
                # something real to say
                max_guests=(350 if name.startswith("Marwar") else max_guests),
                team_size=team,
                max_events_per_day=per_day,
                service_cities="Jaipur, Udaipur, Jodhpur" if city == "Jaipur" else "Udaipur, Jaipur",
                lead_time_days=notice,
                min_order_value=None,
                capabilities="\n".join(caps) or None,
                password_hash=demo_hash if name in PORTAL_VENDORS else None,
            )
        )
    for v in vendors:
        if v.name in NEW_VENDORS:
            continue
        v.on_time_count = int(v.jobs_completed * random.uniform(0.7, 1.0))
    db.add_all(vendors)
    db.commit()

    # past weddings are booked from the vendors the agency already knew
    by_cat: dict[str, list[Vendor]] = {}
    for v in vendors:
        if v.name not in NEW_VENDORS:
            by_cat.setdefault(v.category, []).append(v)

    planners = [s for s in staff if s.role == "Manager"]

    # ---- 25 weddings across the season -----------------------------------
    # spread from 5 months ago to 7 months ahead so the dashboard shows
    # completed, in-flight and upcoming work at once
    weddings: list[Wedding] = []
    for i, (a, b) in enumerate(COUPLES):
        offset = -150 + i * 11          # roughly every 11 days
        day1 = today + timedelta(days=offset)
        package = (
            PackageType.DAY_OF if i % 4 == 3 else PackageType.FULL_SERVICE
        )
        guests = random.choice([350, 400, 420, 450, 500, 380])
        # A luxury three-day wedding is contracted at several crores for
        # full service; a day-of engagement is a coordination fee only.
        value = (
            random.randint(150, 320) * 100000
            if package == PackageType.FULL_SERVICE
            else random.randint(14, 26) * 100000
        )

        if offset < -5:
            status = WeddingStatus.COMPLETED
        elif offset <= 3:
            status = WeddingStatus.EXECUTION
        else:
            status = WeddingStatus.PLANNING

        city = random.choice(["Jaipur", "Udaipur"])
        w = Wedding(
            code=f"RK-{day1.year}-{i + 1:03d}",
            couple_name=f"{a} & {b}",
            package_type=package,
            status=status,
            city=city,
            venue=random.choice(VENUES[city]),
            theme=random.choice(THEMES),
            day1_date=day1,
            day2_date=day1 + timedelta(days=1),
            day3_date=day1 + timedelta(days=2),
            guest_count=guests,
            package_value=float(value),
            budget_cap=float(value) * random.uniform(1.0, 1.12),
            planner_id=planners[i % len(planners)].id,
            assigned_at=datetime.combine(day1 - timedelta(days=200), time(10, 0)),
        )
        db.add(w)
        weddings.append(w)
    db.commit()

    # ---- plans, contracts, costs ----------------------------------------
    for i, w in enumerate(weddings):
        generate_plan(db, w)

        # complete tasks in proportion to how far along the wedding is
        if w.status == WeddingStatus.COMPLETED:
            ratio = 1.0
        elif w.status == WeddingStatus.EXECUTION:
            ratio = 0.85
        else:
            days_out = (w.day1_date - today).days
            ratio = max(0.05, min(0.7, 1 - days_out / 200))
        tasks = sorted(w.tasks, key=lambda t: t.sequence)
        for t in tasks[: int(len(tasks) * ratio)]:
            t.stage = TaskStage.DONE
            t.completed_at = datetime.utcnow()
        for t in tasks[int(len(tasks) * ratio) : int(len(tasks) * ratio) + 3]:
            t.stage = TaskStage.IN_PROGRESS
        # the couple's own to-dos: done once their date has passed
        for t in w.tasks:
            if t.for_client:
                past = t.due_date and t.due_date < today
                t.stage = TaskStage.DONE if past else TaskStage.TO_PLAN
                t.completed_at = datetime.utcnow() if past else None

        # milestones
        for m in w.milestones:
            if m.due_date < today:
                m.status = MilestoneStatus.PAID
                m.paid_at = datetime.combine(m.due_date, time(12, 0))
                m.reference = f"RCPT-{m.id:05d}"
            elif m.due_date < today + timedelta(days=20):
                m.status = MilestoneStatus.INVOICED

        # vendor contracts — roughly 18 categories for a full-service wedding
        categories = (
            list(by_cat.keys())
            if w.package_type == PackageType.FULL_SERVICE
            else ["Caterer", "Decorator", "DJ", "Photographer", "Makeup Artist"]
        )
        # Draw a target margin per wedding so that a handful of the season
        # genuinely loses money — which is precisely the question the
        # founder sits down to ask.
        target_margin = max(-0.14, min(0.37, random.gauss(0.19, 0.13)))
        est_labour = 120000.0
        base = max(
            w.package_value * (1 - target_margin) - est_labour,
            w.package_value * 0.30,
        )
        weights = [random.uniform(0.5, 2.0) for _ in categories]
        total_w = sum(weights)
        for cat, weight in zip(categories, weights):
            vendor = random.choice(by_cat[cat])
            agreed = round(base * weight / total_w, -2)
            done_job = w.status == WeddingStatus.COMPLETED
            contract = VendorContract(
                wedding_id=w.id,
                vendor_id=vendor.id,
                category=cat,
                agreed_amount=float(agreed),
                # the vendor's own cost — private to their portal
                vendor_cost=round(agreed * extra.uniform(0.58, 0.82), -2),
                progress_pct=100 if done_job else None,
                work_status="Completed" if done_job else None,
                advance_paid=round(agreed * 0.3, 2),
                advance_paid_at=datetime.combine(
                    w.day1_date - timedelta(days=40), time(10, 0)
                ),
                signed_on=w.day1_date - timedelta(days=60),
            )
            db.add(contract)

        # planning hours
        for s in random.sample(staff, 3):
            db.add(
                TimeLog(
                    wedding_id=w.id,
                    staff_id=s.id,
                    hours=round(random.uniform(18, 70), 1),
                    log_date=w.day1_date - timedelta(days=random.randint(5, 90)),
                    description="Planning, coordination and site visits",
                )
            )
    db.commit()

    # ---- run sheets for completed weddings -------------------------------
    # Punctuality on the vendor scorecard has to come from somewhere real, so
    # past weddings carry their run sheet with actual check-in times. Each
    # vendor has its own habit of being late, which is what the scorecard is
    # supposed to surface.
    lateness = {
        v.id: random.choices([0, 1, 2], weights=[78, 16, 6])[0]
        for v in vendors if v.name not in NEW_VENDORS
    }
    for w in weddings:
        if w.status != WeddingStatus.COMPLETED:
            continue
        generate_runsheet(db, w)
        for item in w.runsheet:
            day_date = {1: w.day1_date, 2: w.day2_date, 3: w.day3_date}[item.day_number]
            slip = lateness.get(item.vendor_id, 0)
            late = slip and random.random() < (0.35 if slip == 1 else 0.6)
            if late:
                item.status = RunSheetStatus.LATE
                item.checked_in_at = None
            else:
                item.status = RunSheetStatus.ARRIVED
                item.checked_in_at = datetime.combine(
                    day_date, item.start_time
                ) + timedelta(minutes=random.randint(0, 8))
    db.commit()

    # ---- bills for completed weddings ------------------------------------
    for w in weddings:
        if w.status != WeddingStatus.COMPLETED:
            continue
        for c in w.contracts:
            # most vendors bill what they agreed; a few do not
            roll = random.random()
            if roll < 0.70:
                billed = c.agreed_amount
            elif roll < 0.88:
                billed = round(c.agreed_amount * random.uniform(1.03, 1.15), 2)
            else:
                billed = round(c.agreed_amount * random.uniform(0.88, 0.98), 2)

            bill = VendorBill(
                contract_id=c.id,
                bill_number=f"INV/{c.vendor_id:02d}/{w.id:03d}",
                billed_amount=billed,
                bill_date=w.day3_date + timedelta(days=random.randint(1, 6)),
                due_date=w.day3_date + timedelta(days=random.randint(15, 35)),
            )
            # settle most of the older ones
            if (today - w.day3_date).days > 30 and roll < 0.70:
                bill.paid_amount = round(billed - c.advance_paid, 2)
                bill.paid_at = datetime.combine(
                    w.day3_date + timedelta(days=20), time(15, 0)
                )
                bill.payment_reference = f"UTR-{c.id:06d}"
            db.add(bill)
    db.commit()

    # ---- the wedding happening right now ---------------------------------
    # Day 3 is today: the actual wedding day, which is where the brief's
    # story happens — the DJ arrives late, the florist needs a generator and
    # the bride's car is stuck in traffic.
    live = min(weddings, key=lambda w: abs((w.day1_date - today).days))
    live.day3_date = today
    live.day2_date = today - timedelta(days=1)
    live.day1_date = today - timedelta(days=2)
    live.status = WeddingStatus.EXECUTION
    # the demo vendors work this wedding, so their portals have a live job
    featured = {v.category: v for v in vendors if v.name in PORTAL_VENDORS}
    for c in live.contracts:
        if c.category in featured:
            c.vendor_id = featured[c.category].id
    db.commit()
    generate_runsheet(db, live)

    # Days 1 and 2 ran fine — everyone checked in.
    for item in live.runsheet:
        if item.day_number in (1, 2):
            slot_date = live.day1_date if item.day_number == 1 else live.day2_date
            item.status = RunSheetStatus.ARRIVED
            item.checked_in_at = datetime.combine(
                slot_date, item.start_time
            ) + timedelta(minutes=random.randint(0, 7))

    # Day 3: the early slots are handled; the trouble spots are left open so
    # the board turns red on its own as the clock passes them.
    trouble = {
        "Reception stage reset and lighting": "Florist needs an extra generator "
        "for the ballroom installation — electrician called.",
        "Couple's reception entry": "DJ console still not set up.",
        "Baraat procession and groom's arrival": "Groom's car held up in traffic "
        "near the city gate.",
    }
    for item in sorted(live.runsheet, key=lambda i: i.start_time):
        if item.day_number != 3:
            continue
        if item.title in trouble:
            item.notes = trouble[item.title]
            item.grace_minutes = 10
            continue
        # everything already due when the server starts has been handled —
        # so the only red on the board is the brief's own trouble
        cutoff = max(time(9, 30), (datetime.now() - timedelta(minutes=15)).time())
        if item.start_time < cutoff:
            # the original morning draws stay on the main stream
            r = random if item.start_time < time(9, 30) else extra
            item.status = RunSheetStatus.ARRIVED
            item.checked_in_at = datetime.combine(
                today, item.start_time
            ) + timedelta(minutes=r.randint(0, 6))
    db.commit()

    # Keep each vendor's headline on-time figure in step with the run-sheet
    # evidence, so the quote screen and the scorecard never disagree about
    # the same vendor.
    for v in vendors:
        slots = [i for w in weddings for i in w.runsheet if i.vendor_id == v.id]
        if slots:
            v.jobs_completed = len(slots)
            v.on_time_count = sum(
                1 for i in slots if i.status != RunSheetStatus.LATE
            )
    db.commit()

    # ---- a live RFQ mid-comparison: three caterers, one decision ---------
    upcoming = [w for w in weddings if w.status == WeddingStatus.PLANNING]
    target = upcoming[len(upcoming) // 2] if upcoming else weddings[-1]

    # This wedding's caterer is the decision that is still open, so it must not
    # already have one contracted — otherwise awarding the RFQ would leave two
    # caterers on the same wedding.
    for c in list(target.contracts):
        if c.category == "Caterer":
            db.delete(c)
    db.commit()

    rfq = QuoteRequest(
        wedding_id=target.id,
        category="Caterer",
        title=f"Catering for {target.guest_count} guests — 3 days, regional menu",
        scope=(
            "Welcome drinks, Mehendi lunch, Sangeet dinner, wedding lunch and "
            "reception dinner. Regional Rajasthani menu with live counters. "
            "Service staff, crockery and chafing equipment included."
        ),
        guest_count=target.guest_count,
        needed_by=target.day1_date - timedelta(days=75),
        status=RFQStatus.COMPARING,
    )
    db.add(rfq)
    db.flush()

    g = target.guest_count
    caterers = by_cat["Caterer"] + [v for v in vendors if v.name in NEW_VENDORS and v.category == "Caterer"]

    quote_specs = [
        {
            "vendor": caterers[0],
            "gst": 18.0,
            "logistics": 45000.0,
            "extra_hour": 18000.0,
            "lines": [
                ("Welcome drinks and canapés (Day 1)", UnitOfMeasure.PER_PLATE, 1, 320),
                ("Mehendi lunch — regional thali", UnitOfMeasure.PER_PLATE, 1, 1150),
                ("Sangeet dinner — 9 live counters", UnitOfMeasure.PER_PLATE, 1, 1650),
                ("Wedding lunch — traditional Rajasthani", UnitOfMeasure.PER_PLATE, 1, 1400),
                ("Reception dinner — multi-cuisine", UnitOfMeasure.PER_PLATE, 1, 1750),
                ("Service staff (3 days, 40 persons)", UnitOfMeasure.FLAT, 1, 185000),
            ],
            "inclusions": "Crockery and cutlery\nChafing and live-counter equipment\n"
                          "40 uniformed service staff\nDessert counter\nJain and vegan menus\n"
                          "Menu tasting for 6 persons",
            "exclusions": "Alcohol service\nSilver-service upgrade",
            "notes": "Rate held for 15 days. Menu tasting available at Jaipur kitchen.",
        },
        {
            "vendor": caterers[1],
            "gst": 18.0,
            "logistics": 0.0,
            "extra_hour": 25000.0,
            "lines": [
                ("Welcome drinks (Day 1)", UnitOfMeasure.PER_PLATE, 1, 260),
                ("Mehendi lunch — regional thali", UnitOfMeasure.PER_PLATE, 1, 1050),
                ("Sangeet dinner — 6 live counters", UnitOfMeasure.PER_PLATE, 1, 1480),
                ("Wedding lunch — traditional Rajasthani", UnitOfMeasure.PER_PLATE, 1, 1320),
                ("Reception dinner — multi-cuisine", UnitOfMeasure.PER_PLATE, 1, 1590),
                ("Service staff (3 days, 28 persons)", UnitOfMeasure.FLAT, 1, 140000),
            ],
            "inclusions": "Crockery and cutlery\nChafing equipment\n28 service staff\n"
                          "Jain menu",
            "exclusions": "Live-counter equipment hire\nDessert counter\nVegan menu\n"
                          "Menu tasting\nTransport and setup (billed at actuals)\n"
                          "Alcohol service",
            "notes": "Transport and setup billed separately at actuals — typically "
                     "INR 60,000–90,000 for a Udaipur venue.",
        },
        {
            "vendor": caterers[2],
            "gst": 5.0,
            "logistics": 75000.0,
            "extra_hour": 15000.0,
            "lines": [
                ("Welcome drinks and canapés (Day 1)", UnitOfMeasure.PER_PLATE, 1, 340),
                ("Mehendi lunch — regional thali", UnitOfMeasure.PER_PLATE, 1, 1200),
                ("Sangeet dinner — 10 live counters", UnitOfMeasure.PER_PLATE, 1, 1720),
                ("Wedding lunch — traditional Rajasthani", UnitOfMeasure.PER_PLATE, 1, 1450),
                ("Reception dinner — multi-cuisine", UnitOfMeasure.PER_PLATE, 1, 1820),
                ("Service staff (3 days, 45 persons)", UnitOfMeasure.FLAT, 1, 210000),
            ],
            "inclusions": "Crockery and cutlery\nChafing and live-counter equipment\n"
                          "45 uniformed service staff\nDessert counter\nJain and vegan menus\n"
                          "Menu tasting for 10 persons\nOn-site executive chef",
            "exclusions": "Alcohol service",
            "notes": "Composition GST at 5%. Premium ingredient sourcing.",
        },
        {
            # cheapest on paper and missing half the scope — the reason the
            # couple is sent the top three by value, not the three cheapest
            "vendor": next(v for v in caterers if v.name.startswith("Saffron")),
            "gst": 18.0,
            "logistics": 30000.0,
            "extra_hour": 30000.0,
            "lines": [
                ("Welcome drinks (Day 1)", UnitOfMeasure.PER_PLATE, 1, 240),
                ("Mehendi lunch — buffet", UnitOfMeasure.PER_PLATE, 1, 980),
                ("Sangeet dinner — 4 live counters", UnitOfMeasure.PER_PLATE, 1, 1390),
                ("Wedding lunch — traditional", UnitOfMeasure.PER_PLATE, 1, 1250),
                ("Reception dinner — multi-cuisine", UnitOfMeasure.PER_PLATE, 1, 1520),
                ("Service staff (3 days, 22 persons)", UnitOfMeasure.FLAT, 1, 110000),
            ],
            "inclusions": "Crockery and cutlery\n22 service staff",
            "exclusions": "Chafing equipment\nLive-counter equipment\nDessert counter\n"
                          "Jain menu\nVegan menu\nMenu tasting\nAlcohol service",
            "notes": "Equipment hire quoted separately on request.",
        },
    ]

    for spec in quote_specs:
        q = Quote(
            rfq_id=rfq.id,
            vendor_id=spec["vendor"].id,
            status=QuoteStatus.RECEIVED,
            gst_percent=spec["gst"],
            logistics_fee=spec["logistics"],
            extra_hour_rate=spec["extra_hour"],
            inclusions=spec["inclusions"],
            exclusions=spec["exclusions"],
            notes=spec["notes"],
            received_at=datetime.utcnow() - timedelta(
                days=(extra if spec["vendor"].name in NEW_VENDORS else random).randint(1, 4)
            ),
        )
        db.add(q)
        db.flush()
        for desc, unit, qty, price in spec["lines"]:
            db.add(
                QuoteLine(
                    quote_id=q.id,
                    description=desc,
                    unit=unit,
                    quantity=float(qty if unit == UnitOfMeasure.FLAT else g),
                    unit_price=float(price),
                )
            )
    db.commit()

    # Already sent to the couple, still undecided — so the brief's scene
    # ("when the couple picks a winner") is live the moment the app opens and
    # a judge can be the couple and pick.  Four came in; the couple gets the
    # best three by value.
    db.refresh(rfq)
    rfq.shortlist = ",".join(str(i) for i in rank_quotes(build_comparison(db, rfq))[:3])
    rfq.choice_token = secrets.token_urlsafe(24)[:32]
    rfq.shared_at = datetime.utcnow() - timedelta(days=1)
    db.commit()
    DEMO_LINKS["choose"] = f"/choose/{rfq.choice_token}"
    _still_open(target, "caterer", "Top three with the couple — waiting for their pick.", 7)

    # ---- the demo manager runs the weddings with a story ----------------
    lead_manager = planners[0]
    for w in (live, target):
        _reassign(w, lead_manager.id)
    db.commit()

    # ---- a decorator request waiting on vendors ---------------------------
    # Gulmohar has not priced it yet: sign in as Gulmohar and price it, then
    # watch it land in Aarav's comparison.
    aarav_next = [
        w for w in weddings
        if w.status == WeddingStatus.PLANNING and w.id != target.id
        and 40 <= (w.day1_date - today).days <= 160
    ]
    deco_w = aarav_next[0] if aarav_next else target
    _reassign(deco_w, lead_manager.id)
    for c in list(deco_w.contracts):
        if c.category == "Decorator":
            db.delete(c)
    db.commit()
    decorators = by_cat["Decorator"]
    deco = QuoteRequest(
        wedding_id=deco_w.id,
        category="Decorator",
        title=f"Décor for all three days — {deco_w.theme or 'heritage'} theme",
        scope=(
            "Day 1 Mehendi courtyard (floral swings, low seating). Day 2 Sangeet "
            "stage with LED backdrop and dance floor. Day 3 mandap, varmala "
            "stage, reception stage reset and entrance installation. All "
            "florals fresh; palette to match the couple's mood board."
        ),
        guest_count=deco_w.guest_count,
        needed_by=today + timedelta(days=5),
        status=RFQStatus.SENT,
    )
    db.add(deco)
    db.flush()
    for v in decorators:
        q = Quote(rfq_id=deco.id, vendor_id=v.id, status=QuoteStatus.PENDING)
        db.add(q)
        db.flush()
        if v.name.startswith("Pink City"):
            q.status = QuoteStatus.RECEIVED
            q.received_at = datetime.utcnow() - timedelta(hours=20)
            q.gst_percent = 18.0
            q.logistics_fee = 60000.0
            q.inclusions = "Mandap design\nSangeet stage\nFresh florals\nLighting"
            q.exclusions = "LED backdrop\nDance floor\nEntrance installation"
            q.notes = "LED wall can be arranged through a partner at extra cost."
            for desc, price in [
                ("Mehendi courtyard décor (Day 1)", 285000),
                ("Sangeet stage and seating (Day 2)", 420000),
                ("Wedding mandap and varmala stage (Day 3)", 640000),
                ("Reception stage reset (Day 3)", 210000),
            ]:
                db.add(QuoteLine(quote_id=q.id, description=desc,
                                 unit=UnitOfMeasure.FLAT, quantity=1, unit_price=price))
    deco.status = RFQStatus.COMPARING
    _still_open(deco_w, "decorator", "Quotes coming in — one priced, two still to reply.", 10)
    db.commit()

    # ---- vendor calendars -------------------------------------------------
    # Lake Palace Events is away on day two of the décor wedding, so the
    # manager's invite screen shows the conflict instead of a wasted request.
    by_name = {v.name: v for v in vendors}
    marks = [
        ("Lake Palace Events", deco_w.day2_date, "Unavailable", "Booked for a corporate gala"),
        ("Gulmohar Decor Studio", today + timedelta(days=9), "Unavailable", "Studio closed — Diwali"),
        ("Gulmohar Decor Studio", today + timedelta(days=10), "Unavailable", "Studio closed — Diwali"),
        ("Gulmohar Decor Studio", today + timedelta(days=17), "Limited", "Half the crew on another site"),
        ("Rajputana Royal Caterers", today + timedelta(days=12), "Limited", "Kitchen at 50%"),
        ("Frames Forever", today + timedelta(days=22), "Unavailable", "Destination shoot in Goa"),
    ]
    for name, day, status, note in marks:
        if name in by_name:
            db.add(VendorAvailability(vendor_id=by_name[name].id, day=day,
                                      status=status, note=note))
    db.commit()

    # ---- what vendors have told their managers ---------------------------
    def say(c, status, pct, msg, days_ago=0.0, expected=None, seen=False):
        u = VendorUpdate(
            contract_id=c.id, vendor_id=c.vendor_id, wedding_id=c.wedding_id,
            status=status, progress_pct=pct, message=msg, expected_by=expected,
            created_at=datetime.utcnow() - timedelta(days=days_ago),
            acknowledged_at=(datetime.utcnow() - timedelta(days=days_ago) + timedelta(minutes=20))
            if seen else None,
        )
        db.add(u)
        c.progress_pct, c.work_status = pct, status

    live_by_cat = {c.category: c for c in live.contracts}
    if "Decorator" in live_by_cat:
        say(live_by_cat["Decorator"], "On Track", 90,
            "Mandap and varmala stage up. Reception entrance going in after lunch.",
            days_ago=0.1, seen=True)
    if "DJ" in live_by_cat:
        say(live_by_cat["DJ"], "Delayed", 55,
            "Reception console held up — the truck is stuck at the city gate. "
            "Backup console is on its way from our Jaipur store.",
            days_ago=0.04, expected=today)
    if "Photographer" in live_by_cat:
        say(live_by_cat["Photographer"], "On Track", 70,
            "Days 1 and 2 covered, 2,300 frames backed up. Second shooter on site for the pheras.",
            days_ago=0.3, seen=True)
    if "Florist" in live_by_cat:
        say(live_by_cat["Florist"], "Blocked", 60,
            "Ballroom installation needs a generator — the venue supply trips "
            "with the lights on. Waiting on the electrician.",
            days_ago=0.06)

    soon = sorted(
        (w for w in weddings if w.planner_id == lead_manager.id
         and w.status == WeddingStatus.PLANNING and w.day1_date > today),
        key=lambda w: w.day1_date,
    )
    if soon:
        nxt = {c.category: c for c in soon[0].contracts}
        if "Florist" in nxt:
            say(nxt["Florist"], "Delayed", 30,
                "Imported white orchids held at customs in Delhi. Release expected "
                "Monday — local tuberose as a fallback if not.",
                days_ago=1, expected=soon[0].day1_date - timedelta(days=4))
        if "Photographer" in nxt:
            say(nxt["Photographer"], "On Track", 25,
                "Pre-wedding shoot done at Nahargarh. Shot list for the three days "
                "shared with the couple.", days_ago=2, seen=True)
        if "Caterer" in nxt:
            say(nxt["Caterer"], "On Track", 40,
                "Tasting done, menu signed off by the bride's family. Jain counter confirmed.",
                days_ago=3, seen=True)
    db.commit()

    # ---- not every manager is having a good week -------------------------
    # Isha has slipped on a few things and a client payment is overdue;
    # Rohan is stuck waiting on a venue.  The founder's screen should show
    # that without anyone having to say it.
    def slip(manager, n_overdue, n_blocked=0, overdue_payment=False):
        mine = sorted(
            (w for w in weddings if w.planner_id == manager.id
             and w.status == WeddingStatus.PLANNING and w.day1_date > today),
            key=lambda w: w.day1_date,
        )
        if not mine:
            return
        w = mine[0]
        late = [t for t in sorted(w.tasks, key=lambda t: t.sequence, reverse=True)
                if t.stage == _TaskStage.DONE and t.due_date and t.due_date < today
                and not t.for_client]
        for t in late[:n_overdue]:
            t.stage = _TaskStage.IN_PROGRESS if t.id % 2 else _TaskStage.TO_PLAN
            t.completed_at = None
        for t in late[n_overdue:n_overdue + n_blocked]:
            t.stage = _TaskStage.BLOCKED
            t.completed_at = None
            t.notes = "Waiting on the venue to confirm the blackout dates."
        if overdue_payment:
            for m in w.milestones:
                if m.status == MilestoneStatus.PAID and m.due_date < today - timedelta(days=3):
                    m.status, m.paid_at, m.reference = MilestoneStatus.INVOICED, None, None
                    break

    if len(planners) >= 3:
        slip(planners[1], 8, overdue_payment=True)   # Isha
        slip(planners[2], 2, n_blocked=2)            # Rohan
        slip(planners[0], 1, overdue_payment=True)   # Aarav — one thing to chase
    db.commit()

    # ---- weddings the founder still has to hand out ----------------------
    far = sorted(
        (w for w in weddings if w.status == WeddingStatus.PLANNING
         and w.id not in (target.id, deco_w.id)),
        key=lambda w: w.day1_date,
        reverse=True,
    )[:2]
    for w in far:
        _reassign(w, None)
    db.commit()

    # ---- open enquiries in the pipeline ----------------------------------
    pipeline = [
        ("Nikhil", "Aarohi", LeadStage.NEW, LeadSource.INSTAGRAM, 420, 3200000,
         "Royal Rajputana heritage", 210),
        ("Samar", "Ira", LeadStage.CONTACTED, LeadSource.WHATSAPP, 380, 2800000,
         "Pastel garden romance", 240),
        ("Jay", "Meher", LeadStage.MEETING, LeadSource.REFERRAL, 450, 4100000,
         "Beach chic", 190),
        ("Advait", "Suhani", LeadStage.AGREEMENT_SENT, LeadSource.CALL, 400, 3500000,
         "Mughal courtyard", 260),
        ("Reyansh", "Zara", LeadStage.NEW, LeadSource.WEBSITE, 500, 5200000,
         "Jewel-tone maximalist", 300),
    ]
    for idx, (a, b, stage, source, guests, budget, theme, days_out) in enumerate(pipeline):
        lead = Lead(
            partner_a=a,
            partner_b=b,
            phone=f"+91 9{random.randint(100000000, 999999999)}",
            email=f"{a.lower()}.{b.lower()}@email.com",
            rough_date=today + timedelta(days=days_out),
            guest_count=guests,
            theme=theme,
            max_budget=float(budget),
            preferred_city=random.choice(["Jaipur", "Udaipur"]),
            source=source,
            stage=stage,
            owner_id=planners[idx % len(planners)].id,
            notes="Winter destination wedding. Enquiry captured on first contact.",
            created_at=datetime.utcnow() - timedelta(days=random.randint(1, 25)),
        )
        db.add(lead)
        db.flush()

        if stage == LeadStage.AGREEMENT_SENT:
            # The real template, not a placeholder — a judge opening this link
            # should read the same terms a couple would.
            from .routers.leads import AGREEMENT_TEMPLATE

            fee = float(budget) * 0.11
            token = secrets.token_urlsafe(24)
            db.add(
                Agreement(
                    lead_id=lead.id,
                    token=token,
                    body=AGREEMENT_TEMPLATE.format(
                        couple=f"{a} & {b}",
                        package="Full-Service Wedding",
                        event_date=(today + timedelta(days=days_out)).strftime(
                            "%d %B %Y"
                        ),
                        guests=guests,
                        theme=theme,
                        fee=fee,
                    ),
                    package_type=PackageType.FULL_SERVICE,
                    quoted_fee=fee,
                )
            )
    db.commit()

    # ---- an unbilled extra on a completed wedding ------------------------
    done = [w for w in weddings if w.status == WeddingStatus.COMPLETED]
    if done:
        w = done[-1]
        caterer_contract = next(
            (c for c in w.contracts if c.category == "Caterer"), None
        )
        if caterer_contract:
            rate = round(caterer_contract.agreed_amount / max(w.guest_count, 1), 2)
            w.actual_guest_count = w.guest_count + 60
            db.add(
                ChangeOrder(
                    wedding_id=w.id,
                    vendor_id=caterer_contract.vendor_id,
                    description=f"60 additional covers above contracted headcount "
                    f"({w.guest_count} → {w.guest_count + 60})",
                    unit=UnitOfMeasure.PER_PLATE,
                    quantity=60,
                    vendor_unit_cost=rate,
                    client_unit_price=round(rate * 1.18, 2),
                    approved=True,
                    billed_to_client=False,
                )
            )
        db.commit()

    # ---- the couples who sign in to their own portal ---------------------
    seed_couples(db)


# --------------------------------------------------------------------------
# The couples who sign in
# --------------------------------------------------------------------------
#: A signature for the agreements the demo couples signed before the demo
#: began — a drawn line, the same kind of image the signing pad produces.
_SIGNATURE = (
    "data:image/svg+xml;base64,"
    + __import__("base64").b64encode(
        b"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 90'>"
        b"<path d='M12 62 C 28 14, 48 12, 54 56 S 78 82, 94 42 S 118 18, 130 58 "
        b"C 140 78, 160 30, 176 52 S 206 72, 228 36 S 262 40, 300 48' fill='none' "
        b"stroke='#1d1a24' stroke-width='2.6' stroke-linecap='round'/></svg>"
    ).decode()
)


def _couple_names(couple: str) -> tuple[str, str]:
    a, _, b = couple.partition(" & ")
    return a.strip() or couple, b.strip() or couple


def _ensure_couple_tasks(db: Session, w: Wedding) -> None:
    """Weddings from before the couple's to-dos existed get them now."""
    if any(t.for_client for t in w.tasks):
        return
    today = date.today()
    for i, (phase, title, offset) in enumerate(COUPLE_TASKS):
        due = w.day1_date + timedelta(days=offset)
        past = due < today
        db.add(Task(
            wedding_id=w.id, title=title, phase=phase, owner_id=w.planner_id,
            due_date=due, sequence=900 + i, for_client=True,
            stage=_TaskStage.DONE if past else _TaskStage.TO_PLAN,
            completed_at=datetime.utcnow() if past else None,
        ))


def _lead_for(db: Session, w: Wedding) -> Lead:
    """The enquiry a wedding came from — made up for a seeded wedding that
    never had one, with the agreement they signed."""
    if w.lead:
        return w.lead
    a, b = _couple_names(w.couple_name)
    lead = Lead(
        partner_a=a, partner_b=b,
        phone=f"+91 98{extra.randint(10000000, 99999999)}",
        email=f"{b.lower()}.{a.lower()}@email.com",
        rough_date=w.day1_date, guest_count=w.guest_count, theme=w.theme,
        max_budget=w.budget_cap or w.package_value, preferred_city=w.city,
        package_interest=w.package_type, source=LeadSource.REFERRAL,
        stage=LeadStage.WON, owner_id=w.planner_id,
        events_wanted="Mehendi, Sangeet, Wedding, Reception",
        services_wanted="Venue, Catering, Décor, Photography, Entertainment",
        created_at=datetime.combine(w.day1_date - timedelta(days=200), time(11, 30)),
    )
    db.add(lead)
    db.flush()
    from .routers.leads import AGREEMENT_TEMPLATE

    sent = datetime.combine(w.day1_date - timedelta(days=190), time(16, 0))
    db.add(Agreement(
        lead_id=lead.id, token=secrets.token_urlsafe(24),
        body=AGREEMENT_TEMPLATE.format(
            couple=w.couple_name, package=w.package_type.value,
            event_date=w.day1_date.strftime("%d %B %Y"), guests=w.guest_count,
            theme=w.theme or "To be finalised", fee=w.package_value,
        ),
        package_type=w.package_type, quoted_fee=w.package_value,
        sent_at=sent, signed_at=sent + timedelta(days=3, hours=2),
        signer_name=w.couple_name, signature_png=_SIGNATURE, signer_ip="49.36.112.18",
    ))
    w.lead_id = lead.id
    db.flush()
    return lead


def _thread(db: Session, client: ClientAccount, w: Wedding | None, kind: str, topic: str,
            subject: str, said: list[tuple[str, str, float]], status: str = "Open",
            rating: int | None = None, rating_note: str | None = None) -> None:
    """A query with its conversation: said = [(who, text, hours_ago)]."""
    planner = (w.planner if w else None) or client.lead.owner
    first = datetime.utcnow() - timedelta(hours=said[0][2])
    last = datetime.utcnow() - timedelta(hours=said[-1][2])
    t = ClientTicket(
        client_id=client.id, lead_id=client.lead_id, wedding_id=w.id if w else None,
        kind=kind, topic=topic, subject=subject, status=status,
        priority="Urgent" if kind == "Complaint" else "Normal",
        assigned_to_id=planner.id if planner else None,
        created_at=first, updated_at=last,
        resolved_at=last if status == "Resolved" else None,
        rating=rating, rating_note=rating_note,
    )
    db.add(t)
    db.flush()
    for who, text, ago in said:
        staff = who == "staff"
        db.add(TicketMessage(
            ticket_id=t.id, author_kind="staff" if staff else "client",
            author_name=(planner.name if staff and planner else client.name),
            staff_id=planner.id if staff and planner else None,
            body=text, created_at=datetime.utcnow() - timedelta(hours=ago),
        ))


def seed_couples(db: Session) -> int:
    """Three couples at three points in the journey, each with a login:

      * a couple 70-odd days out with a caterer to choose,
      * the couple whose wedding is happening today,
      * a couple who has not signed their agreement yet.

    Idempotent, and works on a database seeded by an older version.
    """
    if db.query(ClientAccount).count():
        return 0
    today = date.today()
    demo_hash = hash_password(DEMO_PASSWORD)
    weddings = db.query(Wedding).order_by(Wedding.day1_date).all()
    if not weddings:
        return 0

    live = next((w for w in weddings if w.day1_date <= today <= w.day3_date), None)
    rfq = next((r for r in db.query(QuoteRequest).all() if r.awaiting_couple), None)
    planning = rfq.wedding if rfq else next(
        (w for w in weddings if w.status == WeddingStatus.PLANNING
         and (w.day1_date - today).days > 30), None)

    made = 0
    accounts: dict[str, ClientAccount] = {}
    for key, w in (("planning", planning), ("live", live)):
        if not w:
            continue
        lead = _lead_for(db, w)
        _ensure_couple_tasks(db, w)
        if key == "planning" and not w.runsheet:
            generate_runsheet(db, w)
        a, b = _couple_names(w.couple_name)
        acct = ClientAccount(
            lead_id=lead.id, name=b, email=f"{b.lower()}.{a.lower()}@email.com",
            phone=lead.phone, password_hash=demo_hash,
            created_at=lead.created_at, last_login_at=datetime.utcnow() - timedelta(days=2),
        )
        db.add(acct)
        db.flush()
        accounts[key] = acct
        made += 1

    pending = next(
        (l for l in db.query(Lead).order_by(Lead.id).all()
         if l.agreement and not l.agreement.is_signed and not l.wedding and not l.client_account),
        None,
    )
    if pending:
        acct = ClientAccount(
            lead_id=pending.id, name=pending.partner_b,
            email=f"{pending.partner_b.lower()}.{pending.partner_a.lower()}@email.com",
            phone=pending.phone, password_hash=demo_hash, created_at=pending.created_at,
        )
        db.add(acct)
        db.flush()
        accounts["pending"] = acct
        made += 1
    db.commit()

    # ---- what they have asked -------------------------------------------
    if "planning" in accounts:
        c, w = accounts["planning"], planning
        partner = _couple_names(w.couple_name)[0]
        _thread(db, c, w, "Query", "Vendors", "Can we have a Jain counter at the Sangeet?", [
            ("client", f"{partner}'s grandparents are Jain — can there be a separate Jain counter "
                       "at the Sangeet dinner, not just a few dishes?", 120),
            ("staff", "Yes. All three caterers on your shortlist can run a dedicated Jain "
                      "counter with its own cooks. I've noted it against whichever one you pick.", 117),
            ("client", "Perfect, thank you!", 116),
        ], status="Resolved", rating=5, rating_note="Answered within the hour.")
        _thread(db, c, w, "Change request", "Schedule", "Move the Mehendi to the poolside lawn?", [
            ("client", "We saw the poolside lawn on the site visit — could the Mehendi be there "
                       "instead of the courtyard?", 30),
            ("staff", "We can. The lawn takes 180 seated comfortably — your list for Day 1 is 210. "
                      "Shall I plan it with standing counters for the extra thirty, or keep the "
                      "courtyard?", 26),
        ], status="In Progress")
        db.commit()
    if "live" in accounts:
        c, w = accounts["live"], live
        _thread(db, c, w, "Complaint", "Schedule", "Ballroom lights keep tripping at the sound check", [
            ("client", "The ballroom lights went off twice during the sound check this afternoon. "
                       "The reception is tonight — please tell us this will be fixed.", 0.8),
        ])
        db.commit()
    if "pending" in accounts:
        c = accounts["pending"]
        _thread(db, c, None, "Query", "Payments", "What does the booking amount cover?", [
            ("client", "Before we sign — is the 25% booking amount refundable if the venue "
                       "falls through, and what does it cover?", 5),
        ])
        db.commit()
    return made
