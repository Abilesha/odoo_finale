"""Bring an existing database up to the current model.

`Base.metadata.create_all` creates tables that do not exist yet, but it never
touches a table that does — so a database created before a column was added
keeps the old shape and the app dies on the first insert with
"table staff has no column named password_hash".

That is a miserable thing to hand someone who just pulled the latest code, so
the missing columns are added on startup instead.  Adding a nullable column is
the one schema change both SQLite and Postgres accept without a rewrite, which
is all this needs.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .db import Base

log = logging.getLogger("royalknot.migrate")

#: SQLAlchemy type -> column type for a plain ADD COLUMN
_SQL_TYPES = {
    "INTEGER": "INTEGER",
    "VARCHAR": "VARCHAR",
    "TEXT": "TEXT",
    "FLOAT": "FLOAT",
    "BOOLEAN": "BOOLEAN",
    "DATETIME": "DATETIME",
    "DATE": "DATE",
    "TIME": "TIME",
}


def _column_sql(column) -> str | None:
    """DDL for one column, or None if it cannot be added safely."""
    try:
        type_sql = column.type.compile()
    except Exception:
        base = type(column.type).__name__.upper()
        type_sql = _SQL_TYPES.get(base)
        if not type_sql:
            return None

    # A NOT NULL column cannot be added to a table that already has rows
    # unless it carries a default, so those are left to a real migration.
    if not column.nullable and column.default is None and column.server_default is None:
        return None

    return f"{column.name} {type_sql}"


def run(engine: Engine) -> list[str]:
    """Add any columns the models have and the database does not.

    Returns what it changed, so startup can log it.
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    applied: list[str] = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all will make it

        have = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in have:
                continue

            ddl = _column_sql(column)
            if ddl is None:
                log.warning(
                    "Cannot add %s.%s automatically — recreate the database "
                    "or migrate it by hand.",
                    table.name,
                    column.name,
                )
                continue

            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {ddl}"))
            applied.append(f"{table.name}.{column.name}")

    return applied


def normalise_roles(engine: Engine) -> int:
    """Fold roles from the old six-role model into the two that remain.

    The old job title is kept in `title`, so nothing about who does what is
    lost — only the access level changes.
    """
    from .services.auth import LEGACY_ROLES

    moved = 0
    with engine.begin() as conn:
        for old, new in LEGACY_ROLES.items():
            result = conn.execute(
                text(
                    "UPDATE staff SET title = COALESCE(title, :old), role = :new "
                    "WHERE role = :old"
                ),
                {"old": old, "new": new},
            )
            moved += result.rowcount or 0
    return moved


def backfill_passwords(engine: Engine, password_hash: str) -> int:
    """Give demo accounts a password after the column has just been added.

    Without this, every account carries a NULL hash and sign-in fails with
    "that email and password do not match" — which looks like a broken login
    rather than a half-finished upgrade.
    """
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE staff SET password_hash = :h "
                "WHERE password_hash IS NULL OR password_hash = ''"
            ),
            {"h": password_hash},
        )
        return result.rowcount or 0
