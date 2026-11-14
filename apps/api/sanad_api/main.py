"""App factory. Run with `uvicorn sanad_api.main:create_app --factory`.

By default the API makes no model call and needs no model key, cloud service or network to run
(INV-01). An operator can turn on the optional Azure OpenAI adapter for typed chat text
(T4.5, CC-011); the emergency rules, consent, case state and triage never depend on it.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Every model module is imported so that create_all knows every table.
from sanad_api.audit import models as _audit_models  # noqa: F401
from sanad_api.auth import models as _auth_models  # noqa: F401
from sanad_api.auth.rate_limit import RateLimiter
from sanad_api.auth.routes import router as auth_router
from sanad_api.cases import models as _case_models  # noqa: F401
from sanad_api.cases.routes import router as cases_router
from sanad_api.catalogues import load_catalogues
from sanad_api.chat.routes import router as chat_router
from sanad_api.clock import Clock, SystemClock
from sanad_api.config import Settings
from sanad_api.consent import models as _consent_models  # noqa: F401
from sanad_api.consent.routes import router as consent_router
from sanad_api.db import Base, make_engine, make_session_factory
from sanad_api.errors import register_error_handlers
from sanad_api.facts import models as _fact_models  # noqa: F401
from sanad_api.intake.routes import router as intake_router
from sanad_api.middleware import RequestContextMiddleware
from sanad_api.mock_facility.routes import router as mock_facility_router
from sanad_api.model_adapter.factory import build_model_adapter
from sanad_api.model_adapter.port import ModelAdapter
from sanad_api.model_adapter.runs import router as model_runs_router
from sanad_api.navigation import models as _navigation_models  # noqa: F401
from sanad_api.navigation.routes import router as navigation_router
from sanad_api.navigation.service import purge_expired_navigation
from sanad_api.observations import models as _observation_models  # noqa: F401
from sanad_api.observations.routes import router as observations_router
from sanad_api.psychosocial import models as _psychosocial_models  # noqa: F401
from sanad_api.psychosocial.routes import router as psychosocial_router
from sanad_api.referral import models as _referral_models  # noqa: F401
from sanad_api.referral.routes import router as referral_router
from sanad_api.reports import models as _report_models  # noqa: F401
from sanad_api.reports.routes import router as reports_router
from sanad_api.review import models as _review_models  # noqa: F401
from sanad_api.review.routes import router as review_router
from sanad_api.tracking.routes import router as tracking_router

DESCRIPTION = (
    "Sanad referral-flow API. Research prototype, not a medical device. Screening, not "
    "diagnosis. Synthetic data only. Rules are drafts (CLINICAL_TBD), review is simulated and "
    "every referral is Mock. Nothing is sent outside the app."
)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Purge session-scoped navigation progress after anonymous session expiry."""
    def purge_expired() -> None:
        db = app.state.session_factory()
        try:
            purge_expired_navigation(db, app.state.clock.now())
            db.commit()
        except Exception:
            db.rollback()
            logging.getLogger("sanad.retention").exception("Navigation retention cleanup failed")
        finally:
            db.close()

    async def purge_loop() -> None:
        while True:
            await asyncio.to_thread(purge_expired)
            await asyncio.sleep(30)

    task = asyncio.create_task(purge_loop())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


def _configure_logging() -> None:
    logger = logging.getLogger("sanad")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(name)s %(levelname)s %(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)


def create_app(
    settings: Settings | None = None,
    clock: Clock | None = None,
    model_adapter: ModelAdapter | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    _configure_logging()
    catalogues = load_catalogues(settings.repo_root)
    model_adapter = model_adapter or build_model_adapter(settings)
    logging.getLogger("sanad.model").info(
        "model adapter: %s (%s)", model_adapter.provider, model_adapter.model_id
    )
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)

    app = FastAPI(
        title="Sanad API",
        version="0.1.0",
        description=DESCRIPTION,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
        lifespan=_lifespan,
    )
    app.state.settings = settings
    app.state.clock = clock or SystemClock()
    app.state.catalogues = catalogues
    app.state.model_adapter = model_adapter
    app.state.engine = engine
    app.state.session_factory = make_session_factory(engine)
    app.state.rate_limiters = {
        "cases": RateLimiter(settings.cases_per_minute_per_ip),
        "login": RateLimiter(settings.logins_per_minute_per_ip),
    }
    register_error_handlers(app)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/version", tags=["meta"])
    def version() -> dict[str, Any]:
        """Deployed commit SHA. Also the deploy health check (AC-01.4)."""
        return {"commit_sha": settings.commit_sha}

    api = APIRouter(prefix="/api")
    for router in (
        cases_router,
        auth_router,
        consent_router,
        intake_router,
        chat_router,
        navigation_router,
        observations_router,
        psychosocial_router,
        reports_router,
        review_router,
        referral_router,
        mock_facility_router,
        tracking_router,
        model_runs_router,
    ):
        api.include_router(router)
    app.include_router(api)
    return app
