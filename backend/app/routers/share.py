"""The last line of the brief: "and to share these numbers when needed."

The founder needs to put the season's figures in front of someone outside the
agency — an investor, an accountant, a partner. That person should not need an
account, and the founder should be able to take the link back afterwards.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ShareLink, Staff
from ..services.auth import CAP_SHARE, require
from ..services.finance import cash_due, season_overview, vendor_scorecard

router = APIRouter(prefix="/api/share-links", tags=["6 · Founder"])
public_router = APIRouter(prefix="/api/shared", tags=["6 · Founder"])


class ShareCreate(BaseModel):
    label: str = "Season summary"
    expires_in_days: int | None = 30
    include_detail: bool = True


def _link_payload(link: ShareLink) -> dict:
    return {
        "id": link.id,
        "token": link.token,
        "url": f"/shared/{link.token}",
        "label": link.label,
        "created_by": link.created_by.name if link.created_by else None,
        "created_at": link.created_at.isoformat(),
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "revoked": link.revoked,
        "live": link.is_live,
        "view_count": link.view_count,
        "include_detail": link.include_detail,
    }


@router.get("")
def list_links(
    db: Session = Depends(get_db), user: Staff = Depends(require(CAP_SHARE))
):
    links = db.query(ShareLink).order_by(ShareLink.created_at.desc()).all()
    return [_link_payload(x) for x in links]


@router.post("", status_code=201)
def create_link(
    payload: ShareCreate,
    db: Session = Depends(get_db),
    user: Staff = Depends(require(CAP_SHARE)),
):
    link = ShareLink(
        token=secrets.token_urlsafe(18),
        label=payload.label,
        created_by_id=user.id,
        include_detail=payload.include_detail,
        expires_at=(
            datetime.utcnow() + timedelta(days=payload.expires_in_days)
            if payload.expires_in_days
            else None
        ),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _link_payload(link)


@router.post("/{link_id}/revoke")
def revoke(
    link_id: int,
    db: Session = Depends(get_db),
    user: Staff = Depends(require(CAP_SHARE)),
):
    link = db.get(ShareLink, link_id)
    if not link:
        raise HTTPException(404, "Share link not found")
    link.revoked = True
    db.commit()
    return _link_payload(link)


# ---- the public view ------------------------------------------------------
@public_router.get("/{token}")
def shared_report(token: str, db: Session = Depends(get_db)):
    """What the recipient sees. Read-only, and never more than the founder chose."""
    link = db.query(ShareLink).filter(ShareLink.token == token).first()
    if not link:
        raise HTTPException(404, "This link is not valid")
    if not link.is_live:
        raise HTTPException(
            410, "This link has been withdrawn by The Royal Knot"
        )

    link.view_count += 1
    db.commit()

    overview = season_overview(db)
    cash = cash_due(db, 30)

    report = {
        "label": link.label,
        "shared_by": link.created_by.name if link.created_by else "The Royal Knot",
        "generated_at": datetime.utcnow().isoformat(),
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "totals": {
            "weddings": overview["wedding_count"],
            "revenue": overview["total_revenue"],
            "cost": overview["total_cost"],
            "profit": overview["total_profit"],
            "margin_pct": overview["avg_margin_pct"],
            "loss_making": overview["loss_making_count"],
            "cash_in_30d": cash["total_incoming"],
            "cash_out_30d": cash["total_outgoing"],
            "net_cash_30d": cash["net"],
        },
    }

    # The founder decides whether the recipient sees individual weddings or
    # only the totals — an accountant needs the detail, an investor may not.
    if link.include_detail:
        report["weddings"] = [
            {
                "code": w["code"],
                "couple_name": w["couple_name"],
                "day1_date": w["day1_date"],
                "status": w["status"],
                "revenue": w["revenue"],
                "cost": w["cost"],
                "profit": w["profit"],
                "margin_pct": w["margin_pct"],
            }
            for w in overview["weddings"]
        ]
        report["vendors"] = [
            {
                "name": v["name"],
                "category": v["category"],
                "weddings_worked": v["weddings_worked"],
                "punctuality_pct": v["punctuality_pct"],
                "reliability_score": v["reliability_score"],
            }
            for v in vendor_scorecard(db)[:10]
        ]

    return report
