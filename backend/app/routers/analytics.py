"""Scene 6 — the founder's season review.

One screen that answers: which weddings made money, how is the season doing,
which vendors keep delivering, and what cash moves in the coming weeks.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Lead, LeadStage, RFQStatus, QuoteRequest, TaskStage, Task, Wedding
from ..services.finance import cash_due, season_overview, vendor_scorecard

router = APIRouter(prefix="/api/analytics", tags=["6 · Founder"])


@router.get("/season")
def season(db: Session = Depends(get_db)):
    return season_overview(db)


@router.get("/vendors")
def vendors(db: Session = Depends(get_db)):
    return vendor_scorecard(db)


@router.get("/cash")
def cash(days: int = 30, db: Session = Depends(get_db)):
    return cash_due(db, days)


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    """Everything the founder asks for, in one request."""
    overview = season_overview(db)
    cash_position = cash_due(db, 30)
    scorecard = vendor_scorecard(db)

    # pipeline health
    open_leads = (
        db.query(Lead)
        .filter(Lead.stage.notin_([LeadStage.WON, LeadStage.LOST]))
        .count()
    )
    unsigned = (
        db.query(Lead).filter(Lead.stage == LeadStage.AGREEMENT_SENT).count()
    )

    # delivery health
    overdue_tasks = (
        db.query(Task)
        .filter(Task.stage != TaskStage.DONE, Task.due_date < date.today())
        .count()
    )
    open_rfqs = (
        db.query(QuoteRequest)
        .filter(QuoteRequest.status.in_([RFQStatus.SENT, RFQStatus.COMPARING]))
        .count()
    )

    # revenue and profit by month, for the season chart
    monthly: dict[str, dict[str, float]] = defaultdict(
        lambda: {"revenue": 0.0, "cost": 0.0, "profit": 0.0, "count": 0}
    )
    for row in overview["weddings"]:
        key = row["day1_date"][:7]
        monthly[key]["revenue"] += row["revenue"]
        monthly[key]["cost"] += row["cost"]
        monthly[key]["profit"] += row["profit"]
        monthly[key]["count"] += 1

    series = [
        {
            "month": k,
            "revenue": round(v["revenue"], 2),
            "cost": round(v["cost"], 2),
            "profit": round(v["profit"], 2),
            "weddings": v["count"],
        }
        for k, v in sorted(monthly.items())
    ]

    ranked = sorted(overview["weddings"], key=lambda r: r["profit"], reverse=True)

    return {
        "kpis": {
            "weddings": overview["wedding_count"],
            "revenue": overview["total_revenue"],
            "cost": overview["total_cost"],
            "profit": overview["total_profit"],
            "margin_pct": overview["avg_margin_pct"],
            "loss_making": overview["loss_making_count"],
            "open_leads": open_leads,
            "awaiting_signature": unsigned,
            "overdue_tasks": overdue_tasks,
            "open_rfqs": open_rfqs,
            "cash_in_30d": cash_position["total_incoming"],
            "cash_out_30d": cash_position["total_outgoing"],
            "net_cash_30d": cash_position["net"],
            "overdue_receivables": cash_position["overdue_incoming"],
        },
        "monthly": series,
        "top_weddings": ranked[:5],
        "bottom_weddings": [r for r in ranked[-5:] if r["profit"] < ranked[0]["profit"]][::-1],
        "weddings": overview["weddings"],
        "vendors": scorecard[:10],
        "cash": cash_position,
    }
