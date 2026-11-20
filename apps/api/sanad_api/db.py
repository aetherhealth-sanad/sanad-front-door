"""Database engine, base class and column types. SQLite through SQLAlchemy (plan section 2)."""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator[datetime]):
    """Stores UTC as a naive value and hands back an aware one, so SQLite never drops the zone."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("naive datetimes are not stored")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)


def make_engine(database_url: str) -> Engine:
    if not database_url.startswith("sqlite"):
        if os.environ.get("VERCEL"):
            # Serverless instances must not hold idle connection pools open, and disabling
            # psycopg prepared statements keeps Supabase Transaction Pooler (port 6543) safe.
            connect_args = {"prepare_threshold": None} if "+psycopg" in database_url else {}
            return create_engine(database_url, poolclass=NullPool, connect_args=connect_args)
        return create_engine(database_url)
    engine = create_engine(database_url, connect_args={"check_same_thread": False, "timeout": 15})

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection: Any, _record: Any) -> None:
        # Take over transaction control from pysqlite so every transaction can start IMMEDIATE.
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    @event.listens_for(engine, "begin")
    def _on_begin(connection: Any) -> None:
        # Each request is one serialised write transaction, so the gate reads consent, review
        # and case state that cannot change underneath it (AC-12.3).
        connection.exec_driver_sql("BEGIN IMMEDIATE")

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
