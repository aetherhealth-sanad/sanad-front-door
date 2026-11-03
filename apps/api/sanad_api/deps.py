"""Request-scoped dependencies shared by every router."""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from sanad_api.catalogues import Catalogues
from sanad_api.clock import Clock
from sanad_api.config import Settings


def get_db(request: Request) -> Iterator[Session]:
    db: Session = request.app.state.session_factory()
    try:
        yield db
    finally:
        db.close()


def get_clock(request: Request) -> Clock:
    clock: Clock = request.app.state.clock
    return clock


def get_settings(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


def get_catalogues(request: Request) -> Catalogues:
    catalogues: Catalogues = request.app.state.catalogues
    return catalogues
