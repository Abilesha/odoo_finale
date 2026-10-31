"""Create or validate the complete Royal Knot schema in the configured DB.

Usage (PowerShell):
    $env:DATABASE_URL = 'postgresql+psycopg://user:password@host:5432/royalknot'
    python backend/create_schema.py

This never inserts demo/static records. It is safe to run repeatedly.
"""
from sqlalchemy import inspect, text

from app.db import Base, engine
# Importing the models registers every mapped table with Base.metadata.
from app import models  # noqa: F401


def main() -> None:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))

    Base.metadata.create_all(bind=engine)
    tables = inspect(engine).get_table_names()
    print(f"Connected to {engine.url.get_backend_name()}. Created/validated {len(tables)} tables:")
    print(", ".join(tables))


if __name__ == "__main__":
    main()
