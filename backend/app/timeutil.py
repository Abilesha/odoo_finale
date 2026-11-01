"""Timestamps stored with datetime.utcnow() are UTC but carry no zone.  Sent
as a bare ISO string, a browser in India reads them as local time and every
"2 min ago" turns into "6h ago".  Anything recorded by utcnow() goes out
through here, marked as UTC."""
from __future__ import annotations

from datetime import datetime


def utc_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat() + ("Z" if dt.tzinfo is None else "")
