from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sanad_api.catalogues import Catalogues, load_catalogues
from sanad_api.config import Settings
from sanad_api.main import create_app
from tests.helpers import FACILITY_PASSWORD, REVIEWER_PASSWORD, Api, ManualClock

REPO_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def clock() -> ManualClock:
    return ManualClock()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        repo_root=REPO_ROOT,
        commit_sha="test-sha",
        reviewer_password=REVIEWER_PASSWORD,
        mock_facility_password=FACILITY_PASSWORD,
        cases_per_minute_per_ip=10_000,
        logins_per_minute_per_ip=10_000,
    )


@pytest.fixture
def app(settings: Settings, clock: ManualClock) -> FastAPI:
    return create_app(settings, clock)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def api(client: TestClient, app: FastAPI, clock: ManualClock) -> Api:
    return Api(client, app, clock)


@pytest.fixture(scope="session")
def catalogues() -> Catalogues:
    return load_catalogues(REPO_ROOT)
