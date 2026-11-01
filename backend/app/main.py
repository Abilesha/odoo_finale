"""The Royal Knot — wedding planning management system.

One FastAPI process serves both the JSON API and the built React frontend, so
the whole thing deploys as a single container with a single URL.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("royalknot")

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from .db import Base, SessionLocal, engine
from .routers import (
    assistant,
    analytics,
    auth,
    client_portal,
    finance,
    leads,
    operations,
    procurement,
    profile,
    share,
    team,
    tickets,
    vendor_portal,
    weddings,
    workspace,
)
from .services.auth import (
    CAP_LEADS,
    CAP_MONEY,
    CAP_RUNDAY,
    CAP_SEASON,
    CAP_TEAM,
    CAP_VENDORS,
    CAP_WEDDINGS,
    current_user,
    require,
)

app = FastAPI(
    title="The Royal Knot — Wedding Planning Management System",
    description=(
        "The digital backbone of a wedding planning agency: from the first "
        "enquiry to the final vendor payment."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public — no account. The link itself is the credential: the couple signs
# their agreement, picks their vendor, and whoever the founder shared the
# season's numbers with reads them. None of these people are staff and none
# of them should ever be asked to register.
for r in (
    auth.router,
    share.public_router,
    procurement.choice_router,
    procurement.vendor_signup_router,
    client_portal.enquiry_router,
):
    app.include_router(r)

# The vendor portal.  Every route there resolves the signed-in vendor itself
# (current_vendor), and a staff token is refused — as a vendor token is
# refused everywhere below.
app.include_router(vendor_portal.router)
# The couple's portal — same pattern: current_client in every route, and a
# couple's token is refused by every staff and vendor route.
app.include_router(client_portal.router)
# Everyone's own profile — resolves whichever kind of account the token is.
app.include_router(profile.router)
# The founder's and managers' assistant — current_user inside, scoped per person.
app.include_router(assistant.router)

# Signed in, any staff role.  auth.staff_router and procurement.vendor_router
# gate their own writes on CAP_TEAM.  Everything that touches a wedding is
# narrowed to the manager's own weddings inside the route.
for r in (
    weddings.staff_router,
    procurement.vendor_router,
    auth.staff_router,
    workspace.router,
    workspace.updates_router,
    tickets.router,
):
    app.include_router(r, dependencies=[Depends(current_user)])

# Guarded by capability.  Declared here rather than scattered through the
# routers, so what each role can reach is readable in one place.
GUARDED = [
    (leads.router, CAP_LEADS),
    (weddings.router, CAP_WEDDINGS),
    (weddings.task_router, CAP_WEDDINGS),
    (weddings.milestone_router, CAP_WEDDINGS),
    (procurement.contract_router, CAP_WEDDINGS),
    (procurement.router, CAP_VENDORS),
    (procurement.quote_router, CAP_VENDORS),
    (operations.router, CAP_RUNDAY),
    (operations.item_router, CAP_RUNDAY),
    (finance.router, CAP_MONEY),
    (finance.co_router, CAP_MONEY),
    (finance.recon_router, CAP_MONEY),
    (finance.time_router, CAP_WEDDINGS),
    (finance.pnl_router, CAP_SEASON),
    (analytics.router, CAP_SEASON),
    (share.router, CAP_SEASON),
    (team.router, CAP_TEAM),
]

for router, capability in GUARDED:
    app.include_router(router, dependencies=[Depends(require(capability))])


@app.on_event("startup")
def on_startup() -> None:
    # new tables first, then any columns an older database is missing —
    # otherwise upgrading in place dies on the first insert
    Base.metadata.create_all(bind=engine)

    from . import migrate

    added = migrate.run(engine)
    if added:
        log.info("Database upgraded — added %s", ", ".join(added))
        if "staff.password_hash" in added:
            from .seed import DEMO_PASSWORD
            from .services.auth import hash_password

            n = migrate.backfill_passwords(engine, hash_password(DEMO_PASSWORD))
            if n:
                log.info("Set the demo password on %d existing account(s)", n)

    # older role names (Planner, Coordinator…) become Manager
    moved = migrate.normalise_roles(engine)
    if moved:
        log.info("Moved %d account(s) onto the Founder/Manager model", moved)

    _bootstrap_founder()

    # Real deployments must begin empty and be populated through the app/API.
    # A demo dataset is opt-in for local product tours only.
    if os.getenv("SEED_ON_START", "0") == "1":
        from .seed import seed

        db = SessionLocal()
        try:
            seed(db)
            # The couple's vendor-choice link belongs to nobody with an account,
            # so it is not in the staff navigation.  Print it once.  (Agreements
            # are signed only inside the couple's portal — there is no link.)
            from .seed import DEMO_LINKS

            for label, path in DEMO_LINKS.items():
                log.info("Couple link (%s): %s", label, path)
            # an older demo database has vendors with no sign-in; give the
            # demo vendors theirs so the vendor portal is reachable
            from .seed import ensure_portal_demo

            for what in ensure_portal_demo(db):
                log.info("Demo upgrade — added %s (password: royalknot)", what)
        except Exception:
            # A half-seeded demo should never stop the app from starting.
            log.exception("Could not load demo data")
            db.rollback()
        finally:
            db.close()


def _bootstrap_founder() -> None:
    """Create the one initial real account for an empty deployment.

    Account creation afterwards happens through the normal team workflow.  No
    credentials or example people are stored in code: an operator must supply
    all three environment values on the first start.
    """
    email = (os.getenv("BOOTSTRAP_FOUNDER_EMAIL") or "").strip().lower()
    password = os.getenv("BOOTSTRAP_FOUNDER_PASSWORD") or ""
    name = (os.getenv("BOOTSTRAP_FOUNDER_NAME") or "").strip()
    if not any((email, password, name)):
        return
    if not all((email, password, name)):
        log.warning("Founder bootstrap skipped: set name, email and password together")
        return
    if len(password) < 8:
        log.warning("Founder bootstrap skipped: password must have at least 8 characters")
        return

    from .models import Staff
    from .services.auth import hash_password

    db = SessionLocal()
    try:
        if db.query(Staff).filter(Staff.email == email).first():
            return
        db.add(Staff(
            name=name,
            email=email,
            password_hash=hash_password(password),
            role="Founder",
            title="Founder",
        ))
        db.commit()
        log.info("Created bootstrap founder account for %s", email)
    except IntegrityError:
        # Another application instance won the race to create the same first
        # account. Its account is valid, so this instance can continue.
        db.rollback()
    finally:
        db.close()


@app.get("/api/health", tags=["Reference"])
def health():
    # A process can be alive while its managed PostgreSQL connection is not.
    # Readiness therefore verifies a real round trip instead of returning a
    # misleading green response.
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "service": "royal-knot", "database": engine.url.get_backend_name()}


# ---- Serve the built frontend --------------------------------------------
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        """Client-side routing: anything that is not an API call returns the
        SPA shell so deep links like /choose/<token> work on first load."""
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        root = DIST.resolve()
        candidate = (root / full_path).resolve()
        # only ever serve files from inside the built frontend
        if full_path and candidate.is_file() and root in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(root / "index.html")
