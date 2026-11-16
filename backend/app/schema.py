"""Keeps the database in step with app/models.py without losing data.

Creates missing tables and adds missing columns (using each column's server default so existing rows
stay valid). It never drops or changes existing columns. Runs at startup and from scripts/init_db.py.
"""

import logging

from sqlalchemy import Engine, inspect, text
from sqlalchemy.schema import CreateColumn

from . import models  # noqa: F401  (registers the tables)
from .db import Base

logger = logging.getLogger("study_mate.schema")


def ensure_schema(engine: Engine) -> list[str]:
    """Returns a list of the changes made."""
    Base.metadata.create_all(engine)  # new tables only

    changes: list[str] = []
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            existing = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                ddl = str(CreateColumn(column).compile(dialect=engine.dialect)).strip()
                if not column.nullable and column.server_default is None:
                    # Existing rows would have no value, so add it as optional rather than fail.
                    ddl = ddl.replace(" NOT NULL", "")
                conn.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {ddl}"))
                changes.append(f"{table.name}.{column.name}")
    for change in changes:
        logger.info("Added column %s", change)
    return changes
