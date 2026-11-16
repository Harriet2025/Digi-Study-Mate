"""Creates the MySQL database (if missing) and all tables, and writes schema.sql.

Run from the backend folder:   .venv\\Scripts\\python -m scripts.init_db
Only writes schema.sql (no DB):  .venv\\Scripts\\python -m scripts.init_db --schema-only
"""

import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.dialects import mysql
from sqlalchemy.schema import CreateIndex, CreateTable

from app import models  # noqa: F401  (registers the tables)
from app.config import BACKEND_DIR, get_settings
from app.db import Base

SCHEMA_FILE = BACKEND_DIR / "schema.sql"


def write_schema_sql(path: Path = SCHEMA_FILE) -> None:
    dialect = mysql.dialect()
    statements = [
        "-- Study Mate MySQL schema. Generated from app/models.py by scripts/init_db.py; don't edit by hand.",
        "CREATE DATABASE IF NOT EXISTS study_mate CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "USE study_mate;",
    ]
    for table in Base.metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=dialect)).strip()
        statements.append(f"{ddl} ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;")
        for index in sorted(table.indexes, key=lambda i: i.name or ""):
            statements.append(str(CreateIndex(index).compile(dialect=dialect)).strip() + ";")
    path.write_text("\n\n".join(statements) + "\n", encoding="utf-8")
    print(f"Wrote {path.relative_to(BACKEND_DIR)}")


def create_database_and_tables() -> None:
    settings = get_settings()
    if settings.database_url:
        engine = create_engine(settings.database_url)
    else:
        url = settings.sqlalchemy_url()
        # Connect without a database first so we can create it.
        server = create_engine(settings.sqlalchemy_url(with_database=False))
        with server.connect() as conn:
            conn.execute(
                text(f"CREATE DATABASE IF NOT EXISTS `{settings.mysql_database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
            )
        server.dispose()
        engine = create_engine(url)

    Base.metadata.create_all(engine)
    with engine.connect() as conn:
        tables = sorted(Base.metadata.tables)
        print(f"Database ready: {engine.url.render_as_string(hide_password=True)}")
        print("Tables:", ", ".join(tables))
    engine.dispose()


if __name__ == "__main__":
    write_schema_sql()
    if "--schema-only" not in sys.argv:
        create_database_and_tables()
