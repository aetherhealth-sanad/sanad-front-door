"""Request context: a request ID, `Cache-Control: no-store` on every response, and a thin log.

The log records method, path template, status, duration and request ID. It never records
bodies, query strings or tokens (API design section 1, INV-03).
"""

from __future__ import annotations

import logging
import secrets
import time
from typing import Any

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from sanad_api.observability import LangfuseTelemetry

logger = logging.getLogger("sanad.request")


def _is_emergency_input_path(path: str) -> bool:
    """Keep telemetry out of the routes that write facts and run the emergency gate."""
    segments = [segment for segment in path.split("/") if segment]
    if len(segments) < 4 or segments[0] != "api" or segments[1] != "cases":
        return False
    action = segments[3:]
    return action in (
        ["safety-check"],
        ["answers"],
        ["profile", "sample"],
        ["profile", "upload"],
    ) or action[:1] == ["observations"]


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, telemetry: LangfuseTelemetry | None = None) -> None:
        self.app = app
        self.telemetry = telemetry or LangfuseTelemetry()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = f"req-{secrets.token_hex(4)}"
        scope.setdefault("state", {})["request_id"] = request_id
        started = time.perf_counter()
        status: dict[str, int] = {"code": 500}

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["Cache-Control"] = "no-store"
                headers["X-Request-ID"] = request_id
                status["code"] = int(message["status"])
            await send(message)

        settings: Any = getattr(scope.get("app"), "state", None)
        commit_sha = getattr(getattr(settings, "settings", None), "commit_sha", "dev")
        with self.telemetry.request_span(
            commit_sha,
            excluded=_is_emergency_input_path(str(scope.get("path", ""))),
        ) as span:
            try:
                await self.app(scope, receive, send_with_headers)
            finally:
                route: Any = scope.get("route")
                template = getattr(route, "path", "unmatched")
                duration_ms = int((time.perf_counter() - started) * 1000)
                logger.info(
                    "%s %s %s %dms %s",
                    scope["method"],
                    template,
                    status["code"],
                    duration_ms,
                    request_id,
                )
                self.telemetry.finish_request(
                    span,
                    method=str(scope.get("method", "OTHER")),
                    route_template=str(template),
                    status_code=status["code"],
                    duration_ms=duration_ms,
                )
