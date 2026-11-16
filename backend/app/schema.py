"""Keeps the database in step with app/models.py without losing data.

- Creates missing tables.
- Adds missing columns (with their server defaults so existing rows stay valid), plus their foreign keys.
- Applies a few explicit, idempotent column changes (relaxing NOT NULL, widening ENUMs).
It never drops tables or columns. Runs at startup and from scripts/init_db.py.
"""

import logging

from sqlalchemy import Engine, inspect, text
from sqlalchemy.schema import CreateColumn

from . import models  # noqa: F401  (registers the tables)
from .db import Base
from .models import STUDY_EVENT_KINDS

logger = logging.getLogger("study_mate.schema")


def ensure_schema(engine: Engine) -> list[str]:
    """Returns a list of the changes made."""
    Base.metadata.create_all(engine)  # new tables only

    changes: list[str] = []
    is_mysql = engine.dialect.name == "mysql"
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

                # ADD COLUMN doesn't carry the foreign key; add it so cascades work (MySQL only).
                for fk in column.foreign_keys if is_mysql else ():
                    on_delete = f" ON DELETE {fk.ondelete}" if fk.ondelete else ""
                    conn.execute(
                        text(
                            f"ALTER TABLE {table.name} ADD CONSTRAINT fk_{table.name}_{column.name} "
                            f"FOREIGN KEY ({column.name}) REFERENCES {fk.column.table.name} ({fk.column.name}){on_delete}"
                        )
                    )

        if is_mysql:
            changes += _mysql_column_changes(conn, inspector)

    for change in changes:
        logger.info("Schema change: %s", change)
    return changes


def _mysql_column_changes(conn, inspector) -> list[str]:
    changes = []
    columns = {c["name"]: c for c in inspector.get_columns("flashcards")}
    if not columns["episode_id"]["nullable"]:
        # Flashcards can now belong to a study guide instead of an audio lesson.
        conn.execute(text("ALTER TABLE flashcards MODIFY episode_id VARCHAR(36) NULL"))
        changes.append("flashcards.episode_id nullable")

    kind = next(c for c in inspector.get_columns("study_events") if c["name"] == "kind")
    current = set(getattr(kind["type"], "enums", ()) or ())
    if not set(STUDY_EVENT_KINDS) <= current:
        values = ", ".join(f"'{k}'" for k in STUDY_EVENT_KINDS)
        conn.execute(text(f"ALTER TABLE study_events MODIFY kind ENUM({values}) NOT NULL"))
        changes.append("study_events.kind values")
    return changes
