"""Scene 2 — three caterers, one decision.

The hard part is not storing quotes, it is making three differently-shaped
PDFs comparable.  Vendors quote per plate, per day or flat; some bury a
logistics fee; some exclude GST; some include dessert and some do not.

`normalise_quote` reduces every quote to the same three honest numbers:

    landed_total       what the agency actually pays, all-in
    cost_per_plate     landed_total / guest count — the only fair yardstick
    inclusion_score    how much of the requested scope is actually covered

so the planner sees them side by side, line by line, instead of comparing by
hand in a WhatsApp group.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from ..models import (
    Quote,
    QuoteRequest,
    QuoteStatus,
    RFQStatus,
    UnitOfMeasure,
    VendorContract,
)


_STOPWORDS = {"and", "the", "of", "for", "with", "a", "an"}


def canonical_key(description: str) -> str:
    """A stable handle for 'the same line item', whatever the vendor called it.

    One caterer writes "Welcome drinks (Day 1)" and another writes "Welcome
    drinks and canapés (Day 1)".  Matching on the raw string makes two quotes
    look like they cover different things when they cover the same course,
    which is the single most misleading thing about comparing PDFs by hand.

    Everything after a dash or an open bracket is the vendor's own detail, so
    it is dropped; the first two significant words of what remains identify
    the course.
    """
    head = re.split(r"[—–\-(]", description)[0]
    words = [w for w in re.findall(r"[a-z]+", head.lower()) if w not in _STOPWORDS]
    return " ".join(words[:2]) or description.strip().lower()


def _line_total(line, guest_count: int) -> float:
    """Expand a line to its true cost.

    A caterer quoting "1650 per plate" with quantity 1 means 1650 x guests.
    Treating that as a flat 1650 is exactly the mistake a tired planner makes
    at 1am, so the unit of measure does the multiplying here.
    """
    if line.unit in (UnitOfMeasure.PER_PLATE, UnitOfMeasure.PER_PERSON):
        effective_qty = line.quantity if line.quantity > 1 else guest_count
        return round(effective_qty * line.unit_price, 2)
    return round(line.quantity * line.unit_price, 2)


def normalise_quote(quote: Quote, guest_count: int) -> dict:
    """Reduce one quote to comparable figures."""
    lines = []
    subtotal = 0.0
    for line in quote.lines:
        total = _line_total(line, guest_count)
        subtotal += total
        lines.append(
            {
                "id": line.id,
                "key": canonical_key(line.description),
                "description": line.description,
                "unit": line.unit.value,
                "quantity": line.quantity,
                "unit_price": line.unit_price,
                "line_total": total,
            }
        )

    subtotal = round(subtotal, 2)
    pre_tax = round(subtotal + (quote.logistics_fee or 0.0), 2)
    gst_amount = round(pre_tax * (quote.gst_percent or 0.0) / 100.0, 2)
    landed_total = round(pre_tax + gst_amount, 2)

    inclusions = [s.strip() for s in (quote.inclusions or "").splitlines() if s.strip()]
    exclusions = [s.strip() for s in (quote.exclusions or "").splitlines() if s.strip()]
    # A quote that excludes half the scope is cheap for a reason.
    total_scope = len(inclusions) + len(exclusions)
    inclusion_score = round(100.0 * len(inclusions) / total_scope, 1) if total_scope else 100.0

    return {
        "quote_id": quote.id,
        "vendor_id": quote.vendor_id,
        "vendor_name": quote.vendor.name if quote.vendor else "—",
        "vendor_rating": quote.vendor.quality_rating if quote.vendor else 0,
        "vendor_on_time_pct": quote.vendor.on_time_pct if quote.vendor else 0,
        "status": quote.status.value,
        "lines": lines,
        "subtotal": subtotal,
        "logistics_fee": quote.logistics_fee or 0.0,
        "gst_percent": quote.gst_percent,
        "gst_amount": gst_amount,
        "landed_total": landed_total,
        "cost_per_plate": round(landed_total / guest_count, 2) if guest_count else 0.0,
        "extra_hour_rate": quote.extra_hour_rate,
        "inclusions": inclusions,
        "exclusions": exclusions,
        "inclusion_score": inclusion_score,
        "validity_days": quote.validity_days,
        "notes": quote.notes,
        "received_at": quote.received_at.isoformat() if quote.received_at else None,
    }


def value_score(card: dict, cheapest: float) -> float:
    """Scope covered, reliability and rating, less a penalty for price above
    the cheapest.  Not "cheapest wins": a quote 8% cheaper that leaves out a
    third of the scope is not cheaper."""
    price_penalty = (card["landed_total"] - cheapest) / cheapest * 100 if cheapest else 0
    return round(
        card["inclusion_score"] * 1.0
        + card["vendor_on_time_pct"] * 0.35
        + card["vendor_rating"] * 5.0
        - price_penalty * 1.2,
        2,
    )


def rank_quotes(comparison: dict) -> list[int]:
    """Quote ids, best value first — the order the couple's top three come from."""
    cards = comparison.get("quotes") or []
    return [c["quote_id"] for c in sorted(cards, key=lambda c: -c.get("value_score", 0))]


def build_comparison(db: Session, rfq: QuoteRequest) -> dict:
    """Side-by-side comparison for one RFQ, plus a recommendation.

    The recommendation is deliberately not "cheapest".  A quote that is 8%
    cheaper but excludes a third of the scope is not cheaper, and that is the
    judgement a planner currently makes in their head.
    """
    guests = rfq.guest_count or (rfq.wedding.guest_count if rfq.wedding else 0)
    # a vendor who declined has nothing to compare
    received = [
        q for q in rfq.quotes if q.status != QuoteStatus.PENDING and not q.declined
    ]
    cards = [normalise_quote(q, guests) for q in received]
    cards.sort(key=lambda c: c["landed_total"])

    # Build the comparison matrix on canonical keys, so the same course lines
    # up across vendors even when each of them named it differently.  A row is
    # labelled with the fullest wording any vendor used for it.
    labels: dict[str, str] = {}
    order: list[str] = []
    coverage: dict[str, int] = defaultdict(int)
    for card in cards:
        for line in card["lines"]:
            key = line["key"]
            if key not in labels:
                order.append(key)
                labels[key] = line["description"]
            elif len(line["description"]) > len(labels[key]):
                labels[key] = line["description"]
            coverage[key] += 1

    matrix_rows = [
        {
            "key": key,
            "label": labels[key],
            # a row only some vendors quoted is where money hides
            "quoted_by": coverage[key],
            "partial": coverage[key] < len(cards),
        }
        for key in order
    ]

    best_value = None
    if cards:
        cheapest = min(c["landed_total"] for c in cards)
        for c in cards:
            c["value_score"] = value_score(c, cheapest)
        best_value = max(cards, key=lambda c: c["value_score"])["quote_id"]

    return {
        "rfq_id": rfq.id,
        "title": rfq.title,
        "category": rfq.category,
        "status": rfq.status.value,
        "guest_count": guests,
        "wedding_id": rfq.wedding_id,
        "wedding_code": rfq.wedding.code if rfq.wedding else None,
        "awaiting_count": sum(1 for q in rfq.quotes if q.status == QuoteStatus.PENDING),
        "matrix_rows": matrix_rows,
        "quotes": cards,
        "cheapest_quote_id": cards[0]["quote_id"] if cards else None,
        "best_value_quote_id": best_value,
    }


def award_quote(db: Session, rfq: QuoteRequest, quote_id: int) -> VendorContract:
    """Award one quote.

    Three things happen at once, which is the whole point:
      1. the winning quote is marked Awarded;
      2. every other quote on this RFQ closes itself — the planner never has
         to remember to decline the losers;
      3. a VendorContract is created and linked to the wedding, carrying the
         agreed amount that the vendor's final bill will be matched against.
    """
    winner = next((q for q in rfq.quotes if q.id == quote_id), None)
    if winner is None:
        raise ValueError("Quote does not belong to this RFQ")

    guests = rfq.guest_count or rfq.wedding.guest_count
    agreed = normalise_quote(winner, guests)["landed_total"]

    for quote in rfq.quotes:
        if quote.id == quote_id:
            quote.status = QuoteStatus.AWARDED
        else:
            # the other two requests close on their own
            quote.status = QuoteStatus.REJECTED

    rfq.status = RFQStatus.AWARDED

    contract = (
        db.query(VendorContract)
        .filter(
            VendorContract.wedding_id == rfq.wedding_id,
            VendorContract.quote_id == winner.id,
        )
        .first()
    )
    if contract is None:
        contract = VendorContract(
            wedding_id=rfq.wedding_id,
            vendor_id=winner.vendor_id,
            quote_id=winner.id,
            category=rfq.category,
            agreed_amount=agreed,
        )
        db.add(contract)

    db.commit()
    db.refresh(contract)
    return contract


def mark_received(db: Session, quote: Quote) -> Quote:
    quote.status = QuoteStatus.RECEIVED
    quote.received_at = datetime.utcnow()
    db.commit()
    db.refresh(quote)
    return quote
