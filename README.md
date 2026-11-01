# The Royal Knot — Wedding Planning Management System

The digital backbone of a wedding planning agency that has outgrown WhatsApp
groups and paper diaries. From the first enquiry to the final vendor payment.

Built for the Odoo Hackathon.

**Live demo:** _add your deployed URL here_
**Demo video:** _add your video link here_

## PostgreSQL setup (dynamic, no sample data)

The application persists every lead, wedding, quote, task, bill and portal
action in PostgreSQL. The schema currently contains 22 related tables and is
created safely at application startup. Nothing is hard-coded into the UI: the
React app reads it through the API and all writes persist to the database.

1. Create an empty PostgreSQL database named `royalknot`.
2. Set `DATABASE_URL` to its connection string (see `.env.example`).
3. Keep `SEED_ON_START=0` for real data.
4. Set `BOOTSTRAP_FOUNDER_NAME`, `BOOTSTRAP_FOUNDER_EMAIL` and
   `BOOTSTRAP_FOUNDER_PASSWORD` once so an empty database has its first real
   administrator account. These values are never replaced on later starts.
5. Run `python backend/create_schema.py` once to validate the connection and
   create all tables, then start the app as normal.

The command is idempotent and never inserts demo records. `GET /api/health`
also confirms both the API and the database connection are live.

---

## The problem

The Royal Knot plans about 25 luxury three-day weddings a season, each with
400+ guests, around 18 vendors and a budget of several crores. Today:

- enquiries arrive on calls, Instagram and WhatsApp, and get forgotten
- vendor quotes arrive as PDFs and are compared by hand
- checklists live in paper diaries and are rewritten for every wedding
- payments are tracked in notebooks, and advances are missed
- profit per wedding is only known long after the wedding is over

The founder is losing money, couples are anxious, and the planning team is
overwhelmed.

## The idea

**One spine.** Every feature hangs off a single `Wedding` record, so a fact
entered once travels everywhere it is needed. This is the difference between
an ERP and six CRUD screens:

- converting a signed lead **generates 35 tasks and 3 payment milestones** in
  one step — nobody copies a checklist from the last wedding
- awarding a caterer **closes the other two quotes automatically** and creates
  the contract that the vendor's final bill is later matched against
- recording 60 extra guests **creates both a vendor cost and a client charge**,
  and both land in the founder's P&L without anyone re-keying a number
- run-sheet check-ins **become the punctuality score** on the vendor scorecard

No screen is a dead end.

---

## The six scenes, and how each is solved

### 1. The first consultation
Capture the enquiry the moment it lands — rough date, guest count, theme,
maximum budget, and where it came from. Every lead has a stage and an owner
from the second it is created, so it cannot be lost.

The couple is sent a **service agreement they sign inside their own portal** —
on their phone or laptop, with a touch signature pad, after signing in. There
is no public signing link and no way to sign from an agency screen; a couple
who phoned in gets their login in the same step the agreement is sent. The
signature is stored with its audit trail (who, when, from which device
address) and stays attached to the record for ever: the couple downloads the
signed copy as a PDF, and managers and the founder open the same copy,
read-only. The wedding file **cannot be opened until the agreement is signed** —
the system enforces the order of operations rather than hoping someone
remembers it.

### 2. Three caterers, one decision
The hard part is not storing quotes, it is making three differently-shaped
PDFs comparable. One quotes per plate, another flat; one buries a logistics
fee; one is on 5% composition GST while the others charge 18%.

Every quote is reduced to the same three honest numbers:

| | meaning |
|---|---|
| **Landed total** | what the agency actually pays, all-in |
| **Cost per plate** | landed total ÷ guest count — the only fair yardstick |
| **Scope coverage** | how much of the requested scope is actually included |

The line-by-line matrix matches items on a **canonical key**, not raw text, so
"Welcome drinks (Day 1)" and "Welcome drinks and canapés (Day 1)" line up as
one row instead of looking like two different things. Each vendor's own
wording is shown underneath, and any row only some vendors quoted is flagged —
that is where money hides.

The recommendation is deliberately **not "cheapest"**. A quote 8% cheaper that
excludes a third of the scope is not cheaper, and that judgement is currently
made in a tired planner's head at midnight.

### The couple is the one who picks

The brief is specific about who decides: *"When the couple picks a winner, the
other two requests should close on their own."* So the planner shortlists and
advises, then sends a private link — and the couple chooses on their phone,
with no account, exactly as they signed the agreement.

Their screen shows **less** than the planner's on purpose: the price they will
pay, the per-plate figure, what is and is not included, and each vendor's
punctuality — but not the agency's value score or its recommendation. Advice
is something a planner gives in person; a badge on a screen would decide for
them.

Their pick runs the **same** award the planner's own button runs, so whichever
route is taken: the winning quote is marked awarded, the losing quotes close
themselves, and a vendor contract is created and linked to the wedding — the
record every later bill is matched against. The planner's screen then shows
who chose, when, and anything they asked to pass on. A second attempt on the
same link is refused, so a decision cannot be quietly changed afterwards.

On award: the winner is marked, **the other two close on their own**, and a
vendor contract is created and linked to the wedding.

### 3. The instant wedding plan
The deposit lands and a complete plan exists in seconds: **35 tasks** across
Venue, Design, Vendors, Big Day and Close-out, each with an owner assigned by
role and a due date computed from the wedding date, moving through
To Plan → In Progress → Blocked → Done.

Alongside them, the three staged payments from the brief: 25% booking,
50% advance a month before, 25% final after the event.

Checklists live in an editable template table, so the agency can change its
own process without touching code.

### 4. The big day schedule
A live, minute-by-minute run sheet across all three days, from the groom's
arrival and the garland exchange to the vows and the reception.

**Lateness is derived, never typed.** A slot turns red on its own once its
start time plus a grace window has passed without the responsible vendor
checking in — so the board tells the truth while the planner is busy
elsewhere. Alerts carry the vendor's phone number and the planner responsible,
and are scoped to the day actually being run.

A demo clock lets you jump to any time of day to watch the board react.
Simulated time is strictly read-only: looking at the board never changes it.

### 5. Paying vendors and extra costs
Each vendor bill is matched three ways — against the **agreed contract**,
against **approved extras**, and against the **advance already released**:

- a bill over the agreed amount is **Blocked** and cannot be paid until a
  change order approves the difference
- a bill under the agreed amount is **flagged** but payable — under-billing is
  favourable, not a crisis
- the advance is netted off automatically, and a settled bill **refuses to be
  paid a second time**

Recording the real headcount raises a change order carrying **both sides** of
the extra: what the caterer will bill at their contracted per-plate rate, and
what the couple is fairly charged with the agency's coordination margin. The
margin becomes visible instead of quietly disappearing.

### 6. The founder's season review
One screen: profit per wedding, the whole season by month, which vendors keep
delivering, and what cash moves in the coming weeks.

The brief closes with the founder wanting **"to share these numbers when
needed"** — with an accountant, an investor, a partner. So the founder can mint
a **read-only link** that needs no account, chooses whether the recipient sees
individual weddings or only season totals, sets an expiry, sees how many times
it has been opened, and can **withdraw it** at any time.

Profit is built from records, not notebooks:

```
revenue = contract value + additions billed to the client
cost    = vendor settlements + planning-team hours × their cost rate
```

Planning hours are included because without them "profit per wedding" is
fiction. Vendor reliability is scored from evidence the system already holds —
punctuality from run-sheet check-ins, billing accuracy from settled invoices.

---

## Four sign-ins, four control panels

The brief describes different people doing different jobs — a founder asking
which weddings made money, planners comparing quotes and running the day,
vendors who keep being chased for prices and updates, and a couple who should
never have to chase anyone. So each of them gets their own panel, with its own
navigation, its own home screen and its own colour (plum, midnight, jade and
blush), and the sign-in screen has four doors. Come through the wrong one and
it tells you which one is yours instead of saying the password is wrong.

The brief's "planner" is a **Manager** in the system: the person the founder
hands a wedding to.

### Founder — runs the agency

- **Managers screen.** Headcount, and for every manager: weddings carried,
  overdue and blocked tasks, what is due this week, vendor delays reported on
  their weddings, overdue client payments, hours logged, their next wedding
  with a countdown, and a health score built from fixed costs per problem
  (five late tasks are five late tasks whether they carry four weddings or
  fourteen). Sorted with whoever needs help first. Each manager opens into a
  full file: their weddings with progress, what is late and by how long, what
  vendors have flagged, and what they finished recently.
- **Assigning weddings.** Weddings nobody owns sit at the top in gold. Assign
  or reassign from the Managers board, the weddings list or the wedding itself,
  with a note for the manager. Reassigning moves the open tasks and the
  run-sheet slots with it, so the old manager stops being reminded about a
  wedding they no longer run.
- **Edit anything.** Every wedding, enquiry, task, payment stage, run-sheet
  slot, vendor contract, vendor and member of staff has an Edit button that
  opens the same form — and only the fields that changed are sent, so fixing a
  venue never rewrites a fee. Only the founder can change who runs a wedding
  and what the couple pays.
- Everything that was already there: the season P&L, vendor scorecard, cash
  due and revocable share links.

### Manager — runs the weddings they were given

- **My day.** A live countdown to the next moment that matters (the next
  Mehendi, Sangeet or wedding, timed from the run sheet's first slot), today's
  live wedding with late slots and a one-tap call to the vendor, upcoming
  events with all three days, the checklist, what vendors are saying, client
  payments due, quotes in flight, and agreements awaiting a signature.
- **Checklist** across every wedding they run: *pending* (late or blocked),
  *upcoming* (grouped today / this week / this month / later) and *finished*.
  Tick to complete, change stage, edit, add their own items, remove.
- **Payments.** Money in from couples (invoice, record payment with a UTR
  reference) and money out to vendors (already three-way matched; pay the
  ones that match).
- **Vendors and the top three.** Inviting vendors shows who can actually do
  the wedding — booked elsewhere, blocked out, over capacity, out of area —
  from the vendors' own calendars. Quotes arrive from the vendor portal already
  in the comparison's shape. The three best by value are pre-ticked to send to
  the couple; the manager can swap one but never send more than three.
- A manager sees **only** the weddings assigned to them. That is enforced on
  the server for every route that touches a wedding: another manager's wedding
  returns 404, the same as one that does not exist, so ids cannot be probed.

### Vendor — a separate kind of account

- **Registering.** *List your vendor business* opens its own page
  (`/vendors/join`): business, contact, capacity, then the sign-in — four short
  steps with a live preview of how managers will see them. The step lives in
  the address (`?step=2`), so the browser's Back goes back one step instead of
  emptying the form, and every answer except the password is kept as a draft
  on that device until the business is created.
- **Requests to price.** Each one shows the wedding's dates, venue, guests,
  scope, the manager to call, a reply-by countdown, and whether it fits their
  calendar and capacity. They price it in a **calculator** — line items with
  units (a per-plate line with quantity 1 is multiplied by every guest, exactly
  as the comparison reads it), GST, travel and setup, extra-hour rate,
  inclusions and exclusions — and see the all-in total and per-guest figure the
  manager will see. Or decline with a reason, so the manager invites someone
  else today.
- **Their margin, privately.** They can enter what the job costs them; the
  portal shows what they keep. That figure is never sent to any agency screen.
- **Progress to the manager.** On track, delayed, blocked or done, with a
  percentage and a message. A delay must carry a new date — "running late" on
  its own helps nobody plan. It appears on the manager's day in red until they
  mark it seen, and the vendor sees that it was seen.
- **Calendar** they paint (open / limited / unavailable, with a note); days
  they are contracted for fill in on their own. **Capacity** — largest
  headcount, events per day, team size, cities, notice needed. Managers read
  both every time they invite.
- **Earnings.** Job value including approved extras, what has been received
  (advance plus settled bills), what is outstanding, cost, profit and margin —
  per job and by month. Vendors are separated by job type everywhere: the
  founder's vendor screen, the manager's invite list and the portal itself.

### Couple — their own wedding, as it comes together

- **The online enquiry** (`/enquire`, linked from the Couple door). Five short
  steps — who you are; when, where and how many (a guest slider); the mood (six
  colour palettes) and which ceremonies; budget (a slider that shows the
  per-guest figure) and which services; then a password. One submission puts
  the enquiry in the pipeline with an owner — the least-loaded manager, so it
  can never be forgotten — creates the couple's login and signs them straight
  in. A couple who phoned instead gets a login from their planner, from the
  enquiry card.
- **Overview.** The journey (enquiry → first meeting → agreement → booked →
  planning → the wedding → married) with where they are now, a live countdown
  to their next ceremony, their planner with a call and a message button, and
  *Waiting for you*: sign the agreement, choose a vendor from the top three,
  their planner's reply, their own to-dos due soon, a payment coming up.
- **Timeline.** Everything on one line with a *you are here* marker: the
  enquiry, the agreement, every payment, vendors confirmed, each planning stage
  completing, their own to-dos and the three days.
- **Checklist — view only.** The couple follows; their planner updates. *Things
  that need you* (share the mood board, send the guest list, attend the
  tasting…) are ticked off by the planner once they hear back, *Latest updates*
  shows the most recent steps completed, and underneath is what the planner is
  doing by stage. Nothing on the page can be changed from the couple's side —
  the server refuses it too. The couple's to-dos are generated with every plan;
  the manager sees them marked *Couple* and owns chasing them, but they never
  count against the manager's health.
- **Payments.** The package, extras billed, paid and still to pay, and the
  three stages. *I've paid this* sends the UTR to the planner — it does not
  mark anything received; the manager confirms it against the bank, and the
  couple's UTR becomes the receipt reference.
- **Vendors.** Who is doing what at their wedding, how reliable each one is,
  and any choice waiting for them. Never the price the agency pays a vendor; a
  vendor running late shows as *your planner is on it*.
- **Day schedule.** The three days, what happens when and where, following the
  clock on the day (done, happening now, next). Not which vendor is late —
  that is the planner's to solve, not the bride's to watch. Printable for the
  families.
- **Agreement.** The only place it can be signed: read it, tick, type a name,
  draw the signature, with a sticky Sign bar that says what is still missing.
  Once signed: who signed, when, from where, and the signature — and a
  **Download signed copy (PDF)** button.
- **Invitations.** Four designs drawn at print size (5 × 7 in, 300 dpi) — Royal
  maroon & gold, Ivory & gold leaf, Pastel garden and Midnight marigold — for
  the wedding invitation, a save-the-date and a card for each ceremony. The
  names, dates, venue and RSVP start from their own wedding and every word is
  editable. Download a PNG to send on WhatsApp, a print-ready PDF, the whole
  set in one PDF, or a copy addressed to every guest on their list, one per
  page. Their design and wording are saved to their account.
- **Questions & complaints.** A query, a change request or a complaint, about
  planning, vendors, payments, the schedule or the agreement. It goes to their
  planner; a complaint is urgent automatically and reaches the founder too.
  The conversation stays in one thread; once resolved they rate it out of five,
  and replying reopens it.

Staff answer from **Client queries** (founder: every couple, complaints first;
manager: only their couples), with how long each couple has been waiting.
Unanswered queries and open complaints appear on the manager's day and on the
founder's Managers screen, and an open complaint costs that manager health.

### Everyone — one profile page

All four sign-ins share one **profile**: a photo (chosen, zoomed and cropped in
the browser, stored as a small square), the details that person may change
themselves, and their password. A manager changes their phone and city — their
name, title and work email are the founder's to edit; a vendor changes the
contact person and phone (capacity has its own page); a couple changes their
name and phone. The menu at the foot of the sidebar shows the photo, name, *My
profile* and *Sign out* — nothing else. Manager photos also appear on the
founder's screens and on the couple's planner card.

### The assistant — founder and managers

An **Assistant** page in both staff portals answers questions in plain words
— *what is overdue on my weddings*, *which payments are due this month*,
*which weddings need attention*, *how is the season doing*, *best-rated
caterers in Udaipur*, *tell me about Krish & Nitara*, *how do I send an
agreement*. It is retrieval-augmented: every question turns the records that
person may open into short documents (each wedding, its late tasks, payments
and vendors, open quote requests, enquiries, client queries, the vendor
directory, how-to notes; for the founder also the season's profit and each
manager's workload), ranks them with BM25, and answers from the best matches
with links to where each fact lives. A manager's assistant simply has no
records about another manager's couples or the season's margins.

With `ANTHROPIC_API_KEY` set, Claude writes the answer from those records and
cites them; without it the assistant still answers the common questions
directly from the data, and returns the best-matching records for anything
else. If the AI service cannot be reached it falls back the same way.

### What can open what

| | Enquiries | Wedding plan | Quotes | Run sheet | Bills | Season P&L | Managers & assign | Every wedding |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **Manager** | ● | own | own | own | own | | | |
| **Founder** | ● | ● | ● | ● | ● | ● | ● | ● |
| **Vendor** | | | their requests | their slots | their jobs | their own | | |
| **Couple** | their own | their own (read only) | choose from top 3 | their three days | their payments | | | |

Staff, vendors and couples live in different tables, so their ids overlap.
Every token carries its kind, and each kind is refused by every other kind's
routes — otherwise vendor #1 or couple #1 would resolve to staff member #1,
the founder.
Tokens are HMAC-signed with the standard library; passwords are PBKDF2-SHA256
with a per-user salt.

**Couples do not need an account to act.** The three public pages — signing,
choosing a vendor, and the shared report — still work as links with
unguessable tokens, so a couple can sign or choose from a message on their
phone without signing in. The portal is for following the whole wedding. The couple sees the prices, inclusions and
punctuality of their top three, never the agency's internal value score or
recommendation.

### Adding a real person

The founder adds staff from **Team** (name, email, phone, city, access level,
temporary password) and edits, resets the password of, or switches off anyone
there. Vendors get a portal sign-in from **Vendors** — set a password when
adding them or editing them later. Couples make their own through the online
enquiry, or get one from their planner on the enquiry card. Everyone can
change their own password.

The sign-in screen also lists demo accounts for each door so a judge can move
between panels quickly — **delete the `/api/auth/demo-login` route and the
seeded accounts before any real deployment.** All demo accounts use the
password `royalknot`.

### Upgrading an existing database

`create_all` makes tables that do not exist but never alters one that does, so
a database created before a column was added would otherwise kill the app on
startup with *"table staff has no column named password_hash"*. On boot the app
adds any missing columns, gives existing accounts the demo password, and folds
older role names (Planner, Coordinator, Finance…) into Manager, keeping the old
value as the person's `title`. A demo database from the very first version had
no founder account at all, so one is created; the demo vendors are given their
portal sign-ins, and three demo couples are set up with their to-dos,
agreements and a few open queries. Upgrading in place just works — tested against a
database built by the first commit; deleting `royalknot.db` is never required.

---

## What the brief does *not* ask for

Worth stating explicitly, because both look like obvious features until you
read the brief closely:

- **No WhatsApp integration.** WhatsApp appears four times in the brief and is
  the *problem* every time — the agency "has outgrown WhatsApp groups", quotes
  are "sent as PDFs in WhatsApp groups and compared by hand". This system is
  what replaces it. What it does do is record that an enquiry *arrived* via
  WhatsApp, so the channel is tracked without the chaos.
- **No guest-list management.** The full-service package mentions "tracking
  which guests are coming", but every scene in the brief turns on *headcount*,
  not individual guests — the 400-guest contract, the 60 unexpected arrivals,
  the per-plate pricing. Headcount is modelled properly end to end; a
  per-guest RSVP table would have been scope without a scene behind it.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| API | FastAPI (Python 3.12) | fast to write, auto-generated OpenAPI docs at `/docs` |
| ORM | SQLAlchemy 2.0 | typed models, clean relationships |
| Database | SQLite by default, Postgres via `DATABASE_URL` | clone and run with zero setup; one env var to go to Postgres |
| Frontend | React 18 + Vite + Tailwind CSS | fast builds, no component-library lock-in |
| Charts | Recharts | |
| Deploy | One Docker image | FastAPI serves both the API and the built bundle — **one service, one URL** |

Business logic lives in `backend/app/services/`, not in the routers, so the
quote normalisation, three-way match and profit engine are independently
testable and readable.

---

## Running it

### Fastest — one command
```bash
git clone <your-repo-url>
cd royal-knot
./run.sh
```
Open **http://localhost:8000**. Demo data loads on first boot.

### Docker
```bash
docker build -t royal-knot .
docker run -p 8000:8000 royal-knot
```

### Development, with hot reload
```bash
# terminal 1 — API on :8000
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# terminal 2 — Vite on :5173, proxying /api to :8000
cd frontend
npm install
npm run dev
```

### Deploying
Push to GitHub and point Render at the repo — `render.yaml` is already
configured for a Docker web service with a health check. Railway and Fly.io
work from the same Dockerfile. To keep data across restarts, attach a Postgres
instance and set `DATABASE_URL`.

Interactive API docs are at **`/docs`** on any running instance.

### Checking it actually works

With the app running:

```bash
python3 backend/verify.py
```

This walks every scene in the brief, then all four panels, and prints 183
checks — that a couple's online enquiry lands in the pipeline with an owner,
that an agreement cannot go to a couple without a login, that only the couple
can sign it (inside their portal — the old public link is gone) and the agency
gets the signed copy at once, that a complaint reaches the founder and not
another manager, that the couple's checklist is view-only and shows the
planner's updates, that every account has the same profile and a manager
cannot rename themselves, that invitations are saved and are the couple's own,
that a vendor registers with their capacity, that one manager's assistant
knows nothing of another manager's couples, that a reported payment does not count
until the planner confirms it, that a couple never sees what vendors are paid
or which one is late, that a manager is refused the season numbers by the *server* rather
than by a hidden menu, that a manager cannot open another manager's wedding,
that a vendor's sign-in opens nothing on the agency side, that the couple is
sent exactly the top three by value and cannot pick outside them, that a
vendor's price lands in the manager's comparison at once while their private
cost never does, that a delay without a new date is refused, that a day a
vendor blocks shows as a conflict when the manager invites, that
a wedding cannot be opened before the agreement is signed, that differently
worded quote lines still match across vendors, that the couple's pick closes
the losing quotes, that a bill cannot be paid twice, that an over-billed
vendor is blocked, that the planning team's hours reach the P&L, and that a
withdrawn share link stops working.

Each check is named after the line of the brief it proves, so a failure says
what broke rather than which assertion number it was. It uses the standard
library only — no pytest, no extra installs.

---

## How it maps to Odoo

The data model deliberately mirrors Odoo's own patterns, so this is portable
to a custom addon rather than being a parallel invention:

| This system | Odoo equivalent |
|---|---|
| `Lead` → `Wedding` conversion | `crm.lead` → `sale.order` |
| `Agreement` with signature + audit trail | `sign.request` |
| `QuoteRequest` / `Quote` / `QuoteLine` | `purchase.requisition` / `purchase.order` |
| Award closes the losing quotes | purchase agreement "exclusive" selection |
| `TaskTemplateItem` → `Task` | `project.task` generated from a project template |
| `PaymentMilestone` | milestone-based invoicing on `sale.order` |
| `VendorContract` → `VendorBill` three-way match | `purchase.order` ↔ `account.move` matching |
| `ChangeOrder` | `sale.order.line` added post-delivery |
| `TimeLog` | `account.analytic.line` (timesheets) |
| `wedding_pnl` | analytic account profitability report |
| Role capabilities | `res.groups` and access rights |
| Manager sees only assigned weddings | record rules on `res.groups` |
| Vendor portal | Odoo portal users (`base.group_portal`) on `purchase.order` |
| Couple portal | Odoo customer portal on `sale.order` / `project.project` |
| Online enquiry | `website_crm` contact form → `crm.lead` |
| Queries & complaints | `helpdesk.ticket` with customer rating |
| `VendorAvailability` / capacity | resource calendars (`resource.calendar.leaves`) |
| `ShareLink` | portal share link / `mail.share` |
| `RunSheetItem` | custom model — Odoo has no native event run sheet |

---

## Project layout

```
royal-knot/
├── Dockerfile              single-image build (Node → Python)
├── render.yaml             one-click Render deploy
├── run.sh                  install, build and serve
├── backend/
│   └── app/
│       ├── main.py         app wiring, serves the SPA
│       ├── models.py       23 entities, one Wedding spine
│       ├── schemas.py      request validation
│       ├── seed.py         a full season of realistic demo data
│       ├── services/
│       │   ├── auth.py       passwords, tokens, role capabilities
│       │   ├── planning.py   template → 35 tasks + 3 milestones
│       │   ├── quotes.py     normalisation, canonical keys, award
│       │   ├── finance.py    three-way match + profit engine
│       │   ├── runsheet.py   derived lateness, live board
│       │   └── vendors.py    calendar and capacity fit, vendor money
│       └── routers/        REST endpoints, grouped by scene
│           ├── team.py         founder: managers, health, assignment
│           ├── workspace.py    manager: my day, checklist, payments
│           ├── vendor_portal.py  vendor: requests, jobs, calendar, earnings
│           ├── client_portal.py  couple: enquiry, overview, timeline, signing…
│           └── tickets.py      queries and complaints, the agency's side
└── frontend/src/
    ├── pages/              one page per scene
    │   ├── Managers.jsx    founder: the team and the assignment board
    │   ├── ManagerHome.jsx manager: countdowns and the day
    │   ├── Checklist.jsx · Payments.jsx
    │   ├── vendor/         the vendor portal — six screens
    │   ├── client/         the couple's portal — eight screens
    │   ├── Enquire.jsx     the five-step online enquiry
    │   ├── Queries.jsx     queries and complaints inbox
    │   └── tabs/           Plan · Vendors · Run sheet · Money
    ├── components/ui.jsx   shared primitives
    ├── components/kit.jsx  countdown, rings, the one edit form
    └── api.js              client + Indian number formatting
```

## Demo data

Loaded automatically on first boot: 25 weddings spread across a season
(completed, running and upcoming) shared between five managers — two of them
left unassigned for the founder to hand out, one manager slipping badly enough
to show as at risk — 19 vendors with calendars and capacity (four with portal
sign-ins), five live enquiries, a catering request with four quotes and the
top three already with the couple, a décor request still waiting on vendors to
price it, vendor progress updates including two delays, three couples with
logins (one 70 days out with a caterer to choose, one whose wedding is today,
one who has not signed yet) with a few open queries and a complaint, and one
wedding **happening today** with a live run sheet.

Set `SEED_ON_START=0` to start empty.
